import { createGunzip } from 'node:zlib';
import { createInterface } from 'node:readline';

export const CATALOG_IMAGE_HOST = 'images.openbeautyfacts.org';

const NOT_SKINCARE = /\b(hair|shampoo|conditioner|tooth|deodorant|nail|lip|mouthwash)/;
const CATEGORY_RULES = [
  ['sunscreen', /\bsun\s?(cream|screen|block|stick|serum|milk|fluid)|\bspf\b/],
  ['eye cream', /\beye\s(cream|serum|gel|balm)/],
  ['cleanser', /cleans|face wash|facial wash|micellar/],
  ['toner', /\b(toner|tonic)\b/],
  ['essence', /\bessence\b/],
  ['serum', /\b(serum|ampoule)\b/],
  ['mask', /\bmask\b/],
  ['oil', /\b(face|facial)\soil\b/],
  ['moisturizer', /moisturi[sz]|\b(face|facial|day|night|gel)\scream\b/],
];

export function normalizeSearchText(text) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function detectCategory(text) {
  const normalized = normalizeSearchText(text);
  if (NOT_SKINCARE.test(normalized)) return null;
  return CATEGORY_RULES.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

// Export text often starts with a label, sometimes in several languages.
export function cleanIngredients(text) {
  return text
    .replace(/^\s*(ingredients?|ingr[ée]dients?|inci)\b[\s/:.-]*((ingredients?|ingr[ée]dients?)\b[\s/:.-]*)?/i, '')
    .trim();
}

export function parseCatalogRow(row) {
  const code = row.code?.trim();
  const name = row.product_name?.trim();
  if (!code || !name) return null;

  const brands = row.brands?.trim() ?? '';
  const brand = brands.split(',')[0].trim() || null;
  const image = row.image_url?.trim() ?? '';

  // Barcodes and bare brand names don't identify a product.
  if (/^[\d\s]+$/.test(name) || normalizeSearchText(name) === normalizeSearchText(brand ?? '')) {
    return null;
  }

  return {
    code,
    name,
    brand,
    category: detectCategory(`${name} ${row.categories_en ?? ''}`),
    ingredients: cleanIngredients(row.ingredients_text ?? ''),
    image_url: image.startsWith(`https://${CATALOG_IMAGE_HOST}/`) ? image : null,
    // All brands, because rows often list several, as in "L'Oréal, L'Oréal Paris".
    search_text: normalizeSearchText(`${brands} ${name}`),
  };
}

// The export is tab-separated with no quoting, one product per line.
export async function readCatalogRows(input) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  const rows = [];
  let columns = null;

  for await (const line of lines) {
    if (!columns) {
      columns = line.split('\t');
      for (const column of ['code', 'product_name', 'brands', 'ingredients_text', 'image_url']) {
        if (!columns.includes(column)) throw new Error(`Export is missing the ${column} column`);
      }
      continue;
    }

    const values = line.split('\t');
    const row = parseCatalogRow(Object.fromEntries(columns.map((name, i) => [name, values[i]])));
    if (row) rows.push(row);
  }

  return rows;
}

export function replaceCatalog(db, rows) {
  // An empty result means a bad export, so it must not wipe a working catalog.
  if (!rows.length) throw new Error('Export has no usable products');

  const insert = db.prepare(`
    INSERT OR REPLACE INTO catalog_products
      (code, name, brand, category, ingredients, image_url, search_text)
    VALUES (@code, @name, @brand, @category, @ingredients, @image_url, @search_text)
  `);

  db.transaction(() => {
    db.exec('DELETE FROM catalog_products');
    for (const row of rows) insert.run(row);
  })();

  return db.prepare('SELECT COUNT(*) FROM catalog_products').pluck().get();
}

export function gunzip(input) {
  return input.pipe(createGunzip());
}
