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

  describe('/calendar', () => {
    async function calendar(month) {
      const res = await api.get('/api/logs/calendar').query({ month }).expect(200);
      return res.body;
    }

    async function createRoutine(stepCount) {
      const { body: product } = await api.post('/api/products').send({ name: 'Toner' });
      const { body: routine } = await api.post('/api/routines').send({ name: 'AM', period: 'AM' });
      let steps;
      for (let i = 0; i < stepCount; i += 1) {
        const res = await api
          .post(`/api/routines/${routine.id}/steps`)
          .send({ product_id: product.id });
        ({ steps } = res.body);
      }
      return { ...routine, steps };
    }

    it('rejects an invalid month', async () => {
      await api.get('/api/logs/calendar').expect(400);
      await api.get('/api/logs/calendar').query({ month: '2026-13' }).expect(400);
      await api.get('/api/logs/calendar').query({ month: '2026-%' }).expect(400);
    });

    it('returns only that month, oldest first', async () => {
      await save('2026-11-01', { skin_rating: 3 });
      await save('2026-10-31', { skin_rating: 4 });
      await save('2026-10-01', { notes: 'Start' });
      await save('2026-09-30', { skin_rating: 2 });

      assert.deepEqual(await calendar('2026-10'), [
        { date: '2026-10-01', percent: 0, complete: false, skin_rating: null, notes: 'Start' },
        { date: '2026-10-31', percent: 0, complete: false, skin_rating: 4, notes: null },
      ]);
    });

    it('reports partial and finished days', async () => {
      const { steps } = await createRoutine(2);
      await api.put(`/api/checklist/2026-10-29/steps/${steps[0].id}`).send({ done: true });
      await api.put(`/api/checklist/2026-10-30/steps/${steps[0].id}`).send({ done: true });
      await api.put(`/api/checklist/2026-10-30/steps/${steps[1].id}`).send({ done: true });

      assert.deepEqual(
        (await calendar('2026-10')).map(({ date, percent, complete }) => [date, percent, complete]),
        [
          ['2026-10-29', 50, false],
          ['2026-10-30', 100, true],
        ],
      );
    });

    it('keeps past percentages after the routine changes', async () => {
      const routine = await createRoutine(2);
      await api.put(`/api/checklist/2026-10-29/steps/${routine.steps[0].id}`).send({ done: true });

      await api.delete(`/api/routines/${routine.id}`).expect(204);

      assert.equal((await calendar('2026-10'))[0].percent, 50);
    });

    it('drops a day once everything on it is unticked', async () => {
      const { steps } = await createRoutine(1);
      await api.put(`/api/checklist/${TODAY}/steps/${steps[0].id}`).send({ done: true });

      await api.put(`/api/checklist/${TODAY}/steps/${steps[0].id}`).send({ done: false });

      assert.deepEqual(await calendar('2026-10'), []);
    });
  });

  describe('/history', () => {
    function history(query) {
      return api.get('/api/logs/history').query(query);
    }

    it('rejects an invalid range', async () => {
      await history({}).expect(400);
      await history({ from: '2026-10-01' }).expect(400);
      await history({ from: 'soon', to: '2026-10-30' }).expect(400);
      await history({ from: '2026-10-30', to: '2026-10-01' }).expect(400);
    });

    it('returns days in the range, oldest first, including both ends', async () => {
      await save('2026-11-01', { skin_rating: 1 });
      await save('2026-10-30', { skin_rating: 2 });
      await save('2026-10-01', { skin_rating: 3 });
      await save('2026-09-30', { skin_rating: 4 });

      const res = await history({ from: '2026-10-01', to: '2026-10-30' }).expect(200);

      assert.deepEqual(
        res.body.map(({ date, skin_rating }) => [date, skin_rating]),
        [
          ['2026-10-01', 3],
          ['2026-10-30', 2],
        ],
      );
    });

    it('crosses months and includes routine progress', async () => {
      const { body: product } = await api.post('/api/products').send({ name: 'Toner' });
      const { body: routine } = await api.post('/api/routines').send({ name: 'AM', period: 'AM' });
      const { body: withStep } = await api
        .post(`/api/routines/${routine.id}/steps`)
        .send({ product_id: product.id });
      await api
        .put(`/api/checklist/2026-09-30/steps/${withStep.steps[0].id}`)
        .send({ done: true });

      const res = await history({ from: '2026-09-01', to: '2026-10-30' }).expect(200);

      assert.deepEqual(res.body, [
        { date: '2026-09-30', percent: 100, complete: true, skin_rating: null, notes: null },
      ]);
    });
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
