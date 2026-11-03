// Writes the small catalog the public demo searches. Photos are left out, so only
// Open Beauty Facts data (ODbL) is published, and that's credited in the app.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { databasePath, openDatabase } from './db.js';

const BRANDS = [
  'cerave', 'la roche-posay', 'the ordinary', 'cosrx', 'laneige', 'neutrogena', "paula's choice",
  'klairs', 'beauty of joseon', 'round lab', 'innisfree', 'missha', 'some by mi', 'anua',
  'skin1004', 'torriden', 'garnier', "l'oreal", 'nivea', 'eucerin', 'avene', 'bioderma',
  'vichy', 'clinique', 'kiehl', 'drunk elephant', 'olay', 'aveeno', 'cetaphil',
];
// These only make skincare, so a missing category doesn't mean it's something else.
const SKINCARE_ONLY = [
  'the ordinary', 'cosrx', 'laneige', "paula's choice", 'klairs', 'beauty of joseon', 'round lab',
  'innisfree', 'missha', 'some by mi', 'anua', 'skin1004', 'torriden', 'drunk elephant',
];
const PER_BRAND = 18;

export function selectDemoCatalog(db) {
  const rows = db
    .prepare(`
      SELECT code, name, brand, category, ingredients, search_text
      FROM catalog_products
      WHERE ingredients != ''
      ORDER BY length(ingredients) DESC, code
    `)
    .all();

  const counts = new Map();
  return rows.filter((row) => {
    const brand = BRANDS.find((name) => row.search_text.includes(name));
    if (!brand || (!row.category && !SKINCARE_ONLY.includes(brand))) return false;
    if ((counts.get(brand) ?? 0) >= PER_BRAND) return false;
    counts.set(brand, (counts.get(brand) ?? 0) + 1);
    return true;
  }).map((row) => ({ ...row, image_url: null }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? fileURLToPath(new URL('../../client/src/demo/catalog.json', import.meta.url));
  const rows = selectDemoCatalog(openDatabase(databasePath));
  writeFileSync(out, `${JSON.stringify(rows)}\n`);
  console.log(`Wrote ${rows.length} products to ${out}`);
}
