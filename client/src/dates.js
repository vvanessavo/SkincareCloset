// Local date, because toISOString is UTC and would be tomorrow on a US evening.
// Built from parts, because new Date('YYYY-MM-DD') is UTC and can show the day before.
export function formatDate(date) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function addDays(date, offset) {
  const [year, month, day] = date.split('-').map(Number);
  return localDate(new Date(year, month - 1, day + offset));
}

export function localDate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
