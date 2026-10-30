import { useEffect, useMemo, useState } from 'react';
import { getHistory } from '../api.js';
import {
  buildDays,
  completionChart,
  rangeStart,
  ratingChart,
  summarize,
} from '../progressCharts.js';
import { ChartCanvas } from './ChartCanvas.jsx';
import { RATINGS } from './SkinLogForm.jsx';

const RANGES = [30, 90];

function ratingLabel(value) {
  return RATINGS.find((rating) => rating.value === value)?.label ?? '';
}

export function ProgressCharts({ today, refreshKey }) {
  const [dayCount, setDayCount] = useState(RANGES[0]);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCurrent = true;
    getHistory(rangeStart(today, dayCount), today)
      .then((data) => {
        if (!isCurrent) return;
        setRows(data);
        setError(null);
      })
      .catch((err) => {
        if (isCurrent) setError(err.message);
      });
    return () => {
      isCurrent = false;
    };
  }, [today, dayCount, refreshKey]);

  const days = useMemo(() => buildDays(rows ?? [], today, dayCount), [rows, today, dayCount]);
  const summary = summarize(days);
  const buildRating = useMemo(
    () => (colors) => ratingChart(days, colors, ratingLabel),
    [days],
  );
  const buildCompletion = useMemo(() => (colors) => completionChart(days, colors), [days]);

  const hasRatings = summary.ratingCount > 0;
  const hasRoutine = days.some((day) => day.percent > 0);

  return (
    <section className="panel charts" aria-label="Progress charts">
      <div className="charts-header">
        <h2>Progress</h2>
        <div className="chart-range">
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={range === dayCount}
              onClick={() => setDayCount(range)}
            >
              {range} days
            </button>
          ))}
        </div>
      </div>

      {error && <p className="step-empty">Couldn't load your progress: {error}</p>}

      {rows && !hasRatings && !hasRoutine && (
        <p className="step-empty">Rate your skin or tick off a routine to see your progress here.</p>
      )}

      {(hasRatings || hasRoutine) && (
        <p className="charts-summary">
          {hasRatings && `Average skin rating ${summary.averageRating}/5 · `}
          {summary.finishedDays} of {summary.dayCount} days finished
        </p>
      )}

      {hasRatings && (
        <div>
          <h3 className="chart-title">Skin rating</h3>
          <ChartCanvas
            buildConfig={buildRating}
            label={`Skin rating over the last ${dayCount} days, averaging ${summary.averageRating} out of 5 across ${summary.ratingCount} entries`}
          />
        </div>
      )}

      {hasRoutine && (
        <div>
          <h3 className="chart-title">Routine completed</h3>
          <ChartCanvas
            buildConfig={buildCompletion}
            label={`Routine completion over the last ${dayCount} days, with ${summary.finishedDays} days finished`}
          />
        </div>
      )}
    </section>
  );
}
