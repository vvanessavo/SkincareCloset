import { Router } from 'express';
import { imageUrl } from '../images.js';

const PERIODS = ['AM', 'PM'];

function parseRoutine(body) {
  const input = body ?? {};
  const errors = [];
  const routine = {};

  if (typeof input.name === 'string' && input.name.trim()) {
    routine.name = input.name.trim();
  } else {
    errors.push('name is required');
  }

  if (PERIODS.includes(input.period)) {
    routine.period = input.period;
  } else {
    errors.push('period must be AM or PM');
  }

  return { routine, errors };
}

export function routinesRouter(db) {
  const router = Router();

  const selectAll = db.prepare('SELECT * FROM routines ORDER BY period, name COLLATE NOCASE, id');
  const selectOne = db.prepare('SELECT * FROM routines WHERE id = ?');
  const insert = db.prepare('INSERT INTO routines (name, period) VALUES (@name, @period)');
  const update = db.prepare('UPDATE routines SET name = @name, period = @period WHERE id = @id');
  const remove = db.prepare('DELETE FROM routines WHERE id = ?');

  const selectSteps = db.prepare(`
    SELECT s.id, p.id AS product_id, p.name, p.brand, p.category, p.image
    FROM routine_steps s
    JOIN products p ON p.id = s.product_id
    WHERE s.routine_id = ?
    ORDER BY s.position, s.id
  `);
  const selectProduct = db.prepare('SELECT 1 FROM products WHERE id = ?');
  const insertStep = db.prepare(`
    INSERT INTO routine_steps (routine_id, product_id, position)
    SELECT @routine_id, @product_id, COALESCE(MAX(position), 0) + 1
    FROM routine_steps
    WHERE routine_id = @routine_id
  `);
  const removeStep = db.prepare('DELETE FROM routine_steps WHERE id = ? AND routine_id = ?');
  const moveStep = db.prepare('UPDATE routine_steps SET position = ? WHERE id = ?');

  const reorderSteps = db.transaction((stepIds) => {
    stepIds.forEach((stepId, index) => moveStep.run(index + 1, stepId));
  });

  // Array order is the step order, so positions stay internal.
  function serialize(routine) {
    const steps = selectSteps.all(routine.id).map((step) => ({
      id: step.id,
      product: {
        id: step.product_id,
        name: step.name,
        brand: step.brand,
        category: step.category,
        image_url: imageUrl(step.image),
      },
    }));
    return { ...routine, steps };
  }

  router.param('id', (req, res, next, id) => {
    req.routine = selectOne.get(id);
    if (!req.routine) return res.status(404).json({ error: 'Routine not found' });
    next();
  });

  router.get('/', (req, res) => {
    res.json(selectAll.all().map(serialize));
  });

  router.get('/:id', (req, res) => {
    res.json(serialize(req.routine));
  });

  router.post('/', (req, res) => {
    const { routine, errors } = parseRoutine(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    const { lastInsertRowid } = insert.run(routine);
    res.status(201).json(serialize(selectOne.get(lastInsertRowid)));
  });

  router.put('/:id', (req, res) => {
    const { routine, errors } = parseRoutine(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    update.run({ ...routine, id: req.routine.id });
    res.json(serialize(selectOne.get(req.routine.id)));
  });

  router.delete('/:id', (req, res) => {
    remove.run(req.routine.id);
    res.status(204).end();
  });

  router.post('/:id/steps', (req, res) => {
    const productId = req.body?.product_id;
    if (!Number.isInteger(productId) || !selectProduct.get(productId)) {
      return res.status(400).json({ error: 'product_id must be an existing product' });
    }

    insertStep.run({ routine_id: req.routine.id, product_id: productId });
    res.status(201).json(serialize(req.routine));
  });

  // Steps keep their ids when reordered so completions can reference them.
  router.put('/:id/steps/order', (req, res) => {
    const stepIds = req.body?.step_ids;
    const currentIds = selectSteps.all(req.routine.id).map((step) => step.id);
    const isSameSteps =
      Array.isArray(stepIds) &&
      stepIds.length === currentIds.length &&
      new Set(stepIds).size === stepIds.length &&
      stepIds.every((stepId) => currentIds.includes(stepId));
    if (!isSameSteps) {
      return res.status(400).json({ error: "step_ids must list each of the routine's steps once" });
    }

    reorderSteps(stepIds);
    res.json(serialize(req.routine));
  });

  router.delete('/:id/steps/:stepId', (req, res) => {
    const { changes } = removeStep.run(req.params.stepId, req.routine.id);
    if (!changes) return res.status(404).json({ error: 'Step not found' });
    res.json(serialize(req.routine));
  });

  return router;
}
