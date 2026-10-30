import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.jsx';
import { formatDate, localDate } from '../src/dates.js';

// Canvas isn't available in the test browser, so this records what would be drawn.
const charts = vi.hoisted(() => []);

vi.mock('chart.js', () => {
  class Chart {
    static register() {}

    constructor(canvas, config) {
      this.config = config;
      this.destroyed = false;
      charts.push(this);
    }

    destroy() {
      this.destroyed = true;
    }
  }
  return {
    Chart,
    BarController: {},
    BarElement: {},
    CategoryScale: {},
    LinearScale: {},
    LineController: {},
    LineElement: {},
    PointElement: {},
    Tooltip: {},
  };
});

const TODAY = localDate();
const EARLIER = '2026-01-15';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status });
}

// A small stand-in that remembers saves, so the page reloads what it just wrote.
function mockApi(initial = [], { failSave, history } = {}) {
  let entries = initial;
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (url.startsWith('/api/logs/history')) return jsonResponse(200, history ?? entries);
    if (!options.method) return jsonResponse(200, url === '/api/logs' ? entries : []);
    if (failSave) return jsonResponse(400, { error: failSave });

    const date = url.split('/').at(-1);
    const log = JSON.parse(options.body);
    const saved = { date, skin_rating: log.skin_rating, notes: log.notes.trim() || null };
    entries = [saved, ...entries.filter((entry) => entry.date !== date)];
    return jsonResponse(200, saved);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sent(fetchMock) {
  return fetchMock.mock.calls
    .filter(([, options]) => options?.method)
    .map(([url, options]) => ({ url, body: JSON.parse(options.body) }));
}

function renderLog() {
  window.history.replaceState(null, '', '#skin-log');
  render(<App />);
}

describe('formatDate', () => {
  it('shows the same calendar day it was given', () => {
    expect(formatDate('2026-01-15')).toContain('15');
    expect(formatDate('2026-01-01')).toContain('2026');
  });
});

describe('SkinLog', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('starts on today with an empty log', async () => {
    mockApi();
    renderLog();

    expect(await screen.findByText(/No entries yet/)).toBeTruthy();
    expect(screen.getByLabelText('Day').value).toBe(TODAY);
    expect(screen.getByLabelText('Day').max).toBe(TODAY);
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
  });

  it('saves a rating and a note for today', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi();
    renderLog();

    await user.click(await screen.findByRole('radio', { name: '4 Good' }));
    await user.type(screen.getByLabelText('Notes'), 'Calm');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('button', { name: 'Saved' })).toBeTruthy();
    expect(sent(fetchMock)).toEqual([
      { url: `/api/logs/${TODAY}`, body: { skin_rating: 4, notes: 'Calm' } },
    ]);
    expect(screen.getByText('4/5 Good')).toBeTruthy();
    expect(screen.getByRole('radio', { name: '4 Good' }).checked).toBe(true);
  });

  it('does not warn about unsaved changes after saving', async () => {
    const user = userEvent.setup();
    mockApi();
    renderLog();

    await user.click(await screen.findByRole('radio', { name: '4 Good' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByRole('button', { name: 'Saved' });
    await user.click(screen.getByRole('button', { name: 'Products' }));

    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('saves a note with no rating', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi();
    renderLog();

    await user.type(await screen.findByLabelText('Notes'), 'Breakout');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(sent(fetchMock)[0].body).toEqual({ skin_rating: null, notes: 'Breakout' }),
    );
  });

  it('opens a past entry from the list and edits it', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([{ date: EARLIER, skin_rating: 2, notes: 'Dry patches' }]);
    renderLog();

    await user.click(await screen.findByRole('button', { name: /Dry patches/ }));

    expect(screen.getByLabelText('Day').value).toBe(EARLIER);
    expect(screen.getByLabelText('Notes').value).toBe('Dry patches');
    expect(screen.getByRole('radio', { name: '2 Not great' }).checked).toBe(true);

    await user.click(screen.getByRole('radio', { name: '3 Okay' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(sent(fetchMock)[0]?.url).toBe(`/api/logs/${EARLIER}`));
  });

  it('logs a past day chosen with the date picker', async () => {
    mockApi();
    renderLog();

    const day = await screen.findByLabelText('Day');
    fireEvent.change(day, { target: { value: EARLIER } });

    expect(day.value).toBe(EARLIER);
  });

  it('ignores future and empty dates', async () => {
    mockApi();
    renderLog();

    const day = await screen.findByLabelText('Day');
    fireEvent.change(day, { target: { value: '2999-01-01' } });
    expect(day.value).toBe(TODAY);
    fireEvent.change(day, { target: { value: '' } });
    expect(day.value).toBe(TODAY);
  });

  it('clears a rating', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([{ date: TODAY, skin_rating: 3, notes: 'Fine' }]);
    renderLog();

    await user.click(await screen.findByRole('button', { name: 'Clear rating' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(sent(fetchMock)[0].body).toEqual({ skin_rating: null, notes: 'Fine' }),
    );
  });

  it('keeps an unsaved entry when moving away is declined', async () => {
    const user = userEvent.setup();
    window.confirm.mockReturnValue(false);
    mockApi([{ date: EARLIER, skin_rating: 2, notes: 'Dry patches' }]);
    renderLog();

    await user.type(await screen.findByLabelText('Notes'), 'Half written');
    await user.click(screen.getByRole('button', { name: /Dry patches/ }));

    expect(screen.getByLabelText('Notes').value).toBe('Half written');
    expect(screen.getByLabelText('Day').value).toBe(TODAY);
  });

  it('keeps the entry and shows the error when a save fails', async () => {
    const user = userEvent.setup();
    mockApi([], { failSave: 'notes must be a string' });
    renderLog();

    await user.type(await screen.findByLabelText('Notes'), 'Calm');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe('notes must be a string');
    expect(screen.getByLabelText('Notes').value).toBe('Calm');
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false);
  });

  it('shows an error when the log fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    renderLog();

    expect((await screen.findByRole('alert')).textContent).toBe('Request failed (500)');
  });

  describe('progress charts', () => {
    const live = () => charts.filter((chart) => !chart.destroyed);
    const rows = [
      { date: TODAY, percent: 50, complete: false, skin_rating: 4, notes: null },
    ];

    afterEach(() => {
      charts.length = 0;
    });

    it('asks for the last 30 days, ending today', async () => {
      const fetchMock = mockApi();
      renderLog();

      await screen.findByText(/Rate your skin or tick off/);

      expect(fetchMock.mock.calls.map(([url]) => url).find((url) => url.includes('history'))).toMatch(
        new RegExp(`from=\\d{4}-\\d{2}-\\d{2}&to=${TODAY}$`),
      );
    });

    it('draws two separate charts with a summary', async () => {
      mockApi([], { history: rows });
      renderLog();

      expect(await screen.findByText(/Average skin rating 4\.0\/5 · 0 of 30 days finished/)).toBeTruthy();
      expect(live().map((chart) => chart.config.type)).toEqual(['line', 'bar']);
      expect(screen.getByRole('img', { name: /Skin rating over the last 30 days/ })).toBeTruthy();
      expect(screen.getByRole('img', { name: /Routine completion over the last 30 days/ })).toBeTruthy();
    });

    it('only draws the chart it has data for', async () => {
      mockApi([], { history: [{ ...rows[0], skin_rating: null }] });
      renderLog();

      await screen.findByText('Routine completed');

      expect(screen.queryByText('Skin rating')).toBeNull();
      expect(live().map((chart) => chart.config.type)).toEqual(['bar']);
    });

    it('switches to 90 days', async () => {
      const user = userEvent.setup();
      mockApi([], { history: rows });
      renderLog();

      await screen.findByText('Routine completed');
      await user.click(screen.getByRole('button', { name: '90 days' }));

      await waitFor(() => expect(live()[0].config.data.labels).toHaveLength(90));
      expect(screen.getByRole('button', { name: '90 days' }).getAttribute('aria-pressed')).toBe('true');
      expect(live()).toHaveLength(2);
    });

    it('updates after a save', async () => {
      const user = userEvent.setup();
      mockApi();
      renderLog();

      await user.click(await screen.findByRole('radio', { name: '5 Great' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(await screen.findByText(/Average skin rating 5\.0\/5/)).toBeTruthy();
    });

    it('cleans up charts when leaving the page', async () => {
      const user = userEvent.setup();
      mockApi([], { history: rows });
      renderLog();

      await screen.findByText('Routine completed');
      await user.click(screen.getByRole('button', { name: 'Products' }));

      expect(live()).toEqual([]);
    });

    it('keeps the log usable when the charts fail to load', async () => {
      const fetchMock = mockApi();
      fetchMock.mockImplementation(async (url) =>
        url.startsWith('/api/logs/history')
          ? new Response('', { status: 500 })
          : jsonResponse(200, []),
      );
      renderLog();

      expect(await screen.findByText(/Couldn't load your progress/)).toBeTruthy();
      expect(screen.getByLabelText('Notes')).toBeTruthy();
    });
  });

  describe('overnight', () => {
    const NOW = new Date(2026, 9, 30, 23, 50);
    const NEXT_DAY = new Date(2026, 9, 31, 0, 10);

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    });

    async function goToNextDay() {
      vi.setSystemTime(NEXT_DAY);
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
    }

    it('moves to the new day when the window regains focus', async () => {
      mockApi();
      renderLog();
      const day = await screen.findByLabelText('Day');

      await goToNextDay();

      expect(day.value).toBe('2026-10-31');
    });

    it('stays put with a half-written entry', async () => {
      const user = userEvent.setup();
      mockApi();
      renderLog();
      await user.type(await screen.findByLabelText('Notes'), 'Half written');

      await goToNextDay();

      expect(screen.getByLabelText('Day').value).toBe('2026-10-30');
      expect(screen.getByLabelText('Day').max).toBe('2026-10-31');
      expect(screen.getByLabelText('Notes').value).toBe('Half written');
    });

    it('stays on a past day that was chosen', async () => {
      mockApi();
      renderLog();
      const day = await screen.findByLabelText('Day');
      fireEvent.change(day, { target: { value: EARLIER } });

      await goToNextDay();

      expect(day.value).toBe(EARLIER);
    });
  });
});
