// Only the furthest routine per time of day counts, so an untouched alternate
// (retinol night or acid night) doesn't hold a finished day below 100%.
export function summarizeProgress(routines) {
  const furthest = new Map();

  for (const routine of routines) {
    const total = routine.steps.length;
    const done = routine.steps.filter((step) => step.done).length;
    const current = furthest.get(routine.period);
    const isFurther =
      !current ||
      done / total > current.done / current.total ||
      (done / total === current.done / current.total && done > current.done);
    if (isFurther) furthest.set(routine.period, { done, total });
  }

  let stepsDone = 0;
  let stepsTotal = 0;
  for (const { done, total } of furthest.values()) {
    stepsDone += done;
    stepsTotal += total;
  }

  return { stepsDone, stepsTotal, percent: percentDone(stepsDone, stepsTotal) };
}

// Rounds down, so 100% only ever means everything is done.
export function percentDone(done, total) {
  return total > 0 ? Math.floor((done / total) * 100) : 0;
}
