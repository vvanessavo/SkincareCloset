import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.jsx';

const cleanser = { id: 1, name: 'Cleanser', brand: null, ingredients: [] };
const serum = { id: 2, name: 'Serum', brand: 'Acme', ingredients: [] };
const toner = { id: 3, name: 'Toner', brand: null, ingredients: [] };

const morning = {
  id: 10,
  name: 'Daily',
  period: 'AM',
  steps: [
    { id: 100, product: cleanser },
    { id: 101, product: serum },
    { id: 102, product: toner },
  ],
};
const evening = { id: 11, name: 'Wind down', period: 'PM', steps: [] };

function jsonResponse(status, body) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status });
}

// Stands in for the API: GETs return fixtures, other methods use `respond`.
function mockApi({ routines = [morning, evening], products = [cleanser, serum, toner], respond }) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (options.method) return respond(url, options);
    return jsonResponse(200, url === '/api/products' ? products : routines);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function sentRequests(fetchMock) {
  return fetchMock.mock.calls
    .filter(([, options]) => options?.method)
    .map(([url, options]) => ({
      url,
      method: options.method,
      body: options.body && JSON.parse(options.body),
    }));
}

async function openRoutines(user) {
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Routines' }));
}

describe('RoutineBuilder', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('groups routines by period and shows steps in order', async () => {
    const user = userEvent.setup();
    mockApi({});
    await openRoutines(user);

    const morningColumn = (await screen.findByRole('heading', { name: 'Morning' })).parentElement;
    const eveningColumn = screen.getByRole('heading', { name: 'Evening' }).parentElement;

    expect(within(morningColumn).getByRole('heading', { name: 'Daily' })).toBeTruthy();
    expect(within(eveningColumn).getByRole('heading', { name: 'Wind down' })).toBeTruthy();
    expect(
      within(morningColumn)
        .getAllByRole('listitem')
        .slice(1)
        .map((item) => item.querySelector('.step-name').textContent),
    ).toEqual(['Cleanser', 'Serum (Acme)', 'Toner']);
  });

  it('shows empty states', async () => {
    const user = userEvent.setup();
    mockApi({ routines: [] });
    await openRoutines(user);

    expect(await screen.findByText('No morning routines yet.')).toBeTruthy();
    expect(screen.getByText('No evening routines yet.')).toBeTruthy();
  });

  it('creates a routine', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ routines: [], respond: () => jsonResponse(201, evening) });
    await openRoutines(user);

    await user.click(screen.getByRole('button', { name: 'New routine' }));
    await user.type(screen.getByLabelText('Routine name'), 'Wind down');
    await user.selectOptions(screen.getByLabelText('Time of day'), 'PM');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByLabelText('Routine name')).toBeNull());
    expect(sentRequests(fetchMock)).toEqual([
      { url: '/api/routines', method: 'POST', body: { name: 'Wind down', period: 'PM' } },
    ]);
  });

  it('keeps the form open with the API error when a save fails', async () => {
    const user = userEvent.setup();
    mockApi({ routines: [], respond: () => jsonResponse(400, { error: 'name is required' }) });
    await openRoutines(user);

    await user.click(screen.getByRole('button', { name: 'New routine' }));
    await user.type(screen.getByLabelText('Routine name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe('name is required');
    expect(screen.getByLabelText('Routine name')).toBeTruthy();
  });

  it('renames a routine', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ respond: () => jsonResponse(200, morning) });
    await openRoutines(user);

    await user.click(await screen.findByRole('button', { name: 'Rename Daily' }));
    const name = screen.getByLabelText('Routine name');
    expect(name.value).toBe('Daily');
    await user.clear(name);
    await user.type(name, 'Weekday');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByLabelText('Routine name')).toBeNull());
    expect(sentRequests(fetchMock)).toEqual([
      { url: '/api/routines/10', method: 'PUT', body: { name: 'Weekday', period: 'AM' } },
    ]);
  });

  it('deletes a routine after confirming', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ respond: () => jsonResponse(204) });
    await openRoutines(user);

    await user.click(await screen.findByRole('button', { name: 'Delete Daily' }));

    await waitFor(() =>
      expect(sentRequests(fetchMock)).toEqual([
        { url: '/api/routines/10', method: 'DELETE', body: undefined },
      ]),
    );
  });

  it('does not delete a routine when the confirmation is declined', async () => {
    const user = userEvent.setup();
    window.confirm.mockReturnValue(false);
    const fetchMock = mockApi({});
    await openRoutines(user);

    await user.click(await screen.findByRole('button', { name: 'Delete Daily' }));

    expect(sentRequests(fetchMock)).toEqual([]);
  });

  it('adds the chosen product as a step', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ respond: () => jsonResponse(201, evening) });
    await openRoutines(user);

    const select = await screen.findByLabelText('Product to add to Wind down');
    await user.selectOptions(select, 'Serum (Acme)');
    await user.click(within(select.parentElement).getByRole('button', { name: 'Add step' }));

    await waitFor(() =>
      expect(sentRequests(fetchMock)).toEqual([
        { url: '/api/routines/11/steps', method: 'POST', body: { product_id: serum.id } },
      ]),
    );
    expect(select.value).toBe('');
  });

  it('needs a product chosen before adding a step', async () => {
    const user = userEvent.setup();
    mockApi({});
    await openRoutines(user);

    const select = await screen.findByLabelText('Product to add to Wind down');

    expect(within(select.parentElement).getByRole('button', { name: 'Add step' }).disabled).toBe(true);
  });

  it('points to the library when there are no products', async () => {
    const user = userEvent.setup();
    mockApi({ products: [], routines: [evening] });
    await openRoutines(user);

    expect(await screen.findByText(/Add a product to your library/)).toBeTruthy();
  });

  it('moves a step up and down', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ respond: () => jsonResponse(200, morning) });
    await openRoutines(user);

    await user.click(await screen.findByRole('button', { name: 'Move Serum up' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move Cleanser down' }).disabled).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: 'Move Cleanser down' }));

    await waitFor(() => expect(sentRequests(fetchMock)).toHaveLength(2));
    expect(sentRequests(fetchMock).map((sent) => sent.body.step_ids)).toEqual([
      [101, 100, 102],
      [101, 100, 102],
    ]);
    expect(sentRequests(fetchMock)[0].url).toBe('/api/routines/10/steps/order');
  });

  it('cannot move steps past the ends', async () => {
    const user = userEvent.setup();
    mockApi({});
    await openRoutines(user);

    expect((await screen.findByRole('button', { name: 'Move Cleanser up' })).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Move Toner down' }).disabled).toBe(true);
  });

  it('removes a step', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi({ respond: () => jsonResponse(200, morning) });
    await openRoutines(user);

    await user.click(await screen.findByRole('button', { name: 'Remove Serum' }));

    await waitFor(() =>
      expect(sentRequests(fetchMock)).toEqual([
        { url: '/api/routines/10/steps/101', method: 'DELETE', body: undefined },
      ]),
    );
  });

  it('shows the API error when a step change fails', async () => {
    const user = userEvent.setup();
    mockApi({ respond: () => jsonResponse(404, { error: 'Step not found' }) });
    await openRoutines(user);

    await user.click(await screen.findByRole('button', { name: 'Remove Serum' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Step not found');
  });
});
