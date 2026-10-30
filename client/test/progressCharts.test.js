import { describe, expect, it } from 'vitest';
import {
  buildDays,
  completionChart,
  rangeStart,
  ratingChart,
  summarize,
} from '../src/progressCharts.js';

const TODAY = '2026-10-30';
const COLORS = { accent: '#111', border: '#222', muted: '#333', surface: '#444' };

describe('rangeStart', () => {
  it('counts today as the last day of the range', () => {
    expect(rangeStart(TODAY, 30)).toBe('2026-10-01');
    expect(rangeStart('2026-03-05', 30)).toBe('2026-02-04');
  });
});

describe('buildDays', () => {
  it('gives one slot per day, ending today', () => {
    const days = buildDays([], TODAY, 30);

    expect(days).toHaveLength(30);
    expect(days[0].date).toBe('2026-10-01');
    expect(days[29].date).toBe(TODAY);
  });

  it('crosses a month and keeps days in place', () => {
    const days = buildDays([{ date: '2026-09-30', percent: 50 }], '2026-10-02', 3);

    expect(days.map((day) => day.date)).toEqual(['2026-09-30', '2026-10-01', '2026-10-02']);
    expect(days[0].percent).toBe(50);
    expect(days[1].percent).toBeUndefined();
  });

  it('does not skip or repeat a day across daylight saving', () => {
    const days = buildDays([], '2026-11-03', 5).map((day) => day.date);

    expect(days).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
  });
});

describe('summarize', () => {
  it('averages only the days with a rating', () => {
    const summary = summarize([
      { date: 'a', skin_rating: 4 },
      { date: 'b', skin_rating: null },
      { date: 'c' },
      { date: 'd', skin_rating: 3 },
    ]);

    expect(summary.averageRating).toBe('3.5');
    expect(summary.ratingCount).toBe(2);
  });

  it('counts finished days out of the whole range', () => {
    const summary = summarize([{ complete: true }, { complete: false }, {}]);

    expect(summary.finishedDays).toBe(1);
    expect(summary.dayCount).toBe(3);
  });

  it('has no average without ratings', () => {
    expect(summarize([{}]).averageRating).toBeNull();
  });
});

describe('ratingChart', () => {
  const days = [
    { date: '2026-10-28', skin_rating: 2 },
    { date: '2026-10-29' },
    { date: '2026-10-30', skin_rating: 4 },
  ];
  const config = ratingChart(days, COLORS, () => 'Good');

  it('plots ratings with gaps for unlogged days', () => {
    expect(config.type).toBe('line');
    expect(config.data.datasets[0].data).toEqual([2, null, 4]);
    expect(config.data.datasets[0].spanGaps).toBe(true);
  });

  it('keeps the axis fixed to the rating scale', () => {
    expect(config.options.scales.y.min).toBe(1);
    expect(config.options.scales.y.max).toBe(5);
    expect(config.options.scales.y.ticks.stepSize).toBe(1);
  });

  it('has a single y axis and no legend', () => {
    expect(Object.keys(config.options.scales)).toEqual(['x', 'y']);
    expect(config.options.plugins.legend.display).toBe(false);
  });

  it('labels tooltips in words and skips empty days', () => {
    const { tooltip } = config.options.plugins;

    expect(tooltip.callbacks.label({ raw: 4 })).toBe('4/5 Good');
    expect(tooltip.callbacks.title([{ dataIndex: 2 }])).toContain('30');
    expect(tooltip.filter({ raw: null })).toBe(false);
    expect(tooltip.filter({ raw: 3 })).toBe(true);
  });
});

describe('completionChart', () => {
  const days = [
    { date: '2026-10-28', percent: 100 },
    { date: '2026-10-29' },
    { date: '2026-10-30', percent: 0 },
  ];
  const config = completionChart(days, COLORS);

  it('plots percentages and leaves unrecorded days empty', () => {
    expect(config.type).toBe('bar');
    expect(config.data.datasets[0].data).toEqual([100, null, 0]);
  });

  it('keeps a full 0 to 100 axis', () => {
    expect(config.options.scales.y.min).toBe(0);
    expect(config.options.scales.y.max).toBe(100);
    expect(config.options.scales.y.ticks.callback(50)).toBe('50%');
  });

  it('labels tooltips', () => {
    expect(config.options.plugins.tooltip.callbacks.label({ raw: 75 })).toBe(
      '75% of routine done',
    );
  });
});
