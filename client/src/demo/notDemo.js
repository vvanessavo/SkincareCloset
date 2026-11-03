// Normal builds load this instead of the demo transport, so they don't carry SQLite.
export function demoFetch() {
  throw new Error('The demo backend is only available in the demo build');
}

export function resetDemo() {}
