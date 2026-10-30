import { useCallback, useEffect, useState } from 'react';
import { listLogs, saveLog } from '../api.js';
import { formatDate, localDate } from '../dates.js';
import { confirmDiscard, hasUnsavedChanges } from '../unsavedChanges.js';
import { ProgressCharts } from './ProgressCharts.jsx';
import { RATINGS, SkinLogForm } from './SkinLogForm.jsx';

export function SkinLog() {
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState(null);
  const [today, setToday] = useState(localDate);
  const [date, setDate] = useState(today);
  // Remounts the form after a save, so what was saved becomes its starting point.
  const [saveCount, setSaveCount] = useState(0);

  const load = useCallback(async () => {
    try {
      setEntries(await listLogs());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A tab left open overnight moves on, unless there's a half-written entry.
  useEffect(() => {
    function handleFocus() {
      const now = localDate();
      setToday(now);
      if (date === today && !hasUnsavedChanges()) setDate(now);
    }

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [date, today]);

  function selectDate(next) {
    if (!next || next > today || next === date || !confirmDiscard()) return;
    setDate(next);
  }

  async function handleSave(log) {
    await saveLog(date, log);
    await load();
    setSaveCount((count) => count + 1);
  }

  const entry = entries?.find((item) => item.date === date);

  return (
    <>
      <header className="app-header">
        <h1>Skin log</h1>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="layout with-form">
        {entries && (
          <section className="panel skin-form">
            <label className="skin-date">
              Day
              <input
                type="date"
                value={date}
                max={today}
                onChange={(event) => selectDate(event.target.value)}
              />
            </label>
            <SkinLogForm key={`${date}-${saveCount}`} entry={entry} onSave={handleSave} />
          </section>
        )}

        <section className="log-column">
          <ProgressCharts today={today} refreshKey={saveCount} />
          {!entries && !error && <p className="empty">Loading…</p>}
          {entries?.length === 0 && (
            <p className="empty">No entries yet. Rate your skin today to start your log.</p>
          )}
          {entries?.length > 0 && (
            <ul className="log-list">
              {entries.map((item) => (
                <li key={item.date}>
                  <button
                    type="button"
                    className="panel log-entry"
                    aria-current={item.date === date ? 'true' : undefined}
                    onClick={() => selectDate(item.date)}
                  >
                    <span className="log-heading">
                      <span className="log-date">{formatDate(item.date)}</span>
                      {item.skin_rating && (
                        <span className="tag">
                          {item.skin_rating}/5{' '}
                          {RATINGS.find((rating) => rating.value === item.skin_rating).label}
                        </span>
                      )}
                    </span>
                    {item.notes && <span className="log-notes">{item.notes}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
