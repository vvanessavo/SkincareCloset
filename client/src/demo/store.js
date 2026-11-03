// Saves the demo in this browser. Private windows and blocked storage fall back to
// memory, so the demo still works, it just starts fresh next time.
const DB_NAME = 'skincare-tracker-demo';
const KEY = 'state-v1';

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('state');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const request = action(db.transaction('state', mode).objectStore('state'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export async function loadState() {
  try {
    return (await withStore('readonly', (store) => store.get(KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function saveState(state) {
  try {
    await withStore('readwrite', (store) => store.put(state, KEY));
  } catch {
    // Nothing to do: the demo keeps running from memory.
  }
}

export async function clearState() {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    // Already unavailable, so there's nothing saved to clear.
  }
}
