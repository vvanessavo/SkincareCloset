// Stands in for fetch in the demo build: requests go to the in-browser backend.
import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { createBackend, restoreFiles, UPLOADS_DIR } from './backend.js';
import catalog from './catalog.json';
import { seedDemo } from './seed.js';
import { clearState, loadState, saveState } from './store.js';

let backendPromise = null;
let saveTimer = null;
const objectUrls = new Map();

async function start() {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = await loadState();
  if (saved) {
    restoreFiles(saved.files);
    return createBackend(new SQL.Database(saved.database), { catalog });
  }

  restoreFiles([]);
  const backend = createBackend(new SQL.Database(), { catalog });
  await seedDemo(backend.request);
  await saveState(backend.save());
  return backend;
}

function backend() {
  backendPromise ??= start();
  return backendPromise;
}

function scheduleSave(current) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(current.save()), 300);
}

// Pictures can't be served from a static site, so their paths become blob URLs.
function pictureUrl(path, files) {
  const file = files.get(`${UPLOADS_DIR}/${path.slice('/api/uploads/'.length)}`);
  if (!file) return path;
  if (!objectUrls.has(path)) {
    const type = path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    objectUrls.set(path, URL.createObjectURL(new Blob([file], { type })));
  }
  return objectUrls.get(path);
}

function withPictureUrls(value, files) {
  if (typeof value === 'string') {
    return value.startsWith('/api/uploads/') ? pictureUrl(value, files) : value;
  }
  if (Array.isArray(value)) return value.map((item) => withPictureUrls(item, files));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withPictureUrls(item, files)]),
    );
  }
  return value;
}

async function readBody(body) {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return JSON.parse(body);
  return globalThis.Buffer.from(await body.arrayBuffer());
}

export async function demoFetch(url, { method = 'GET', body } = {}) {
  const current = await backend();
  const res = await current.request(method, url, await readBody(body));
  if (method !== 'GET' && res.status < 400) scheduleSave(current);

  const payload = res.status === 204 ? null : JSON.stringify(withPictureUrls(res.body, current.files));
  return new Response(payload, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function resetDemo() {
  clearTimeout(saveTimer);
  await clearState();
  window.location.reload();
}
