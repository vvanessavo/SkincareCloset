import { Router } from 'express';
import { isValidDate } from '../dates.js';

function parseLog(body) {
  const input = body ?? {};
  const errors = [];

  const rating = input.skin_rating ?? null;
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    errors.push('skin_rating must be a whole number from 1 to 5');
  }

  const notes = input.notes ?? null;
  if (notes !== null && typeof notes !== 'string') errors.push('notes must be a string');

  return {
    log: { skin_rating: rating, notes: typeof notes === 'string' ? notes.trim() || null : null },
    errors,
  };
}

export function logsRouter(db) {
  const router = Router();

  const selectAll = db.prepare(`
    SELECT log_date AS date, skin_rating, notes
    FROM daily_logs
    WHERE skin_rating IS NOT NULL OR notes IS NOT NULL
    ORDER BY log_date DESC
  `);
  // Updates in place: the row also holds the day's checklist, and deleting it would cascade.
  const upsert = db.prepare(`
    INSERT INTO daily_logs (log_date, skin_rating, notes)
    VALUES (@date, @skin_rating, @notes)
    ON CONFLICT (log_date) DO UPDATE
    SET skin_rating = excluded.skin_rating, notes = excluded.notes
  `);

  router.get('/', (req, res) => {
    res.json(selectAll.all());
  });

  router.put('/:date', (req, res) => {
    const { date } = req.params;
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be a YYYY-MM-DD date' });

    const { log, errors } = parseLog(req.body);
    if (errors.length) return res.status(400).json({ error: errors.join('; ') });

    upsert.run({ ...log, date });
    res.json({ date, ...log });
  });

  return router;
}
