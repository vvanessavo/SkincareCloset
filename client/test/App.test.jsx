import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App.jsx';

const serum = {
  id: 1,
  name: 'Vitamin C Serum',
  brand: 'Acme',
  category: 'serum',
  ingredients: ['ascorbic acid', 'ferulic acid'],
  opened_on: '2026-01-15',
  expires_on: null,
  notes: null,
};

function jsonResponse(status, body) {
  return new Response(status === 204 ? null : JSON.stringify(body), { status });
}

// Stands in for the API: GET returns `products`, other methods use `respond`.
function mockApi(products, respond) {
  const fetchMock = vi.fn(async (url, options = {}) => {
    if (!options.method) return jsonResponse(200, products);
    return respond(url, options);
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

describe('App', () => {
  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    window.history.replaceState(null, '', '#products');
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });

  it('lists products', async () => {
    mockApi([serum]);
    render(<App />);

    expect(await screen.findByRole('heading', { name: serum.name })).toBeTruthy();
    expect(screen.getByText('ascorbic acid, ferulic acid')).toBeTruthy();
  });

  it('shows an empty state', async () => {
    mockApi([]);
    render(<App />);

    expect(await screen.findByText(/No products yet/)).toBeTruthy();
  });

  it('shows an error when products fail to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    render(<App />);

    expect((await screen.findByRole('alert')).textContent).toBe('Request failed (500)');
  });

  it('adds a product and closes the form', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([], () => jsonResponse(201, serum));
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    await user.type(screen.getByLabelText('Name'), 'Toner');
    await user.type(screen.getByLabelText('Ingredients'), 'water, zinc');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
    expect(sentRequests(fetchMock)).toEqual([
      {
        url: '/api/products',
        method: 'POST',
        body: {
          name: 'Toner',
          brand: '',
          category: '',
          ingredients: ['water', 'zinc'],
          opened_on: null,
          expires_on: null,
          notes: '',
        },
      },
    ]);
  });

  it('edits a product, sending every field', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([serum], () => jsonResponse(200, serum));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: `Edit ${serum.name}` }));
    const name = screen.getByLabelText('Name');
    expect(name.value).toBe(serum.name);
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
    const [sent] = sentRequests(fetchMock);
    expect(sent.url).toBe(`/api/products/${serum.id}`);
    expect(sent.method).toBe('PUT');
    expect(sent.body).toMatchObject({
      name: 'Renamed',
      brand: serum.brand,
      ingredients: serum.ingredients,
      opened_on: serum.opened_on,
    });
  });

  it('keeps the form open with the API error when a save fails', async () => {
    const user = userEvent.setup();
    mockApi([], () => jsonResponse(400, { error: 'name is required' }));
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Add product' }));
    await user.type(screen.getByLabelText('Name'), '   ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect((await screen.findByRole('alert')).textContent).toBe('name is required');
    expect(screen.getByLabelText('Name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(false);
  });

  it('switches the form when editing a different product', async () => {
    const user = userEvent.setup();
    const toner = { ...serum, id: 2, name: 'Toner' };
    mockApi([serum, toner]);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: `Edit ${serum.name}` }));
    await user.click(screen.getByRole('button', { name: `Edit ${toner.name}` }));

    expect(screen.getByLabelText('Name').value).toBe(toner.name);
  });

  describe('pictures', () => {
    const photo = new File(['bytes'], 'bottle.png', { type: 'image/png' });
    const withPicture = { ...serum, image_url: '/api/uploads/serum.png' };

    beforeEach(() => {
      vi.stubGlobal('URL', Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:preview'),
        revokeObjectURL: vi.fn(),
      }));
    });

    function imageRequests(fetchMock) {
      return fetchMock.mock.calls
        .filter(([url, options]) => url.endsWith('/image') && options?.method)
        .map(([url, options]) => ({ url, method: options.method, body: options.body }));
    }

    it('shows a picture, or a letter when there is none', async () => {
      mockApi([withPicture, { ...serum, id: 2, name: 'toner', image_url: null }]);
      const { container } = render(<App />);

      const image = await screen.findByRole('img', { name: serum.name });
      expect(image.getAttribute('src')).toBe(withPicture.image_url);
      expect(container.querySelector('.placeholder').textContent).toBe('T');
    });

    it('falls back to the letter when a picture fails to load', async () => {
      mockApi([withPicture]);
      const { container } = render(<App />);

      fireEvent.error(await screen.findByRole('img', { name: serum.name }));

      expect(screen.queryByRole('img', { name: serum.name })).toBeNull();
      expect(container.querySelector('.placeholder').textContent).toBe('V');
    });

    it('uploads a picture for a new product after creating it', async () => {
      const user = userEvent.setup();
      const fetchMock = mockApi([], () => jsonResponse(201, { ...serum, id: 7 }));
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Add product' }));
      await user.type(screen.getByLabelText('Name'), 'Toner');
      await user.upload(screen.getByLabelText('Picture'), photo);
      expect(screen.getByRole('img', { name: 'Toner' }).getAttribute('src')).toBe('blob:preview');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
      expect(imageRequests(fetchMock)).toEqual([
        { url: '/api/products/7/image', method: 'PUT', body: photo },
      ]);
      expect(fetchMock.mock.calls.find(([url]) => url.endsWith('/image'))[1].headers).toEqual({
        'Content-Type': 'image/png',
      });
    });

    it('removes a picture when saving', async () => {
      const user = userEvent.setup();
      const fetchMock = mockApi([withPicture], () => jsonResponse(200, withPicture));
      render(<App />);

      await user.click(await screen.findByRole('button', { name: `Edit ${serum.name}` }));
      await user.click(screen.getByRole('button', { name: 'Remove picture' }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
      expect(imageRequests(fetchMock)).toEqual([
        { url: `/api/products/${serum.id}/image`, method: 'DELETE', body: undefined },
      ]);
    });

    it('leaves the picture alone when it was not changed', async () => {
      const user = userEvent.setup();
      const fetchMock = mockApi([withPicture], () => jsonResponse(200, withPicture));
      render(<App />);

      await user.click(await screen.findByRole('button', { name: `Edit ${serum.name}` }));
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
      expect(imageRequests(fetchMock)).toEqual([]);
    });

    it('rejects an unsupported file before saving', async () => {
      const user = userEvent.setup({ applyAccept: false });
      const fetchMock = mockApi([]);
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Add product' }));
      await user.upload(
        screen.getByLabelText('Picture'),
        new File(['x'], 'bottle.heic', { type: 'image/heic' }),
      );

      expect(screen.getByRole('alert').textContent).toMatch(/JPEG, PNG or WebP/);
      expect(imageRequests(fetchMock)).toEqual([]);
    });

    it('rejects a picture over the size limit', async () => {
      const user = userEvent.setup();
      mockApi([]);
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Add product' }));
      await user.upload(
        screen.getByLabelText('Picture'),
        new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' }),
      );

      expect(screen.getByRole('alert').textContent).toMatch(/under 5 MB/);
    });

    it('closes the form and reports it when only the picture fails', async () => {
      const user = userEvent.setup();
      mockApi([], (url) =>
        url.endsWith('/image')
          ? jsonResponse(415, { error: 'Picture must be a JPEG, PNG or WebP image' })
          : jsonResponse(201, { ...serum, id: 7, name: 'Toner' }),
      );
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Add product' }));
      await user.type(screen.getByLabelText('Name'), 'Toner');
      await user.upload(screen.getByLabelText('Picture'), photo);
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect((await screen.findByRole('alert')).textContent).toMatch(
        /^Toner was saved, but its picture wasn't/,
      );
      expect(screen.queryByLabelText('Name')).toBeNull();
    });

    it('asks before discarding a chosen picture', async () => {
      const user = userEvent.setup();
      mockApi([]);
      render(<App />);

      await user.click(screen.getByRole('button', { name: 'Add product' }));
      await user.upload(screen.getByLabelText('Picture'), photo);
      await user.click(screen.getByRole('button', { name: 'Routines' }));

      expect(window.confirm).toHaveBeenCalledWith('Discard unsaved changes?');
    });
  });

  describe('unsaved changes', () => {
    const toner = { ...serum, id: 2, name: 'Toner' };

    async function editWithChanges(user) {
      await user.click(await screen.findByRole('button', { name: `Edit ${serum.name}` }));
      await user.type(screen.getByLabelText('Brand'), ' Labs');
    }

    it('does not ask when the form has no changes', async () => {
      const user = userEvent.setup();
      mockApi([serum, toner]);
      render(<App />);

      await user.click(await screen.findByRole('button', { name: `Edit ${serum.name}` }));
      await user.click(screen.getByRole('button', { name: 'Add product' }));
      await user.click(screen.getByRole('button', { name: 'Routines' }));

      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('stops asking once a change is undone', async () => {
      const user = userEvent.setup();
      mockApi([serum, toner]);
      render(<App />);

      await user.click(await screen.findByRole('button', { name: `Edit ${serum.name}` }));
      await user.type(screen.getByLabelText('Brand'), 'x{Backspace}');
      await user.click(screen.getByRole('button', { name: `Edit ${toner.name}` }));

      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('keeps the edits when opening another product is declined', async () => {
      const user = userEvent.setup();
      window.confirm.mockReturnValue(false);
      mockApi([serum, toner]);
      render(<App />);

      await editWithChanges(user);
      await user.click(screen.getByRole('button', { name: `Edit ${toner.name}` }));

      expect(screen.getByLabelText('Brand').value).toBe('Acme Labs');
      expect(screen.getByLabelText('Name').value).toBe(serum.name);
    });

    it('keeps the edits when adding a product is declined', async () => {
      const user = userEvent.setup();
      window.confirm.mockReturnValue(false);
      mockApi([serum]);
      render(<App />);

      await editWithChanges(user);
      await user.click(screen.getByRole('button', { name: 'Add product' }));

      expect(screen.getByLabelText('Brand').value).toBe('Acme Labs');
    });

    it('keeps the edits when switching tabs is declined', async () => {
      const user = userEvent.setup();
      window.confirm.mockReturnValue(false);
      mockApi([serum]);
      render(<App />);

      await editWithChanges(user);
      await user.click(screen.getByRole('button', { name: 'Routines' }));

      expect(screen.getByLabelText('Brand').value).toBe('Acme Labs');
      expect(window.location.hash).toBe('#products');
    });

    it('opens the other product when discarding is confirmed', async () => {
      const user = userEvent.setup();
      mockApi([serum, toner]);
      render(<App />);

      await editWithChanges(user);
      await user.click(screen.getByRole('button', { name: `Edit ${toner.name}` }));

      expect(screen.getByLabelText('Name').value).toBe(toner.name);
    });

    it('does not ask when reopening the product being edited', async () => {
      const user = userEvent.setup();
      mockApi([serum]);
      render(<App />);

      await editWithChanges(user);
      await user.click(screen.getByRole('button', { name: `Edit ${serum.name}` }));

      expect(window.confirm).not.toHaveBeenCalled();
      expect(screen.getByLabelText('Brand').value).toBe('Acme Labs');
    });

    it('does not ask after a save', async () => {
      const user = userEvent.setup();
      mockApi([serum], () => jsonResponse(200, serum));
      render(<App />);

      await editWithChanges(user);
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
      await user.click(screen.getByRole('button', { name: 'Routines' }));

      expect(window.confirm).not.toHaveBeenCalled();
    });

    it('warns before leaving the page only while there are changes', async () => {
      const user = userEvent.setup();
      mockApi([serum]);
      render(<App />);

      function leavePage() {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      }

      expect(leavePage()).toBe(false);
      await editWithChanges(user);
      expect(leavePage()).toBe(true);
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(leavePage()).toBe(false);
    });
  });

  describe('tabs', () => {
    it('reopens the tab from the URL after a reload', async () => {
      const user = userEvent.setup();
      mockApi([]);
      const { unmount } = render(<App />);

      await user.click(screen.getByRole('button', { name: 'Routines' }));
      expect(window.location.hash).toBe('#routines');
      unmount();
      render(<App />);

      expect(screen.getByRole('heading', { name: 'Routines' })).toBeTruthy();
    });

    it('opens on routines by default, listed first', () => {
      window.history.replaceState(null, '', '/');
      mockApi([]);
      render(<App />);

      expect(screen.getByRole('heading', { name: 'Routines' })).toBeTruthy();
      expect(screen.getAllByRole('button').slice(0, 2).map((tab) => tab.textContent)).toEqual([
        'Routines',
        'Products',
      ]);
    });

    it('falls back to routines for an unknown hash', () => {
      window.history.replaceState(null, '', '#nope');
      mockApi([]);
      render(<App />);

      expect(screen.getByRole('heading', { name: 'Routines' })).toBeTruthy();
    });
  });

  it('clears the delete error when the form opens', async () => {
    const user = userEvent.setup();
    mockApi([serum], () => jsonResponse(409, { error: 'Product is used in a routine' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: `Delete ${serum.name}` }));
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Add product' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('deletes a product after confirming', async () => {
    const user = userEvent.setup();
    const fetchMock = mockApi([serum], () => jsonResponse(204));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: `Delete ${serum.name}` }));

    await waitFor(() =>
      expect(sentRequests(fetchMock)).toEqual([
        { url: `/api/products/${serum.id}`, method: 'DELETE', body: undefined },
      ]),
    );
  });

  it('does not delete when the confirmation is declined', async () => {
    const user = userEvent.setup();
    window.confirm.mockReturnValue(false);
    const fetchMock = mockApi([serum]);
    render(<App />);

    await user.click(await screen.findByRole('button', { name: `Delete ${serum.name}` }));

    expect(sentRequests(fetchMock)).toEqual([]);
  });

  it('explains why a product in a routine cannot be deleted', async () => {
    const user = userEvent.setup();
    mockApi([serum], () => jsonResponse(409, { error: 'Product is used in a routine' }));
    render(<App />);

    await user.click(await screen.findByRole('button', { name: `Delete ${serum.name}` }));

    expect((await screen.findByRole('alert')).textContent).toBe('Product is used in a routine');
    expect(screen.getByRole('heading', { name: serum.name })).toBeTruthy();
  });
});
