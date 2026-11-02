import { useEffect, useState } from 'react';
import { getCalendar } from '../api.js';
import { formatDate, localDate } from '../dates.js';
import { ProgressRing } from './ProgressRing.jsx';
import { RATINGS } from './SkinLogForm.jsx';

const WEEKDAYS = [
  ['Su', 'Sunday'],
  ['Mo', 'Monday'],
  ['Tu', 'Tuesday'],
  ['We', 'Wednesday'],
  ['Th', 'Thursday'],
  ['Fr', 'Friday'],
  ['Sa', 'Saturday'],
];

function shiftMonth(month, offset) {
  const [year, monthNumber] = month.split('-').map(Number);
  return localDate(new Date(year, monthNumber - 1 + offset, 1)).slice(0, 7);
}

function monthLabel(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(year, monthNumber - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

// Weeks of dates, with nulls filling the days outside the month.
function buildWeeks(month) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstWeekday = new Date(year, monthNumber - 1, 1).getDay();
  const dayCount = new Date(year, monthNumber, 0).getDate();

  const cells = Array(firstWeekday).fill(null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  }
  while (cells.length % 7) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function describeDay(date, day) {
  const parts = [formatDate(date)];
  parts.push(day?.percent ? `${day.percent}% of routine done` : 'no routine steps done');
  if (day?.skin_rating) parts.push(`skin rated ${day.skin_rating} out of 5`);
  return parts.join(', ');
}

export function ProgressCalendar({ today, selected, onSelect, liveDay }) {
  const [month, setMonth] = useState(selected.slice(0, 7));
  const [days, setDays] = useState([]);
  const [error, setError] = useState(null);

  // Opening a day in another month, such as going back from the 1st, shows that month.
  useEffect(() => {
    setMonth(selected.slice(0, 7));
  }, [selected]);

  useEffect(() => {
    let isCurrent = true;
    getCalendar(month)
      .then((data) => {
        if (!isCurrent) return;
        setDays(data);
        setError(null);
      })
      .catch((err) => {
        if (isCurrent) setError(err.message);
      });
    return () => {
      isCurrent = false;
    };
  }, [month]);

  const byDate = new Map(days.map((day) => [day.date, day]));
  // The open day comes from the checklist, so ticking a step moves its ring straight away.
  if (liveDay) {
    byDate.set(liveDay.date, {
      ...byDate.get(liveDay.date),
      date: liveDay.date,
      percent: liveDay.percent,
      complete: liveDay.percent === 100,
    });
  }

  const selectedDay = byDate.get(selected);
  const rating = RATINGS.find((item) => item.value === selectedDay?.skin_rating);

  return (
    <section className="panel calendar" aria-label="Progress calendar">
      <div className="calendar-header">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ‹
        </button>
        <h2 aria-live="polite">{monthLabel(month)}</h2>
        <button
          type="button"
          aria-label="Next month"
          disabled={month >= today.slice(0, 7)}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          ›
        </button>
      </div>

      {error && <p className="step-empty">Couldn't load this month: {error}</p>}

      <table className="calendar-grid">
        <thead>
          <tr>
            {WEEKDAYS.map(([short, full]) => (
              <th key={short} scope="col" abbr={full}>
                {short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {buildWeeks(month).map((week) => (
            <tr key={week.find(Boolean)}>
              {week.map((date, index) =>
                date ? (
                  <td key={date}>
                    <button
                      type="button"
                      className={byDate.get(date)?.complete ? 'calendar-day complete' : 'calendar-day'}
                      aria-label={describeDay(date, byDate.get(date))}
                      aria-pressed={date === selected}
                      aria-current={date === today ? 'date' : undefined}
                      title={describeDay(date, byDate.get(date))}
                      disabled={date > today}
                      onClick={() => onSelect(date)}
                    >
                      <ProgressRing
                        percent={byDate.get(date)?.percent ?? 0}
                        size={38}
                        strokeWidth={3}
                      >
                        {Number(date.slice(-2))}
                      </ProgressRing>
                    </button>
                  </td>
                ) : (
                  <td key={`blank-${index}`} />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="calendar-detail" aria-live="polite">
        <p className="calendar-detail-date">{formatDate(selected)}</p>
        <p>
          {selectedDay?.percent
            ? `${selectedDay.percent}% of routine done`
            : 'No routine steps done'}
          {rating && ` · Skin ${rating.value}/5 ${rating.label}`}
        </p>
        {selectedDay?.notes && <p className="log-notes">{selectedDay.notes}</p>}
      </div>

      <p className="calendar-key">
        Each ring shows how much of that day's routine was done. A filled circle means the day
        counted toward your streak. Choose a day to see or fill it in.
      </p>
    </section>
  );
}
