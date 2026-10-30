import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { previousDay } from '../src/dates.js';
import { openDatabase } from '../src/db.js';

const TODAY = '2026-10-30';

describe('previousDay', () => {
  it('crosses month, year, leap day and daylight saving changes', () => {
    assert.equal(previousDay('2026-03-01'), '2026-02-28');
    assert.equal(previousDay('2028-03-01'), '2028-02-29');
    assert.equal(previousDay('2026-01-01'), '2025-12-31');
    assert.equal(previousDay('2026-11-02'), '2026-11-01');
    assert.equal(previousDay('2026-03-09'), '2026-03-08');
  });
});

describe('/api/checklist', () => {
  let api;
  let product;

  async function createRoutine(name, period, stepCount = 1) {
    const { body: routine } = await api.post('/api/routines').send({ name, period });
    const steps = [];
    for (let i = 0; i < stepCount; i += 1) {
      const res = await api
        .post(`/api/routines/${routine.id}/steps`)
        .send({ product_id: product.id });
      steps.push(res.body.steps.at(-1));
    }
    return { ...routine, steps };
  }

  function tick(step, date = TODAY, done = true) {
    return api.put(`/api/checklist/${date}/steps/${step.id}`).send({ done }).expect(200);
  }

  async function checklist(date = TODAY) {
    const res = await api.get('/api/checklist').query({ date }).expect(200);
    return res.body;
  }

  beforeEach(async () => {
    api = request(createApp(openDatabase(':memory:')));
    ({ body: product } = await api.post('/api/products').send({ name: 'Cleanser' }));
  });

  it('is empty with no routines', async () => {
    assert.deepEqual(await checklist(), {
      date: TODAY,
      routines: [],
      day_complete: false,
      steps_done: 0,
      steps_total: 0,
      percent: 0,
      streak: 0,
    });
  });

  it('leaves out routines with no steps', async () => {
    await createRoutine('Empty', 'AM', 0);

    assert.deepEqual((await checklist()).routines, []);
  });

  it('lists steps with products and starts unticked', async () => {
    await createRoutine('Morning', 'AM');

    const { routines } = await checklist();

    assert.equal(routines[0].name, 'Morning');
    assert.equal(routines[0].complete, false);
    assert.equal(routines[0].steps[0].done, false);
    assert.equal(routines[0].steps[0].product.name, 'Cleanser');
  });

  it('ticks and unticks a step', async () => {
    const { steps } = await createRoutine('Morning', 'AM', 2);

    const ticked = await tick(steps[0]);
    assert.deepEqual(
      ticked.body.routines[0].steps.map((step) => step.done),
      [true, false],
    );

    const unticked = await tick(steps[0], TODAY, false);
    assert.equal(unticked.body.routines[0].steps[0].done, false);
  });

  it('can tick the same step twice', async () => {
    const { steps } = await createRoutine('Morning', 'AM', 2);

    await tick(steps[0]);
    const res = await tick(steps[0]);

    assert.equal(res.body.routines[0].steps[0].done, true);
  });

  it('keeps each day separate', async () => {
    const { steps } = await createRoutine('Morning', 'AM');

    await tick(steps[0]);

    assert.equal((await checklist(previousDay(TODAY))).routines[0].steps[0].done, false);
  });

  it('rejects invalid requests', async () => {
    const { steps } = await createRoutine('Morning', 'AM');

    await api.get('/api/checklist').expect(400);
    await api.get('/api/checklist').query({ date: '2026-02-31' }).expect(400);
    await api.put(`/api/checklist/soon/steps/${steps[0].id}`).send({ done: true }).expect(400);
    await api.put(`/api/checklist/${TODAY}/steps/${steps[0].id}`).send({}).expect(400);
    await api.put(`/api/checklist/${TODAY}/steps/${steps[0].id}`).send({ done: 'yes' }).expect(400);
    await api.put(`/api/checklist/${TODAY}/steps/999`).send({ done: true }).expect(404);
  });

  describe('day completion', () => {
    it('needs every step of a routine', async () => {
      const { steps } = await createRoutine('Morning', 'AM', 2);

      assert.equal((await tick(steps[0])).body.day_complete, false);
      const res = await tick(steps[1]);

      assert.equal(res.body.routines[0].complete, true);
      assert.equal(res.body.day_complete, true);
    });

    it('needs each time of day', async () => {
      const morning = await createRoutine('Morning', 'AM');
      const evening = await createRoutine('Evening', 'PM');

      assert.equal((await tick(morning.steps[0])).body.day_complete, false);
      assert.equal((await tick(evening.steps[0])).body.day_complete, true);
    });

    it('accepts either of two alternating routines', async () => {
      await createRoutine('Retinol night', 'PM');
      const acid = await createRoutine('Acid night', 'PM');

      const res = await tick(acid.steps[0]);

      assert.equal(res.body.day_complete, true);
    });

    it('does not count a partly done routine towards its time of day', async () => {
      const retinol = await createRoutine('Retinol night', 'PM', 2);
      const acid = await createRoutine('Acid night', 'PM', 2);

      await tick(retinol.steps[0]);
      const res = await tick(acid.steps[0]);

      assert.equal(res.body.day_complete, false);
    });

    it('ignores a time of day with only empty routines', async () => {
      const morning = await createRoutine('Morning', 'AM');
      await createRoutine('Empty', 'PM', 0);

      assert.equal((await tick(morning.steps[0])).body.day_complete, true);
    });
  });

  describe('percent', () => {
    it('counts ticked steps across the day', async () => {
      const morning = await createRoutine('Morning', 'AM', 2);
      await createRoutine('Evening', 'PM', 2);

      const { body } = await tick(morning.steps[0]);

      assert.equal(body.steps_done, 1);
      assert.equal(body.steps_total, 4);
      assert.equal(body.percent, 25);
    });

    it('reaches 100 on a finished alternate routine', async () => {
      await createRoutine('Retinol night', 'PM', 3);
      const acid = await createRoutine('Acid night', 'PM', 2);

      await tick(acid.steps[0]);
      const { body } = await tick(acid.steps[1]);

      assert.equal(body.percent, 100);
      assert.equal(body.day_complete, true);
    });

    it('follows the furthest routine of each time of day', async () => {
      const retinol = await createRoutine('Retinol night', 'PM', 4);
      const acid = await createRoutine('Acid night', 'PM', 2);

      await tick(retinol.steps[0]);
      const { body } = await tick(acid.steps[0]);

      assert.equal(body.steps_done, 1);
      assert.equal(body.steps_total, 2);
      assert.equal(body.percent, 50);
    });

    it('rounds down, so 100 means everything is done', async () => {
      const { steps } = await createRoutine('Big', 'AM', 3);

      await tick(steps[0]);
      await tick(steps[1]);

      assert.equal((await checklist()).percent, 66);
    });

    it('is 100 exactly when the day counts', async () => {
      const morning = await createRoutine('Morning', 'AM', 2);
      const evening = await createRoutine('Evening', 'PM');

      assert.equal((await tick(morning.steps[0])).body.percent, 33);
      const almost = await tick(evening.steps[0]);
      assert.equal(almost.body.percent, 66);
      assert.equal(almost.body.day_complete, false);
      const last = await tick(morning.steps[1]);

      assert.equal(last.body.percent, 100);
      assert.equal(last.body.day_complete, true);
    });
  });

  describe('streak', () => {
    async function finish(step, date) {
      return (await tick(step, date)).body;
    }

    it('counts consecutive finished days', async () => {
      const { steps } = await createRoutine('Morning', 'AM');

      await finish(steps[0], '2026-10-28');
      await finish(steps[0], '2026-10-29');
      const today = await finish(steps[0], TODAY);

      assert.equal(today.streak, 3);
    });

    it('keeps the streak while today is unfinished', async () => {
      const { steps } = await createRoutine('Morning', 'AM');

      await finish(steps[0], '2026-10-29');

      assert.equal((await checklist()).streak, 1);
    });

    it('resets after a missed day', async () => {
      const { steps } = await createRoutine('Morning', 'AM');

      await finish(steps[0], '2026-10-27');
      await finish(steps[0], '2026-10-29');

      assert.equal((await checklist()).streak, 1);
    });

    it('falls to zero once two days pass', async () => {
      const { steps } = await createRoutine('Morning', 'AM');

      await finish(steps[0], '2026-10-29');

      assert.equal((await checklist('2026-10-31')).streak, 0);
    });

    it('drops a day when it is unticked', async () => {
      const { steps } = await createRoutine('Morning', 'AM');

      await finish(steps[0], TODAY);
      const res = await tick(steps[0], TODAY, false);

      assert.equal(res.body.streak, 0);
    });

    it('crosses a month boundary', async () => {
      const { steps } = await createRoutine('Morning', 'AM');

      await finish(steps[0], '2026-10-31');

      assert.equal((await finish(steps[0], '2026-11-01')).streak, 2);
    });

    it('ignores later days', async () => {
      const { steps } = await createRoutine('Morning', 'AM');

      await finish(steps[0], '2026-11-05');

      assert.equal((await checklist()).streak, 0);
    });

    it('survives adding a step to the routine', async () => {
      const routine = await createRoutine('Morning', 'AM');
      await finish(routine.steps[0], '2026-10-29');

      await api.post(`/api/routines/${routine.id}/steps`).send({ product_id: product.id });

      assert.equal((await checklist()).streak, 1);
    });

    it('survives removing a step and deleting its routine', async () => {
      const routine = await createRoutine('Morning', 'AM', 2);
      await finish(routine.steps[0], '2026-10-29');
      await finish(routine.steps[1], '2026-10-29');

      await api.delete(`/api/routines/${routine.id}/steps/${routine.steps[0].id}`).expect(200);
      await api.delete(`/api/routines/${routine.id}`).expect(204);

      assert.equal((await checklist()).streak, 1);
    });

    it('counts today when the last unticked step is removed', async () => {
      const routine = await createRoutine('Morning', 'AM', 2);
      await tick(routine.steps[0]);

      await api.delete(`/api/routines/${routine.id}/steps/${routine.steps[1].id}`).expect(200);

      assert.equal((await checklist()).streak, 1);
    });
  });

  it('still lets a removed step free its product', async () => {
    const routine = await createRoutine('Morning', 'AM');
    await tick(routine.steps[0]);

    await api.delete(`/api/routines/${routine.id}/steps/${routine.steps[0].id}`).expect(200);

    await api.delete(`/api/products/${product.id}`).expect(204);
  });
});
