async function request(path, { body, file, ...options } = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: file
      ? { 'Content-Type': file.type }
      : body
        ? { 'Content-Type': 'application/json' }
        : undefined,
    body: file ?? (body ? JSON.stringify(body) : undefined),
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

export function uploadProductImage(id, file) {
  return request(`/products/${id}/image`, { method: 'PUT', file });
}

export function deleteProductImage(id) {
  return request(`/products/${id}/image`, { method: 'DELETE' });
}

export function copyCatalogImage(id, code) {
  return request(`/products/${id}/image/from-catalog`, { method: 'PUT', body: { code } });
}

export function searchCatalog(query, signal) {
  return request(`/catalog/search?q=${encodeURIComponent(query)}`, { signal });
}

export function getChecklist(date) {
  return request(`/checklist?date=${date}`);
}

export function setStepDone(date, stepId, done) {
  return request(`/checklist/${date}/steps/${stepId}`, { method: 'PUT', body: { done } });
}

export function listLogs() {
  return request('/logs');
}

export function saveLog(date, log) {
  return request(`/logs/${date}`, { method: 'PUT', body: log });
}

export function listRoutines() {
  return request('/routines');
}

export function createRoutine(routine) {
  return request('/routines', { method: 'POST', body: routine });
}

export function updateRoutine(id, routine) {
  return request(`/routines/${id}`, { method: 'PUT', body: routine });
}

export function deleteRoutine(id) {
  return request(`/routines/${id}`, { method: 'DELETE' });
}

export function addRoutineStep(routineId, productId) {
  return request(`/routines/${routineId}/steps`, {
    method: 'POST',
    body: { product_id: productId },
  });
}

export function removeRoutineStep(routineId, stepId) {
  return request(`/routines/${routineId}/steps/${stepId}`, { method: 'DELETE' });
}

export function reorderRoutineSteps(routineId, stepIds) {
  return request(`/routines/${routineId}/steps/order`, {
    method: 'PUT',
    body: { step_ids: stepIds },
  });
}
