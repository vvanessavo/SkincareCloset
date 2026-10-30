import { useCallback, useEffect, useRef, useState } from 'react';
import { getChecklist, setStepDone } from '../api.js';
import { localDate } from '../dates.js';
import { ProductImage } from './ProductImage.jsx';

const PERIODS = [
  { value: 'AM', label: 'Morning' },
  { value: 'PM', label: 'Evening' },
];

function withStepDone(checklist, stepId, done) {
  return {
    ...checklist,
    routines: checklist.routines.map((routine) => ({
      ...routine,
      steps: routine.steps.map((step) => (step.id === stepId ? { ...step, done } : step)),
    })),
  };
}

function streakLabel(streak) {
  return `${streak}-day streak`;
}

export function TodayChecklist() {
  const [checklist, setChecklist] = useState(null);
  const [error, setError] = useState(null);
  // Only the newest tick's response is applied, so quick ticks can't undo each other.
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const data = await getChecklist(localDate());
      if (request === latestRequest.current) {
        setChecklist(data);
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    // A tab left open overnight has to move on to the new day.
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  async function handleToggle(step, done) {
    const request = ++latestRequest.current;
    setChecklist((current) => withStepDone(current, step.id, done));
    try {
      const data = await setStepDone(checklist.date, step.id, done);
      if (request === latestRequest.current) {
        setChecklist(data);
        setError(null);
      }
    } catch (err) {
      await load();
      setError(err.message);
    }
  }

  return (
    <>
      <header className="app-header">
        <h1>Today</h1>
        {checklist && (
          <p className="streak" aria-label={streakLabel(checklist.streak)}>
            <strong>{checklist.streak}</strong> day streak
          </p>
        )}
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="layout">
        {!checklist && !error && <p className="empty">Loading…</p>}

        {checklist?.routines.length === 0 && (
          <p className="empty">Add steps to a routine and they'll show up here.</p>
        )}

        {checklist?.routines.length > 0 && (
          <>
            <p className={checklist.day_complete ? 'day-status complete' : 'day-status'}>
              {checklist.day_complete
                ? 'All done for today.'
                : 'Finish one routine for each time of day to count today.'}
            </p>
            <div className="period-columns">
              {PERIODS.map(({ value, label }) => {
                const routines = checklist.routines.filter((routine) => routine.period === value);
                if (!routines.length) return null;
                return (
                  <section key={value}>
                    <h2 className="period-heading">{label}</h2>
                    <ul className="routine-list">
                      {routines.map((routine) => (
                        <li key={routine.id} className="panel routine-card">
                          <div className="routine-heading">
                            <h3>{routine.name}</h3>
                            {routine.complete && <span className="tag">Done</span>}
                          </div>
                          <ul className="checklist">
                            {routine.steps.map((step) => (
                              <li key={step.id}>
                                <label className={step.done ? 'check done' : 'check'}>
                                  <input
                                    type="checkbox"
                                    checked={step.done}
                                    onChange={(event) => handleToggle(step, event.target.checked)}
                                  />
                                  <ProductImage
                                    src={step.product.image_url}
                                    name={step.product.name}
                                    className="small"
                                  />
                                  <span>{step.product.name}</span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}
