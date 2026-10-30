import { describe, expect, it } from 'vitest';
import { expiryStatus } from '../src/expiry.js';

const TODAY = '2026-10-30';

describe('expiryStatus', () => {
  it('ignores products with no expiry date', () => {
    expect(expiryStatus(null, TODAY)).toBeNull();
    expect(expiryStatus(undefined, TODAY)).toBeNull();
  });

  it('ignores products with more than 30 days left', () => {
    expect(expiryStatus('2026-11-30', TODAY)).toBeNull();
    expect(expiryStatus('2030-01-01', TODAY)).toBeNull();
  });

  it('warns from 30 days out', () => {
    expect(expiryStatus('2026-11-29', TODAY)).toEqual({
      level: 'soon',
      label: 'Expires in 30 days',
    });
  });

  it('uses singular wording', () => {
    expect(expiryStatus('2026-10-31', TODAY).label).toBe('Expires in 1 day');
    expect(expiryStatus('2026-10-29', TODAY).label).toBe('Expired 1 day ago');
  });

  it('counts the expiry date itself as still usable', () => {
    expect(expiryStatus(TODAY, TODAY)).toEqual({ level: 'soon', label: 'Expires today' });
  });

  it('marks past dates as expired', () => {
    expect(expiryStatus('2026-07-15', TODAY)).toEqual({
      level: 'expired',
      label: 'Expired 107 days ago',
    });
  });

  it('counts whole days across a daylight saving change', () => {
    expect(expiryStatus('2026-11-02', '2026-10-31').label).toBe('Expires in 2 days');
    expect(expiryStatus('2026-03-09', '2026-03-07').label).toBe('Expires in 2 days');
  });
});
