import { randomUUID } from 'node:crypto';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express, { Router } from 'express';
import { MAX_IMAGE_BYTES, detectImageExtension, downloadImage, imageUrl } from '../images.js';

const TEXT_FIELDS = ['brand', 'category', 'notes', 'catalog_code'];
const DATE_FIELDS = ['opened_on', 'expires_on'];

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  // The round trip rejects dates that roll over, like 2026-02-31.
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function parseProduct(body) {
  const input = body ?? {};
  const errors = [];
  const product = {};

  if (typeof input.name === 'string' && input.name.trim()) {
    product.name = input.name.trim();
  } else {
    errors.push('name is required');
  }

  for (const field of TEXT_FIELDS) {
    const value = input[field] ?? null;
    if (value !== null && typeof value !== 'string') errors.push(`${field} must be a string`);
    product[field] = typeof value === 'string' ? value.trim() || null : null;
  }

  for (const field of DATE_FIELDS) {
    const value = input[field] ?? null;
    if (value !== null && !isValidDate(value)) errors.push(`${field} must be a YYYY-MM-DD date`);
    product[field] = value;
  }

  const ingredients = input.ingredients ?? [];
  if (Array.isArray(ingredients) && ingredients.every((item) => typeof item === 'string')) {
    product.ingredients = JSON.stringify(ingredients.map((item) => item.trim()).filter(Boolean));
  } else {
    errors.push('ingredients must be an array of strings');
  }

  return { product, errors };
}

function serialize({ image, ...row }) {
  return { ...row, ingredients: JSON.parse(row.ingredients), image_url: imageUrl(image) };
}

export function productsRouter(db, uploadsDir) {
  const router = Router();

  function removeImageFile(filename) {
    if (filename) rmSync(join(uploadsDir, filename), { force: true });
  }

  const selectAll = db.prepare('SELECT * FROM products ORDER BY name COLLATE NOCASE, id');
  const selectOne = db.prepare('SELECT * FROM products WHERE id = ?');
  const insert = db.prepare(`
    INSERT INTO products
      (name, brand, category, ingredients, opened_on, expires_on, notes, catalog_code)
    VALUES
      (@name, @brand, @category, @ingredients, @opened_on, @expires_on, @notes, @catalog_code)
  `);
  const update = db.prepare(`
    UPDATE products
    SET name = @name, brand = @brand, category = @category, ingredients = @ingredients,
        opened_on = @opened_on, expires_on = @expires_on, notes = @notes,
        updated_at = datetime('now')
    WHERE id = @id
  `);
  const updateImage = db.prepare(`
    UPDATE products SET image = ?, updated_at = datetime('now') WHERE id = ?
  `);
  const remove = db.prepare('DELETE FROM products WHERE id = ?');
  const selectCatalogImage = db.prepare('SELECT image_url FROM catalog_products WHERE code = ?').pluck();

  // A new filename on each upload stops browsers showing a cached old picture.
  function storeImage(row, data) {
    const filename = `${randomUUID()}.${detectImageExtension(data)}`;
    writeFileSync(join(uploadsDir, filename), data);
    updateImage.run(filename, row.id);
    removeImageFile(row.image);
    return serialize(selectOne.get(row.id));
  }

  router.get('/', (req, res) => {
    res.json(selectAll.all().map(serialize));
  });

  router.get('/:id', (req, res) => {
    const row = selectOne.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(serialize(row));
  });

  router.post('/', (req, res) => {
    const { product, errors } = parseProduct(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const { lastInsertRowid } = insert.run(product);
    res.status(201).json(serialize(selectOne.get(lastInsertRowid)));
  });

  router.put('/:id', (req, res) => {
    const { product, errors } = parseProduct(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const { changes } = update.run({ ...product, id: req.params.id });
    if (!changes) return res.status(404).json({ error: 'Product not found' });
    res.json(serialize(selectOne.get(req.params.id)));
  });

  router.put('/:id/image', express.raw({ type: () => true, limit: MAX_IMAGE_BYTES }), (req, res) => {
    const row = selectOne.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });

    if (!detectImageExtension(req.body)) {
      return res.status(415).json({ error: 'Picture must be a JPEG, PNG or WebP image' });
    }

    res.json(storeImage(row, req.body));
  });

  // The URL comes from the catalog, never the request, so this can't fetch arbitrary addresses.
  router.put('/:id/image/from-catalog', async (req, res) => {
    const row = selectOne.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });

    const url = selectCatalogImage.get(String(req.body?.code));
    if (!url) return res.status(404).json({ error: 'Catalog picture not found' });

    let data;
    try {
      data = await downloadImage(url);
    } catch {
      return res.status(502).json({ error: 'Could not download the picture' });
    }
    if (!detectImageExtension(data)) {
      return res.status(502).json({ error: 'The catalog picture is not a supported image' });
    }

    res.json(storeImage(row, data));
  });

  router.delete('/:id/image', (req, res) => {
    const row = selectOne.get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Product not found' });

    updateImage.run(null, row.id);
    removeImageFile(row.image);
    res.json(serialize(selectOne.get(row.id)));
  });

  router.delete('/:id', (req, res) => {
    try {
      const row = selectOne.get(req.params.id);
      const { changes } = remove.run(req.params.id);
      if (!changes) return res.status(404).json({ error: 'Product not found' });
      removeImageFile(row.image);
      res.status(204).end();
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return res.status(409).json({ error: 'Product is used in a routine' });
      }
      throw err;
    }
  });

  return router;
}
