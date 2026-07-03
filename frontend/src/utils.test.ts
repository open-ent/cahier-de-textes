import { describe, expect, it } from 'vitest';

import { addDays, formatDate, sortKey, ymd } from './utils';

describe('ymd', () => {
  it('formate en YYYY-MM-DD', () => {
    expect(ymd(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('addDays', () => {
  it('ajoute des jours', () => {
    expect(ymd(addDays(new Date(2026, 8, 30), 2))).toBe('2026-10-02');
  });
});

describe('formatDate', () => {
  it('convertit YYYY-MM-DD en jj/mm/aaaa', () => {
    expect(formatDate('2026-09-15')).toBe('15/09/2026');
    expect(formatDate('2026-09-15T00:00:00')).toBe('15/09/2026');
    expect(formatDate('')).toBe('');
  });
});

describe('sortKey', () => {
  it('ordonne chronologiquement (absent en dernier)', () => {
    expect(sortKey('2026-01-01') < sortKey('2026-12-31')).toBe(true);
    expect(sortKey(undefined)).toBe('9999-99-99');
  });
});
