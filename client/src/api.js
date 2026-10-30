async function request(path, { body, ...options } = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;

  // A proxy failure has no JSON body, so fall back to the status.
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data;
}

export function listProducts() {
  return request('/products');
}

export function createProduct(product) {
  return request('/products', { method: 'POST', body: product });
}

export function updateProduct(id, product) {
  return request(`/products/${id}`, { method: 'PUT', body: product });
}

export function deleteProduct(id) {
  return request(`/products/${id}`, { method: 'DELETE' });
}
