export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value);
  // The round trip rejects dates that roll over, like 2026-02-31.
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function previousDay(date) {
  // Date.parse reads YYYY-MM-DD as UTC, so daylight saving can't skip a day.
  return new Date(Date.parse(date) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
