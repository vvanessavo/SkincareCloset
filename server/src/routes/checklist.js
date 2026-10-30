import { Router } from 'express';
import { isValidDate, previousDay } from '../dates.js';
import { summarizeProgress } from '../progress.js';
import { createStepReader } from '../routineSteps.js';

export function checklistRouter(db) {
  const router = Router();
  const readSteps = createStepReader(db);

  const selectRoutines = db.prepare('SELECT * FROM routines ORDER BY period, name COLLATE NOCASE, id');
  const selectDoneSteps = db
    .prepare(`
      SELECT c.routine_step_id
      FROM step_completions c
      JOIN daily_logs l ON l.id = c.daily_log_id
      WHERE l.log_date = ?
    `)
    .pluck();
  const selectStep = db.prepare('SELECT 1 FROM routine_steps WHERE id = ?');
  const insertLog = db.prepare(`
    INSERT INTO daily_logs (log_date) VALUES (?) ON CONFLICT (log_date) DO NOTHING
  `);
  const selectLogId = db.prepare('SELECT id FROM daily_logs WHERE log_date = ?').pluck();
  const insertCompletion = db.prepare(`
    INSERT OR IGNORE INTO step_completions (daily_log_id, routine_step_id) VALUES (?, ?)
  `);
  const deleteCompletion = db.prepare(`
    DELETE FROM step_completions WHERE daily_log_id = ? AND routine_step_id = ?
  `);
  const updateProgress = db.prepare(`
    UPDATE daily_logs
    SET is_complete = @isComplete, steps_done = @stepsDone, steps_total = @stepsTotal
    WHERE log_date = @date
  `);
  const selectCompleteDays = db
    .prepare(`
      SELECT log_date FROM daily_logs
      WHERE is_complete = 1 AND log_date < ?
      ORDER BY log_date DESC
    `)
    .pluck();

  const setStepDone = db.transaction((date, stepId, done) => {
    insertLog.run(date);
    const logId = selectLogId.get(date);
    (done ? insertCompletion : deleteCompletion).run(logId, stepId);
  });

  function countStreakBefore(date) {
    let expected = previousDay(date);
    let streak = 0;
    for (const day of selectCompleteDays.all(date)) {
      if (day !== expected) break;
      streak += 1;
      expected = previousDay(expected);
    }
    return streak;
  }

  // Past days keep their stored flag, so later routine edits can't rewrite the streak.
  function buildChecklist(date) {
    const doneSteps = new Set(selectDoneSteps.all(date));
    const routines = selectRoutines
      .all()
      .map((routine) => {
        const steps = readSteps(routine.id).map((step) => ({
          ...step,
          done: doneSteps.has(step.id),
        }));
        return { ...routine, steps, complete: steps.every((step) => step.done) };
      })
      .filter((routine) => routine.steps.length > 0);

    // A day counts once each time of day has a finished routine, so routines can alternate.
    const { stepsDone, stepsTotal, percent } = summarizeProgress(routines);
    const dayComplete = percent === 100;
    updateProgress.run({ isComplete: dayComplete ? 1 : 0, stepsDone, stepsTotal, date });

    // An unfinished today doesn't break the streak until the day is over.
    const streak = countStreakBefore(date) + (dayComplete ? 1 : 0);
    return {
      date,
      routines,
      day_complete: dayComplete,
      steps_done: stepsDone,
      steps_total: stepsTotal,
      percent,
      streak,
    };
  }

  router.param('date', (req, res, next, date) => {
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be a YYYY-MM-DD date' });
    next();
  });

  // The date comes from the client, because "today" depends on the browser's time zone.
  router.get('/', (req, res) => {
    const { date } = req.query;
    if (!isValidDate(date)) return res.status(400).json({ error: 'date must be a YYYY-MM-DD date' });
    res.json(buildChecklist(date));
  });

  router.put('/:date/steps/:stepId', (req, res) => {
    const done = req.body?.done;
    if (typeof done !== 'boolean') return res.status(400).json({ error: 'done must be true or false' });
    if (!selectStep.get(req.params.stepId)) return res.status(404).json({ error: 'Step not found' });

    setStepDone(req.params.date, req.params.stepId, done);
    res.json(buildChecklist(req.params.date));
  });

  return router;
}
