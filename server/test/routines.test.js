import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

const morning = { name: 'Morning', period: 'AM' };

describe('/api/routines', () => {
  let db;
  let api;
  let cleanser;
  let serum;
  let routine;

  async function addStep(productId) {
    const res = await api
      .post(`/api/routines/${routine.id}/steps`)
      .send({ product_id: productId })
      .expect(201);
    return res.body.steps.at(-1);
  }

  async function stepProductNames() {
    const res = await api.get(`/api/routines/${routine.id}`).expect(200);
    return res.body.steps.map((step) => step.product.name);
  }

  beforeEach(async () => {
    db = openDatabase(':memory:');
    api = request(createApp(db));
    ({ body: cleanser } = await api.post('/api/products').send({ name: 'Cleanser' }));
    ({ body: serum } = await api.post('/api/products').send({ name: 'Serum', brand: 'Acme' }));
    ({ body: routine } = await api.post('/api/routines').send(morning));
  });

  it('creates a routine with no steps', async () => {
    const res = await api.post('/api/routines').send({ name: '  Night ', period: 'PM' }).expect(201);

    assert.equal(typeof res.body.id, 'number');
    assert.equal(res.body.name, 'Night');
    assert.equal(res.body.period, 'PM');
    assert.deepEqual(res.body.steps, []);
  });

  it('rejects invalid routines', async () => {
    const invalid = [
      {},
      { name: '   ', period: 'AM' },
      { name: 42, period: 'AM' },
      { name: 'A' },
      { name: 'A', period: 'am' },
      { name: 'A', period: 'noon' },
    ];

    for (const body of invalid) {
      await api.post('/api/routines').send(body).expect(400);
      await api.put(`/api/routines/${routine.id}`).send(body).expect(400);
    }
    const res = await api.get('/api/routines').expect(200);
    assert.deepEqual(res.body.map((item) => item.name), [morning.name]);
  });

  it('lists routines by period then name', async () => {
    await api.post('/api/routines').send({ name: 'Night', period: 'PM' });
    await api.post('/api/routines').send({ name: 'active days', period: 'AM' });

    const res = await api.get('/api/routines').expect(200);

    assert.deepEqual(
      res.body.map((item) => item.name),
      ['active days', 'Morning', 'Night'],
    );
  });

  it('updates a routine and keeps its steps', async () => {
    await addStep(cleanser.id);

    const res = await api
      .put(`/api/routines/${routine.id}`)
      .send({ name: 'Evening', period: 'PM' })
      .expect(200);

    assert.equal(res.body.name, 'Evening');
    assert.equal(res.body.period, 'PM');
    assert.equal(res.body.steps.length, 1);
  });

  it('deletes a routine and frees its products', async () => {
    await addStep(cleanser.id);

    await api.delete(`/api/routines/${routine.id}`).expect(204);

    await api.get(`/api/routines/${routine.id}`).expect(404);
    await api.delete(`/api/products/${cleanser.id}`).expect(204);
  });

  it('appends steps in order with their products', async () => {
    await addStep(cleanser.id);
    const step = await addStep(serum.id);

    assert.deepEqual(step.product, { id: serum.id, name: 'Serum', brand: 'Acme', category: null });
    assert.deepEqual(await stepProductNames(), ['Cleanser', 'Serum']);
  });

  it('allows the same product twice in a routine', async () => {
    await addStep(cleanser.id);
    await addStep(cleanser.id);

    assert.deepEqual(await stepProductNames(), ['Cleanser', 'Cleanser']);
  });

  it('rejects steps without an existing product', async () => {
    for (const product_id of [undefined, null, 'abc', String(cleanser.id), 1.5, 999]) {
      await api.post(`/api/routines/${routine.id}/steps`).send({ product_id }).expect(400);
    }
    assert.deepEqual(await stepProductNames(), []);
  });

  it('reorders steps without changing their ids', async () => {
    const first = await addStep(cleanser.id);
    const second = await addStep(serum.id);

    const res = await api
      .put(`/api/routines/${routine.id}/steps/order`)
      .send({ step_ids: [second.id, first.id] })
      .expect(200);

    assert.deepEqual(
      res.body.steps.map((step) => step.id),
      [second.id, first.id],
    );
    assert.deepEqual(await stepProductNames(), ['Serum', 'Cleanser']);
  });

  it('keeps completions when steps are reordered', async () => {
    const first = await addStep(cleanser.id);
    const second = await addStep(serum.id);
    const log = db.prepare("INSERT INTO daily_logs (log_date) VALUES ('2026-10-30')").run();
    db.prepare('INSERT INTO step_completions (daily_log_id, routine_step_id) VALUES (?, ?)').run(
      log.lastInsertRowid,
      first.id,
    );

    await api
      .put(`/api/routines/${routine.id}/steps/order`)
      .send({ step_ids: [second.id, first.id] })
      .expect(200);

    assert.equal(db.prepare('SELECT COUNT(*) FROM step_completions').pluck().get(), 1);
  });

  it('rejects an order that does not match the steps', async () => {
    const first = await addStep(cleanser.id);
    const second = await addStep(serum.id);
    const { body: other } = await api.post('/api/routines').send(morning);
    const { body: otherRoutine } = await api
      .post(`/api/routines/${other.id}/steps`)
      .send({ product_id: cleanser.id });

    const invalid = [
      undefined,
      'abc',
      [],
      [first.id],
      [first.id, first.id],
      [first.id, second.id, 999],
      [first.id, otherRoutine.steps[0].id],
    ];

    for (const step_ids of invalid) {
      await api.put(`/api/routines/${routine.id}/steps/order`).send({ step_ids }).expect(400);
    }
    assert.deepEqual(await stepProductNames(), ['Cleanser', 'Serum']);
  });

  it('appends after the last step once one is removed', async () => {
    const first = await addStep(cleanser.id);
    await addStep(serum.id);

    await api.delete(`/api/routines/${routine.id}/steps/${first.id}`).expect(200);
    await addStep(cleanser.id);

    assert.deepEqual(await stepProductNames(), ['Serum', 'Cleanser']);
  });

  it('removes a step and frees its product', async () => {
    const step = await addStep(cleanser.id);
    await api.delete(`/api/products/${cleanser.id}`).expect(409);

    const res = await api.delete(`/api/routines/${routine.id}/steps/${step.id}`).expect(200);

    assert.deepEqual(res.body.steps, []);
    await api.delete(`/api/products/${cleanser.id}`).expect(204);
  });

  it('only removes steps belonging to the routine', async () => {
    const step = await addStep(cleanser.id);
    const { body: other } = await api.post('/api/routines').send(morning);

    await api.delete(`/api/routines/${other.id}/steps/${step.id}`).expect(404);

    assert.deepEqual(await stepProductNames(), ['Cleanser']);
  });

  it('returns 404 for unknown routines', async () => {
    await api.get('/api/routines/999').expect(404);
    await api.put('/api/routines/999').send(morning).expect(404);
    await api.delete('/api/routines/999').expect(404);
    await api.post('/api/routines/999/steps').send({ product_id: cleanser.id }).expect(404);
    await api.put('/api/routines/999/steps/order').send({ step_ids: [] }).expect(404);
    await api.delete('/api/routines/999/steps/1').expect(404);
  });
});
