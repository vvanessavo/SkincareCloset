import { localDate } from './dates.js';

function addDays(date, offset) {
  const [year, month, day] = date.split('-').map(Number);
  return localDate(new Date(year, month - 1, day + offset));
}

function shortDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function rangeStart(today, dayCount) {
  return addDays(today, 1 - dayCount);
}

// One slot per day, so gaps in the log show as gaps in time.
export function buildDays(rows, today, dayCount) {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(today, index + 1 - dayCount);
    return { date, ...byDate.get(date) };
  });
}

export function summarize(days) {
  const ratings = days.map((day) => day.skin_rating).filter(Boolean);
  const average = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null;

  return {
    ratingCount: ratings.length,
    averageRating: average === null ? null : average.toFixed(1),
    finishedDays: days.filter((day) => day.complete).length,
    dayCount: days.length,
  };
}

function baseOptions(days, tooltipLabel) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? false : undefined,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      // One series per chart, so the chart's heading names it.
      legend: { display: false },
      tooltip: {
        displayColors: false,
        filter: (item) => item.raw !== null,
        callbacks: {
          title: ([item]) => (item ? shortDate(days[item.dataIndex].date) : ''),
          label: tooltipLabel,
        },
      },
    },
  };
}

function axes(colors, days, y) {
  return {
    x: {
      grid: { display: false },
      border: { color: colors.border },
      ticks: {
        color: colors.muted,
        autoSkip: true,
        maxTicksLimit: 6,
        maxRotation: 0,
        callback: (_, index) => shortDate(days[index].date),
      },
    },
    y: {
      grid: { color: colors.border },
      border: { display: false },
      ticks: { color: colors.muted, ...y.ticks },
      min: y.min,
      max: y.max,
    },
  };
}

export function ratingChart(days, colors, ratingLabel) {
  return {
    type: 'line',
    data: {
      labels: days.map((day) => day.date),
      datasets: [
        {
          data: days.map((day) => day.skin_rating ?? null),
          borderColor: colors.accent,
          backgroundColor: colors.accent,
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointHitRadius: 12,
          pointBorderColor: colors.surface,
          pointBorderWidth: 2,
          // Ratings are occasional, so the line carries on across unlogged days.
          spanGaps: true,
          // Dots on the top and bottom gridlines would otherwise be cut in half.
          clip: false,
        },
      ],
    },
    options: {
      ...baseOptions(days, (item) => `${item.raw}/5 ${ratingLabel(item.raw)}`),
      layout: { padding: { top: 6, right: 6, bottom: 2 } },
      scales: axes(colors, days, { min: 1, max: 5, ticks: { stepSize: 1 } }),
    },
  };
}

export function completionChart(days, colors) {
  return {
    type: 'bar',
    data: {
      labels: days.map((day) => day.date),
      datasets: [
        {
          data: days.map((day) => day.percent ?? null),
          backgroundColor: colors.accent,
          borderRadius: { topLeft: 4, topRight: 4 },
          categoryPercentage: 0.9,
          barPercentage: 0.9,
        },
      ],
    },
    options: {
      ...baseOptions(days, (item) => `${item.raw}% of routine done`),
      scales: axes(colors, days, {
        min: 0,
        max: 100,
        ticks: { stepSize: 25, callback: (value) => `${value}%` },
      }),
    },
  };
}
