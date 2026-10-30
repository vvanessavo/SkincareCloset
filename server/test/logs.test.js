import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { openDatabase } from '../src/db.js';

const TODAY = '2026-10-30';

describe('/api/logs', () => {
  let db;
  let api;

  function save(date, body) {
    return api.put(`/api/logs/${date}`).send(body);
  }

  async function list() {
    const res = await api.get('/api/logs').expect(200);
    return res.body;
  }

  beforeEach(() => {
    db = openDatabase(':memory:');
    api = request(createApp(db));
  });

  it('starts empty', async () => {
    assert.deepEqual(await list(), []);
  });

  it('saves a rating and a note', async () => {
    const res = await save(TODAY, { skin_rating: 4, notes: '  Calm today ' }).expect(200);

    assert.deepEqual(res.body, { date: TODAY, skin_rating: 4, notes: 'Calm today' });
    assert.deepEqual(await list(), [res.body]);
  });

  it('accepts a rating or a note on its own', async () => {
    await save('2026-10-29', { skin_rating: 1 }).expect(200);
    await save('2026-10-30', { notes: 'New breakout' }).expect(200);

    assert.deepEqual(await list(), [
      { date: '2026-10-30', skin_rating: null, notes: 'New breakout' },
      { date: '2026-10-29', skin_rating: 1, notes: null },
    ]);
  });

  it('replaces the entry for a day', async () => {
    await save(TODAY, { skin_rating: 2, notes: 'Dry' });

    await save(TODAY, { skin_rating: 5 }).expect(200);

    assert.deepEqual(await list(), [{ date: TODAY, skin_rating: 5, notes: null }]);
  });

  it('lists newest first', async () => {
    await save('2026-09-30', { skin_rating: 3 });
    await save('2026-10-30', { skin_rating: 3 });
    await save('2026-10-01', { skin_rating: 3 });

    assert.deepEqual(
      (await list()).map((entry) => entry.date),
      ['2026-10-30', '2026-10-01', '2026-09-30'],
    );
  });

  it('hides a cleared entry', async () => {
    await save(TODAY, { skin_rating: 3, notes: 'Fine' });

    await save(TODAY, { skin_rating: null, notes: '   ' }).expect(200);

    assert.deepEqual(await list(), []);
  });

  it('rejects invalid entries', async () => {
    const invalid = [
      { skin_rating: 0 },
      { skin_rating: 6 },
      { skin_rating: 3.5 },
      { skin_rating: '4' },
      { notes: 42 },
    ];

    for (const body of invalid) {
      await save(TODAY, body).expect(400);
    }
    assert.deepEqual(await list(), []);
  });

  it('rejects invalid dates', async () => {
    await save('soon', { skin_rating: 3 }).expect(400);
    await save('2026-02-31', { skin_rating: 3 }).expect(400);
  });

  describe('alongside the checklist', () => {
    let step;

    async function checklist() {
      const res = await api.get('/api/checklist').query({ date: TODAY }).expect(200);
      return res.body;
    }

    beforeEach(async () => {
      const { body: product } = await api.post('/api/products').send({ name: 'Toner' });
      const { body: routine } = await api.post('/api/routines').send({ name: 'AM', period: 'AM' });
      const { body: withStep } = await api
        .post(`/api/routines/${routine.id}/steps`)
        .send({ product_id: product.id });
      [step] = withStep.steps;
    });

    it('keeps ticks and the streak when a log is saved or cleared', async () => {
      await api.put(`/api/checklist/${TODAY}/steps/${step.id}`).send({ done: true }).expect(200);

      await save(TODAY, { skin_rating: 4, notes: 'Good' }).expect(200);
      await save(TODAY, { skin_rating: null, notes: null }).expect(200);

      const { routines, streak } = await checklist();
      assert.equal(routines[0].steps[0].done, true);
      assert.equal(streak, 1);
      assert.equal(db.prepare('SELECT COUNT(*) FROM step_completions').pluck().get(), 1);
    });

    it('keeps a log when the checklist changes', async () => {
      await save(TODAY, { skin_rating: 4, notes: 'Good' });

      await api.put(`/api/checklist/${TODAY}/steps/${step.id}`).send({ done: true }).expect(200);
      await api.put(`/api/checklist/${TODAY}/steps/${step.id}`).send({ done: false }).expect(200);

      assert.deepEqual(await list(), [{ date: TODAY, skin_rating: 4, notes: 'Good' }]);
    });

    it('does not list days that only have checklist ticks', async () => {
      await api.put(`/api/checklist/${TODAY}/steps/${step.id}`).send({ done: true }).expect(200);

      assert.deepEqual(await list(), []);
    });
  });
});
