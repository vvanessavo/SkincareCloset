export const EXPIRY_WARNING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

// A product is still usable on its expiry date, so that day reads as "soon".
export function expiryStatus(expiresOn, today) {
  if (!expiresOn) return null;

  const days = Math.round((Date.parse(expiresOn) - Date.parse(today)) / DAY_MS);
  if (days < 0) {
    const ago = -days;
    return { level: 'expired', label: `Expired ${ago} ${ago === 1 ? 'day' : 'days'} ago` };
  }
  if (days > EXPIRY_WARNING_DAYS) return null;
  if (days === 0) return { level: 'soon', label: 'Expires today' };
  return { level: 'soon', label: `Expires in ${days} ${days === 1 ? 'day' : 'days'}` };
}
