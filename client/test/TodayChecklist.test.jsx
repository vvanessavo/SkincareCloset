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

function mockApi({ get = () => jsonResponse(200, checklist()), put }) {
  const fetchMock = vi.fn(async (url, options = {}) => (options.method ? put(url, options) : get()));
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

    expect(fetchMock.mock.calls[0][0]).toBe(`/api/checklist?date=${localDate()}`);
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
