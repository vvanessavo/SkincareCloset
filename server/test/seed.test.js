import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';
import { KBEAUTY_PRODUCTS, seedProducts } from '../src/seed.js';

describe('seedProducts', () => {
  let db;
  let api;

  beforeEach(() => {
    db = openDatabase(':memory:');
    api = request(createApp(db));
  });

  it('adds products the API can read back', async () => {
    assert.equal(seedProducts(db), KBEAUTY_PRODUCTS.length);

    const res = await api.get('/api/products').expect(200);

    assert.equal(res.body.length, KBEAUTY_PRODUCTS.length);
    const toner = res.body.find((product) => product.brand === 'Anua');
    assert.deepEqual(toner.ingredients, ['houttuynia cordata extract']);
  });

  it('adds nothing on a second run', async () => {
    seedProducts(db);

    assert.equal(seedProducts(db), 0);

    const res = await api.get('/api/products');
    assert.equal(res.body.length, KBEAUTY_PRODUCTS.length);
  });

  it('keeps edits to seeded products', async () => {
    seedProducts(db);
    const { body: products } = await api.get('/api/products');
    const product = products[0];

    await api
      .put(`/api/products/${product.id}`)
      .send({ ...product, notes: 'Patch test first' })
      .expect(200);
    seedProducts(db);

    const res = await api.get(`/api/products/${product.id}`);
    assert.equal(res.body.notes, 'Patch test first');
  });

  it('stores Korean brand and product names', async () => {
    seedProducts(db, [
      { name: '독도 토너', brand: '라운드랩', category: 'toner', ingredients: ['해양심층수'] },
    ]);

    const { body: products } = await api.get('/api/products');

    assert.equal(products[0].name, '독도 토너');
    assert.equal(products[0].brand, '라운드랩');
    assert.deepEqual(products[0].ingredients, ['해양심층수']);
  });
});
