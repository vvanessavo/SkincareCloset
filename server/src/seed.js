import { fileURLToPath } from 'node:url';
import { databasePath, openDatabase } from './db.js';
import { KBEAUTY_PRODUCTS } from './sampleProducts.js';

export { KBEAUTY_PRODUCTS };

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
