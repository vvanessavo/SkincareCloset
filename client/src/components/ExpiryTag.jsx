import { localDate } from '../dates.js';
import { expiryStatus } from '../expiry.js';

export function ExpiryTag({ expiresOn }) {
  const status = expiryStatus(expiresOn, localDate());
  if (!status) return null;

  return (
    <span className={`expiry-tag ${status.level}`}>
      <span aria-hidden="true">⚠</span> {status.label}
    </span>
  );
}
