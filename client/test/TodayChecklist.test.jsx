import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.jsx';
import { localDate } from '../src/dates.js';

function step(id, name, done = false) {
  return { id, done, product: { id, name, brand: null, category: null, image_url: null } };
}

function checklist(overrides = {}) {
  return {
    date: localDate(),
    day_complete: false,
    steps_done: 2,
    steps_total: 3,
    percent: 66,
    streak: 4,
    routines: [
      {
        id: 1,
        name: 'Daily',
        period: 'AM',
        complete: false,
        steps: [step(10, 'Cleanser'), step(11, 'Sunscreen', true)],
      },
      { id: 2, name: 'Night', period: 'PM', complete: true, steps: [step(20, 'Retinol', true)] },
    ],
    ...overrides,
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status });
}

function mockApi({ get = () => jsonResponse(200, checklist()), put, calendar = () => [] }) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method) return put(url, options);
    if (url.startsWith('/api/logs/calendar')) return jsonResponse(200, calendar(url));
    if (url === '/api/products') return jsonResponse(200, []);
    return get(url);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderToday() {
  window.history.replaceState(null, '', '#today');
  render(<App />);
}

describe('localDate', () => {
  it('uses the local day late in the evening', () => {
    expect(localDate(new Date(2026, 9, 30, 23, 30))).toBe('2026-10-30');
  });

  it('pads the month and day', () => {
    expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('TodayChecklist', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it("asks for today's local date", async () => {
    const fetchMock = mockApi({});
    renderToday();

    await screen.findByRole('checkbox', { name: /Cleanser/ });

    expect(fetchMock.mock.calls[0][0]).toBe(`/api/checklist?date=${localDate()}&today=1`);
  });

  it('shows steps by time of day with the streak', async () => {
    mockApi({});
    renderToday();

    expect((await screen.findByRole('checkbox', { name: /Cleanser/ })).checked).toBe(false);
    expect(screen.getByRole('checkbox', { name: /Sunscreen/ }).checked).toBe(true);
    expect(screen.getByRole('heading', { name: 'Morning' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Evening' })).toBeTruthy();
    expect(screen.getByLabelText('4-day streak')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  describe('progress ring', () => {
    it("shows the percentage of today's routine", async () => {
      mockApi({});
      renderToday();

      expect(await screen.findByRole('img', { name: "66% of today's routine done" })).toBeTruthy();
      expect(screen.getByText('66%')).toBeTruthy();
      expect(screen.getByText('2 of 3 steps done')).toBeTruthy();
    });

    it('updates after a tick', async () => {
      const user = userEvent.setup();
      mockApi({
        put: () =>
          jsonResponse(200, checklist({ percent: 100, steps_done: 3, day_complete: true })),
      });
      renderToday();

      await user.click(await screen.findByRole('checkbox', { name: /Cleanser/ }));

      expect(await screen.findByRole('img', { name: "100% of today's routine done" })).toBeTruthy();
      expect(screen.getByText('3 of 3 steps done')).toBeTruthy();
    });

    it('draws no arc at zero', async () => {
      mockApi({ get: () => jsonResponse(200, checklist({ percent: 0, steps_done: 0 })) });
      renderToday();

      const ring = await screen.findByRole('img', { name: "0% of today's routine done" });

      expect(ring.querySelector('.progress-ring-fill')).toBeNull();
    });

    it('is hidden when there are no routines', async () => {
      mockApi({ get: () => jsonResponse(200, checklist({ routines: [], percent: 0 })) });
      renderToday();

      await screen.findByText(/Add steps to a routine/);

      expect(screen.queryByRole('img', { name: /today's routine/ })).toBeNull();
    });
  });

  describe('progress calendar', () => {
    const NOW = new Date(2026, 9, 30, 12);
    const fixed = () => checklist({ date: '2026-10-30' });
    const dayButton = (name) => screen.findByRole('button', { name });

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function mockMonths(months = {}) {
      return mockApi({
        get: () => jsonResponse(200, fixed()),
        calendar: (url) => months[url.split('month=')[1]] ?? [],
      });
    }

    const october = [
      { date: '2026-10-28', percent: 100, complete: true, skin_rating: 4, notes: 'Calm' },
      { date: '2026-10-29', percent: 50, complete: false, skin_rating: null, notes: null },
    ];

    it('lays out the month on the right weekdays', async () => {
      mockMonths();
      renderToday();

      await screen.findByRole('heading', { name: 'October 2026' });
      const rows = screen.getByRole('table').querySelectorAll('tbody tr');

      expect(rows[0].cells[4].textContent).toBe('1');
      expect(rows[0].cells[3].textContent).toBe('');
      expect(rows[4].cells[6].textContent).toBe('31');
    });

    it('describes each day without relying on color', async () => {
      mockMonths({ '2026-10': october });
      renderToday();

      expect(await dayButton(/Oct 28, 2026, 100% of routine done, skin rated 4 out of 5/)).toBeTruthy();
      expect(await dayButton(/Oct 29, 2026, 50% of routine done/)).toBeTruthy();
      expect(await dayButton(/Oct 27, 2026, no routine steps done/)).toBeTruthy();
    });

    it('fills finished days only', async () => {
      mockMonths({ '2026-10': october });
      renderToday();

      const finished = await dayButton(/Oct 28, 2026, 100%/);
      const partial = await dayButton(/Oct 29, 2026, 50%/);

      expect(finished.classList.contains('complete')).toBe(true);
      expect(partial.classList.contains('complete')).toBe(false);
    });

    it('shows a day when it is selected', async () => {
      const user = userEvent.setup();
      mockMonths({ '2026-10': october });
      renderToday();

      await user.click(await dayButton(/Oct 28, 2026, 100%/));

      expect(screen.getByText(/100% of routine done · Skin 4\/5 Good/)).toBeTruthy();
      expect(screen.getByText('Calm')).toBeTruthy();
    });

    it("moves today's ring with the checklist", async () => {
      const user = userEvent.setup();
      mockApi({
        get: () => jsonResponse(200, fixed()),
        put: () => jsonResponse(200, { ...fixed(), percent: 100, day_complete: true }),
      });
      renderToday();

      expect(await dayButton(/Oct 30, 2026, 66%/)).toBeTruthy();
      await user.click(screen.getByRole('checkbox', { name: /Cleanser/ }));

      expect((await dayButton(/Oct 30, 2026, 100%/)).classList.contains('complete')).toBe(true);
    });

    it('moves between months but not past this one', async () => {
      const user = userEvent.setup();
      const fetchMock = mockMonths();
      renderToday();

      const next = await screen.findByRole('button', { name: 'Next month' });
      expect(next.disabled).toBe(true);

      await user.click(screen.getByRole('button', { name: 'Previous month' }));

      expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeTruthy();
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        '/api/logs/calendar?month=2026-09',
      );
      expect(next.disabled).toBe(false);
    });

    it('crosses the year boundary', async () => {
      const user = userEvent.setup();
      mockMonths();
      renderToday();

      const previous = await screen.findByRole('button', { name: 'Previous month' });
      for (let i = 0; i < 10; i += 1) await user.click(previous);

      expect(await screen.findByRole('heading', { name: 'December 2025' })).toBeTruthy();
    });

    it('disables future days', async () => {
      vi.setSystemTime(new Date(2026, 9, 15, 12));
      mockApi({
        get: () => jsonResponse(200, checklist({ date: '2026-10-15' })),
      });
      renderToday();

      expect((await dayButton(/Oct 16, 2026/)).disabled).toBe(true);
      expect((await dayButton(/Oct 15, 2026/)).disabled).toBe(false);
    });

    it('keeps working when a month fails to load', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url) =>
          url.startsWith('/api/logs/calendar')
            ? new Response('', { status: 500 })
            : jsonResponse(200, fixed()),
        ),
      );
      renderToday();

      expect(await screen.findByText(/Couldn't load this month/)).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: /Cleanser/ })).toBeTruthy();
    });
  });

  it('warns about an expired product on its step without changing its name', async () => {
    const expired = step(10, 'Cleanser');
    expired.product.expires_on = '2020-01-01';
    const [morning] = checklist().routines;
    mockApi({
      get: () => jsonResponse(200, checklist({ routines: [{ ...morning, steps: [expired] }] })),
    });
    renderToday();

    expect(await screen.findByText(/Expired \d+ days ago/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Cleanser/ })).toBeTruthy();
  });

  describe('past days', () => {
    const NOW = new Date(2026, 9, 30, 12);

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: NOW });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    // Answers with whichever day was asked for, as the real API does.
    function mockDays({ put, recorded = {} } = {}) {
      return mockApi({
        get: (url) => {
          const date = new URL(url, 'http://x').searchParams.get('date');
          return jsonResponse(
            200,
            checklist({ date, recorded_percent: recorded[date] ?? null, streak: 4 }),
          );
        },
        put: put ?? ((url) => jsonResponse(200, checklist({ date: url.split('/')[3] }))),
      });
    }

    const checklistUrls = (fetchMock) =>
      fetchMock.mock.calls.map(([url]) => url).filter((url) => url.startsWith('/api/checklist?'));

    it('goes back a day without asking to re-score it', async () => {
      const user = userEvent.setup();
      const fetchMock = mockDays();
      renderToday();

      await user.click(await screen.findByRole('button', { name: '‹ Previous day' }));

      expect(await screen.findByRole('heading', { name: /Oct 29, 2026/ })).toBeTruthy();
      expect(checklistUrls(fetchMock)).toEqual([
        '/api/checklist?date=2026-10-30&today=1',
        '/api/checklist?date=2026-10-29',
      ]);
      expect(screen.getByRole('status').textContent).toMatch(/You're filling in .*Oct 29, 2026/);
      expect(screen.queryByLabelText(/day streak/)).toBeNull();
    });

    it('ticks a step for the day that is open', async () => {
      const user = userEvent.setup();
      const fetchMock = mockDays();
      renderToday();

      await user.click(await screen.findByRole('button', { name: '‹ Previous day' }));
      await screen.findByRole('heading', { name: /Oct 29, 2026/ });
      await user.click(screen.getByRole('checkbox', { name: /Cleanser/ }));

      await waitFor(() =>
        expect(fetchMock.mock.calls.find(([, options]) => options?.method)[0]).toBe(
          '/api/checklist/2026-10-29/steps/10',
        ),
      );
    });

    it('cannot go past today', async () => {
      const user = userEvent.setup();
      mockDays();
      renderToday();

      const next = await screen.findByRole('button', { name: 'Next day ›' });
      expect(next.disabled).toBe(true);

      await user.click(screen.getByRole('button', { name: '‹ Previous day' }));
      await user.click(await screen.findByRole('button', { name: 'Next day ›' }));

      expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Next day ›' }).disabled).toBe(true);
    });

    it('returns to today', async () => {
      const user = userEvent.setup();
      mockDays();
      renderToday();

      await user.click(await screen.findByRole('button', { name: '‹ Previous day' }));
      await user.click(screen.getByRole('button', { name: '‹ Previous day' }));
      await user.click(await screen.findByRole('button', { name: 'Back to today' }));

      expect(await screen.findByRole('heading', { name: 'Today' })).toBeTruthy();
      expect(screen.getByLabelText('4-day streak')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Back to today' })).toBeNull();
    });

    it('opens a day chosen in the calendar', async () => {
      const user = userEvent.setup();
      mockDays();
      renderToday();

      await user.click(await screen.findByRole('button', { name: /Oct 12, 2026/ }));

      expect(await screen.findByRole('heading', { name: /Oct 12, 2026/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Oct 12, 2026/ }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });

    it("shows the open day's month in the calendar", async () => {
      vi.setSystemTime(new Date(2026, 10, 1, 12));
      const user = userEvent.setup();
      mockDays();
      renderToday();

      await screen.findByRole('heading', { name: 'November 2026' });
      await user.click(screen.getByRole('button', { name: '‹ Previous day' }));

      expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeTruthy();
      expect(
        screen.getByRole('button', { name: /Oct 31, 2026/ }).getAttribute('aria-pressed'),
      ).toBe('true');
    });

    it('explains when routines have changed since the day was saved', async () => {
      const user = userEvent.setup();
      mockDays({ recorded: { '2026-10-29': 100 } });
      renderToday();

      await user.click(await screen.findByRole('button', { name: '‹ Previous day' }));

      expect(await screen.findByText(/this day was saved at 100%/)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Oct 29, 2026, 100%/ })).toBeTruthy();
    });

    it('says nothing extra when the saved result matches', async () => {
      const user = userEvent.setup();
      mockDays({ recorded: { '2026-10-29': 66 } });
      renderToday();

      await user.click(await screen.findByRole('button', { name: '‹ Previous day' }));
      await screen.findByRole('heading', { name: /Oct 29, 2026/ });

      expect(screen.queryByText(/saved at/)).toBeNull();
    });

    it('follows today past midnight unless a past day is open', async () => {
      const user = userEvent.setup();
      const fetchMock = mockDays();
      renderToday();
      await screen.findByRole('heading', { name: 'Today' });

      vi.setSystemTime(new Date(2026, 9, 31, 0, 10));
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });
      await waitFor(() =>
        expect(checklistUrls(fetchMock).at(-1)).toBe('/api/checklist?date=2026-10-31&today=1'),
      );

      await user.click(screen.getByRole('button', { name: '‹ Previous day' }));
      await screen.findByRole('heading', { name: /Oct 30, 2026/ });
      vi.setSystemTime(new Date(2026, 10, 1, 0, 10));
      await act(async () => {
        window.dispatchEvent(new Event('focus'));
      });

      expect(screen.getByRole('heading', { name: /Oct 30, 2026/ })).toBeTruthy();
    });
  });

  it('keeps an expiry tag next to the name so long names can wrap', async () => {
    const expired = step(10, 'Relief Sun: Rice + Probiotics SPF50+');
    expired.product.expires_on = '2020-01-01';
    const [morning] = checklist().routines;
    mockApi({
      get: () => jsonResponse(200, checklist({ routines: [{ ...morning, steps: [expired] }] })),
    });
    renderToday();

    const tag = await screen.findByText(/Expired \d+ days ago/);

    expect(tag.closest('.check-text').querySelector('.check-name').textContent).toBe(
      'Relief Sun: Rice + Probiotics SPF50+',
    );
  });

  it('leaves out a time of day with no routines', async () => {
    const [morning] = checklist().routines;
    mockApi({ get: () => jsonResponse(200, checklist({ routines: [morning] })) });
    renderToday();

    await screen.findByRole('heading', { name: 'Morning' });

    expect(screen.queryByRole('heading', { name: 'Evening' })).toBeNull();
  });

  it('points to routines when there is nothing to do', async () => {
    mockApi({ get: () => jsonResponse(200, checklist({ routines: [], streak: 0 })) });
    renderToday();

    expect(await screen.findByText(/Add steps to a routine/)).toBeTruthy();
  });

  it('ticks a step and updates the streak from the response', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({
      put: () => jsonResponse(200, checklist({ streak: 5, day_complete: true })),
    });
    renderToday();

    await user.click(await screen.findByRole('checkbox', { name: /Cleanser/ }));

    expect(await screen.findByLabelText('5-day streak')).toBeTruthy();
    expect(screen.getByText('All done for today.')).toBeTruthy();
    const [url, options] = fetchMock.mock.calls.find(([, init]) => init?.method);
    expect(url).toBe(`/api/checklist/${localDate()}/steps/10`);
    expect(JSON.parse(options.body)).toEqual({ done: true });
  });

  it('shows a tick straight away', async () => {
    const user = userEvent.setup();
    let respond;
    mockApi({ put: () => new Promise((resolve) => (respond = resolve)) });
    renderToday();

    const box = await screen.findByRole('checkbox', { name: /Cleanser/ });
    await user.click(box);

    expect(box.checked).toBe(true);
    respond(jsonResponse(200, checklist()));
    await waitFor(() => expect(box.checked).toBe(false));
  });

  it('ignores an older response after a newer tick', async () => {
    const user = userEvent.setup();
    const responses = [];
    mockApi({ put: () => new Promise((resolve) => responses.push(resolve)) });
    renderToday();

    const cleanser = await screen.findByRole('checkbox', { name: /Cleanser/ });
    const sunscreen = screen.getByRole('checkbox', { name: /Sunscreen/ });
    await user.click(cleanser);
    await user.click(sunscreen);
    responses[1](jsonResponse(200, checklist({ streak: 7 })));
    await screen.findByLabelText('7-day streak');
    await act(async () => {
      responses[0](jsonResponse(200, checklist({ streak: 1 })));
    });

    expect(screen.getByLabelText('7-day streak')).toBeTruthy();
  });

  it('restores the real state when a tick fails', async () => {
    const user = userEvent.setup();
    mockApi({ put: () => jsonResponse(404, { error: 'Step not found' }) });
    renderToday();

    const box = await screen.findByRole('checkbox', { name: /Cleanser/ });
    await user.click(box);

    expect((await screen.findByRole('alert')).textContent).toBe('Step not found');
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Cleanser/ }).checked).toBe(false));
  });

  it('reloads when the window regains focus', async () => {
    const fetchMock = mockApi({});
    renderToday();
    await screen.findByRole('checkbox', { name: /Cleanser/ });

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(fetchMock.mock.calls.filter(([url]) => url.startsWith('/api/checklist'))).toHaveLength(2);
  });

  it('stops reloading after leaving the page', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({});
    renderToday();
    await screen.findByRole('checkbox', { name: /Cleanser/ });

    await user.click(screen.getByRole('button', { name: 'Products' }));
    fetchMock.mockClear();
    window.dispatchEvent(new Event('focus'));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows an error when the checklist fails to load', async () => {
    mockApi({ get: () => new Response('', { status: 500 }) });
    renderToday();

    expect((await screen.findByRole('alert')).textContent).toBe('Request failed (500)');
  });
});
