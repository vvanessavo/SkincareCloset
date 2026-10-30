import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import Database from 'better-sqlite3';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { MAX_IMAGE_BYTES } from '../src/images.js';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]);

describe('product pictures', () => {
  let dir;
  let db;
  let api;
  let product;

  function upload(id, data, type = 'image/png') {
    return api.put(`/api/products/${id}/image`).set('Content-Type', type).send(data);
  }

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'skincare-uploads-'));
    db = openDatabase(':memory:');
    api = request(createApp(db, dir));
    ({ body: product } = await api.post('/api/products').send({ name: 'Serum' }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('starts without a picture', () => {
    assert.equal(product.image_url, null);
  });

  it('stores and serves an uploaded picture', async () => {
    const res = await upload(product.id, png).expect(200);

    assert.match(res.body.image_url, /^\/api\/uploads\/[\w-]+\.png$/);
    const image = await api.get(res.body.image_url).expect(200).expect('Content-Type', /image\/png/);
    assert.deepEqual(image.body, png);
  });

  it('accepts JPEG and WebP by their contents', async () => {
    const jpegRes = await upload(product.id, jpeg, 'image/jpeg').expect(200);
    const webpRes = await upload(product.id, webp, 'image/webp').expect(200);

    assert.match(jpegRes.body.image_url, /\.jpg$/);
    assert.match(webpRes.body.image_url, /\.webp$/);
  });

  it('rejects files that are not supported images', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');

    await upload(product.id, svg, 'image/svg+xml').expect(415);
    await upload(product.id, svg, 'image/png').expect(415);
    await upload(product.id, Buffer.alloc(0)).expect(415);
    await api.put(`/api/products/${product.id}/image`).send({ a: 1 }).expect(415);

    assert.deepEqual(readdirSync(dir), []);
  });

  it('rejects pictures over the size limit', async () => {
    await upload(product.id, Buffer.concat([png, Buffer.alloc(MAX_IMAGE_BYTES)])).expect(413);

    assert.deepEqual(readdirSync(dir), []);
  });

  it('returns 404 for pictures of unknown products', async () => {
    await upload(999, png).expect(404);
    await api.delete('/api/products/999/image').expect(404);
    assert.deepEqual(readdirSync(dir), []);
  });

  it('replaces the old picture file', async () => {
    const { body: first } = await upload(product.id, png);
    const { body: second } = await upload(product.id, jpeg, 'image/jpeg');

    assert.notEqual(second.image_url, first.image_url);
    assert.equal(readdirSync(dir).length, 1);
    await api.get(first.image_url).expect(404);
  });

  it('removes a picture', async () => {
    await upload(product.id, png);

    const res = await api.delete(`/api/products/${product.id}/image`).expect(200);

    assert.equal(res.body.image_url, null);
    assert.deepEqual(readdirSync(dir), []);
  });

  it('keeps the picture when the product is edited', async () => {
    const { body: uploaded } = await upload(product.id, png);

    const res = await api.put(`/api/products/${product.id}`).send({ name: 'Renamed' }).expect(200);

    assert.equal(res.body.image_url, uploaded.image_url);
  });

  it('removes the picture file with the product', async () => {
    await upload(product.id, png);

    await api.delete(`/api/products/${product.id}`).expect(204);

    assert.deepEqual(readdirSync(dir), []);
  });

  it('keeps the picture when a product in a routine cannot be deleted', async () => {
    const { body: uploaded } = await upload(product.id, png);
    const { body: routine } = await api.post('/api/routines').send({ name: 'AM', period: 'AM' });
    await api.post(`/api/routines/${routine.id}/steps`).send({ product_id: product.id });

    await api.delete(`/api/products/${product.id}`).expect(409);

    await api.get(uploaded.image_url).expect(200);
  });

  it('includes the picture on routine steps', async () => {
    const { body: uploaded } = await upload(product.id, png);
    const { body: routine } = await api.post('/api/routines').send({ name: 'AM', period: 'AM' });

    const res = await api
      .post(`/api/routines/${routine.id}/steps`)
      .send({ product_id: product.id })
      .expect(201);

    assert.equal(res.body.steps[0].product.image_url, uploaded.image_url);
  });
});

describe('openDatabase', () => {
  it('adds the image column to an existing database and keeps its rows', () => {
    const dir = mkdtempSync(join(tmpdir(), 'skincare-db-'));
    const path = join(dir, 'old.db');
    const old = new Database(path);
    old.exec(`
      CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        brand TEXT,
        category TEXT,
        ingredients TEXT NOT NULL DEFAULT '[]',
        opened_on TEXT,
        expires_on TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT INTO products (name) VALUES ('Toner');
    `);
    old.close();

    openDatabase(path).close();
    const db = openDatabase(path);

    const row = db.prepare('SELECT name, image FROM products').get();
    assert.deepEqual({ ...row }, { name: 'Toner', image: null });
    db.close();
    assert.ok(existsSync(path));
    rmSync(dir, { recursive: true, force: true });
  });
});
