import { fileURLToPath } from 'node:url';
import { databasePath, openDatabase } from './db.js';

// Key ingredients only, not full INCI lists.
export const KBEAUTY_PRODUCTS = [
  {
    name: 'Advanced Snail 96 Mucin Power Essence',
    brand: 'COSRX',
    category: 'essence',
    ingredients: ['snail secretion filtrate', 'betaine', 'sodium hyaluronate', 'panthenol'],
  },
  {
    name: 'AHA/BHA Clarifying Treatment Toner',
    brand: 'COSRX',
    category: 'toner',
    ingredients: ['glycolic acid', 'salicylic acid', 'niacinamide'],
  },
  {
    name: 'The Retinol 0.1 Cream',
    brand: 'COSRX',
    category: 'treatment',
    ingredients: ['retinol', 'squalane'],
  },
  {
    name: 'Low pH Good Morning Gel Cleanser',
    brand: 'COSRX',
    category: 'cleanser',
    ingredients: ['tea tree oil', 'betaine salicylate'],
  },
  {
    name: 'Relief Sun: Rice + Probiotics SPF50+',
    brand: 'Beauty of Joseon',
    category: 'sunscreen',
    ingredients: ['rice extract', 'grain ferment extract', 'niacinamide'],
  },
  {
    name: 'Glow Serum: Propolis + Niacinamide',
    brand: 'Beauty of Joseon',
    category: 'serum',
    ingredients: ['propolis extract', 'niacinamide'],
  },
  {
    name: 'Freshly Juiced Vitamin Drop',
    brand: 'Dear, Klairs',
    category: 'serum',
    ingredients: ['ascorbic acid'],
  },
  {
    name: 'Heartleaf 77 Soothing Toner',
    brand: 'Anua',
    category: 'toner',
    ingredients: ['houttuynia cordata extract'],
  },
  {
    name: '1025 Dokdo Toner',
    brand: 'Round Lab',
    category: 'toner',
    ingredients: ['sea water', 'panthenol'],
  },
  {
    name: 'AHA BHA PHA 30 Days Miracle Toner',
    brand: 'Some By Mi',
    category: 'toner',
    ingredients: ['glycolic acid', 'salicylic acid', 'gluconolactone', 'niacinamide'],
  },
];

// Skips products already in the library, so it's safe to run more than once.
export function seedProducts(db, products = KBEAUTY_PRODUCTS) {
  const exists = db.prepare('SELECT 1 FROM products WHERE name = ? AND brand = ?').pluck();
  const insert = db.prepare(`
    INSERT INTO products (name, brand, category, ingredients)
    VALUES (@name, @brand, @category, @ingredients)
  `);

  const seed = db.transaction(() => {
    let added = 0;
    for (const product of products) {
      if (exists.get(product.name, product.brand)) continue;
      insert.run({ ...product, ingredients: JSON.stringify(product.ingredients) });
      added += 1;
    }
    return added;
  });

  return seed();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const added = seedProducts(openDatabase(databasePath));
  console.log(`Added ${added} products`);
}
