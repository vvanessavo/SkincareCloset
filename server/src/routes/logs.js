import { Router } from 'express';
import { isValidDate } from '../dates.js';
import { percentDone } from '../progress.js';

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

function serializeDay(day) {
  return {
    date: day.date,
    percent: percentDone(day.steps_done, day.steps_total),
    complete: day.is_complete === 1,
    skin_rating: day.skin_rating,
    notes: day.notes,
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
  const selectMonth = db.prepare(`
    SELECT log_date AS date, steps_done, steps_total, is_complete, skin_rating, notes
    FROM daily_logs
    WHERE log_date LIKE ? AND (steps_done > 0 OR skin_rating IS NOT NULL OR notes IS NOT NULL)
    ORDER BY log_date
  `);
  const selectRange = db.prepare(`
    SELECT log_date AS date, steps_done, steps_total, is_complete, skin_rating, notes
    FROM daily_logs
    WHERE log_date BETWEEN ? AND ?
      AND (steps_done > 0 OR skin_rating IS NOT NULL OR notes IS NOT NULL)
    ORDER BY log_date
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

  router.get('/calendar', (req, res) => {
    const { month } = req.query;
    if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return res.status(400).json({ error: 'month must be a YYYY-MM month' });
    }

    res.json(selectMonth.all(`${month}-%`).map(serializeDay));
  });

  router.get('/history', (req, res) => {
    const { from, to } = req.query;
    if (!isValidDate(from) || !isValidDate(to) || from > to) {
      return res.status(400).json({ error: 'from and to must be YYYY-MM-DD dates in order' });
    }

    res.json(selectRange.all(from, to).map(serializeDay));
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
