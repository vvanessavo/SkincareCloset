import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

const serum = {
  name: 'Vitamin C Serum',
  brand: 'Acme',
  category: 'serum',
  ingredients: ['ascorbic acid', 'ferulic acid'],
  opened_on: '2026-01-15',
  expires_on: '2026-07-15',
  notes: 'Keep in the fridge',
};

describe('/api/products', () => {
  let db;
  let api;

  beforeEach(() => {
    db = openDatabase(':memory:');
    api = request(createApp(db));
  });

  it('creates a product', async () => {
    const res = await api.post('/api/products').send(serum).expect(201);

    assert.equal(typeof res.body.id, 'number');
    assert.equal(res.body.name, serum.name);
    assert.deepEqual(res.body.ingredients, serum.ingredients);
    assert.equal(res.body.expires_on, serum.expires_on);
  });

  it('creates a product from only a name', async () => {
    const res = await api.post('/api/products').send({ name: '  Cleanser ' }).expect(201);

    assert.equal(res.body.name, 'Cleanser');
    assert.equal(res.body.brand, null);
    assert.deepEqual(res.body.ingredients, []);
  });

  it('rejects invalid products', async () => {
    const invalid = [
      {},
      { name: '   ' },
      { name: 'A', brand: 42 },
      { name: 'A', ingredients: 'retinol' },
      { name: 'A', ingredients: [1] },
      { name: 'A', expires_on: 'soon' },
      { name: 'A', expires_on: '2026-02-31' },
      { name: 'A', opened_on: '2026-13-01' },
    ];

    for (const body of invalid) {
      await api.post('/api/products').send(body).expect(400);
    }
    const res = await api.get('/api/products').expect(200);
    assert.deepEqual(res.body, []);
  });

  it('returns 400 as JSON for a malformed body', async () => {
    const res = await api
      .post('/api/products')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);

    assert.equal(typeof res.body.error, 'string');
  });

  it('lists products by name', async () => {
    await api.post('/api/products').send({ name: 'toner' });
    await api.post('/api/products').send({ name: 'Cleanser' });

    const res = await api.get('/api/products').expect(200);

    assert.deepEqual(
      res.body.map((product) => product.name),
      ['Cleanser', 'toner'],
    );
  });

  it('gets a product by id', async () => {
    const { body: created } = await api.post('/api/products').send(serum);

    const res = await api.get(`/api/products/${created.id}`).expect(200);

    assert.deepEqual(res.body, created);
  });

  it('replaces a product', async () => {
    const { body: created } = await api.post('/api/products').send(serum);

    const res = await api
      .put(`/api/products/${created.id}`)
      .send({ name: 'Renamed', ingredients: ['niacinamide'] })
      .expect(200);

    assert.equal(res.body.name, 'Renamed');
    assert.equal(res.body.brand, null);
    assert.deepEqual(res.body.ingredients, ['niacinamide']);
  });

  it('rejects an invalid replacement', async () => {
    const { body: created } = await api.post('/api/products').send(serum);

    await api.put(`/api/products/${created.id}`).send({ name: '' }).expect(400);

    const res = await api.get(`/api/products/${created.id}`);
    assert.equal(res.body.name, serum.name);
  });

  it('deletes a product', async () => {
    const { body: created } = await api.post('/api/products').send(serum);

    await api.delete(`/api/products/${created.id}`).expect(204);

    await api.get(`/api/products/${created.id}`).expect(404);
  });

  it('refuses to delete a product used in a routine', async () => {
    const { body: created } = await api.post('/api/products').send(serum);
    const routine = db.prepare("INSERT INTO routines (name, period) VALUES ('Morning', 'AM')").run();
    db.prepare('INSERT INTO routine_steps (routine_id, product_id, position) VALUES (?, ?, 1)').run(
      routine.lastInsertRowid,
      created.id,
    );

    await api.delete(`/api/products/${created.id}`).expect(409);

    await api.get(`/api/products/${created.id}`).expect(200);
  });

  it('returns 404 for unknown products', async () => {
    await api.get('/api/products/999').expect(404);
    await api.put('/api/products/999').send({ name: 'A' }).expect(404);
    await api.delete('/api/products/999').expect(404);
  });
});

describe('schema', () => {
  it('creates the tracker tables', () => {
    const db = openDatabase(':memory:');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .pluck()
      .all();

    assert.deepEqual(tables, [
      'catalog_products',
      'daily_logs',
      'products',
      'routine_steps',
      'routines',
      'step_completions',
    ]);
  });
});
