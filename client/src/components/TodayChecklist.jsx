import { useCallback, useEffect, useRef, useState } from 'react';
import { getChecklist, setStepDone } from '../api.js';
import { addDays, formatDate, localDate } from '../dates.js';
import { ExpiryTag } from './ExpiryTag.jsx';
import { PeriodIcon } from './PeriodIcon.jsx';
import { ProductImage } from './ProductImage.jsx';
import { ProgressCalendar } from './ProgressCalendar.jsx';
import { ProgressRing } from './ProgressRing.jsx';

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
  const [today, setToday] = useState(localDate);
  // null follows today, including past midnight; a date means a past day is open.
  const [pastDate, setPastDate] = useState(null);
  // Only the newest request's response is applied, so quick ticks can't undo each other.
  const latestRequest = useRef(0);

  const date = pastDate ?? today;
  const isToday = date === today;

  const load = useCallback(async (target, isLiveDay) => {
    const request = ++latestRequest.current;
    try {
      const data = await getChecklist(target, isLiveDay);
      if (request === latestRequest.current) {
        setChecklist(data);
        setError(null);
      }
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load(date, isToday);
  }, [load, date, isToday]);

  // A tab left open overnight moves on to the new day.
  useEffect(() => {
    function handleFocus() {
      const now = localDate();
      setToday(now);
      if (now === today) load(date, isToday);
    }

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [load, date, isToday, today]);

  function openDate(next) {
    if (next > today) return;
    setPastDate(next === today ? null : next);
  }

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
      await load(date, isToday);
      setError(err.message);
    }
  }

  const shown = checklist?.date === date ? checklist : null;
  const routinesChanged =
    shown && !isToday && shown.recorded_percent !== null && shown.recorded_percent !== shown.percent;

  return (
    <>
      <header className="app-header">
        <h1>{isToday ? 'Today' : formatDate(date)}</h1>
        {shown && isToday && (
          <p className="streak" aria-label={streakLabel(shown.streak)}>
            <strong>{shown.streak}</strong> day streak
          </p>
        )}
      </header>

      <nav className="day-nav" aria-label="Choose a day">
        <button type="button" onClick={() => openDate(addDays(date, -1))}>
          ‹ Previous day
        </button>
        {!isToday && (
          <button type="button" onClick={() => openDate(today)}>
            Back to today
          </button>
        )}
        <button type="button" disabled={isToday} onClick={() => openDate(addDays(date, 1))}>
          Next day ›
        </button>
      </nav>

      {!isToday && (
        <p className="past-day-notice" role="status">
          You're filling in {formatDate(date)}. Ticks here count toward that day and your streak.
          {routinesChanged &&
            ` Your routines have changed since: this day was saved at ${shown.recorded_percent}%, and ticking a step will re-score it with your current routines.`}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="layout">
        {!shown && !error && <p className="empty">Loading…</p>}

        {shown?.routines.length === 0 && (
          <p className="empty">Add steps to a routine and they'll show up here.</p>
        )}

        {shown?.routines.length > 0 && (
          <>
            <div className="panel today-progress">
              <ProgressRing
                percent={shown.percent}
                size={104}
                strokeWidth={10}
                label={`${shown.percent}% of ${isToday ? "today's" : "this day's"} routine done`}
              >
                <span className="today-percent">{shown.percent}%</span>
              </ProgressRing>
              <div>
                <p className="today-steps">
                  {shown.steps_done} of {shown.steps_total} steps done
                </p>
                <p className={shown.day_complete ? 'day-status complete' : 'day-status'}>
                  {shown.day_complete
                    ? `All done for ${isToday ? 'today' : 'this day'}.`
                    : `Finish one routine for each time of day to count ${isToday ? 'today' : 'this day'}.`}
                </p>
              </div>
            </div>
            <div className="period-columns">
              {PERIODS.map(({ value, label }) => {
                const routines = shown.routines.filter((routine) => routine.period === value);
                if (!routines.length) return null;
                return (
                  <section key={value}>
                    <h2 className="period-heading">
                      <PeriodIcon period={value} />
                      {label}
                    </h2>
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
                                  {/* The tag drops below a long name instead of squeezing it. */}
                                  <span className="check-text">
                                    <span className="check-name">{step.product.name}</span>
                                    <ExpiryTag expiresOn={step.product.expires_on} />
                                  </span>
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

        {checklist && (
          <ProgressCalendar
            key={today}
            today={today}
            selected={date}
            onSelect={openDate}
            liveDay={
              shown ? { date, percent: shown.recorded_percent ?? shown.percent } : null
            }
          />
        )}
      </main>
    </>
  );
}
