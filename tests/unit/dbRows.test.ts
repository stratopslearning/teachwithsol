import { describe, expect, it } from 'vitest';

import { asDate, asDateOr, parseJsonb, rowsFromExecute } from '@/lib/db/rows';

describe('lib/db/rows', () => {
  it('reads rows from either driver shape', () => {
    expect(rowsFromExecute<{ a: number }>({ rows: [{ a: 1 }] })).toEqual([{ a: 1 }]);
    expect(rowsFromExecute<{ a: number }>([{ a: 2 }])).toEqual([{ a: 2 }]);
    expect(rowsFromExecute({})).toEqual([]);
  });

  it('parses jsonb that arrives as a string or a value', () => {
    expect(parseJsonb<{ x: number }>('{"x":1}')).toEqual({ x: 1 });
    expect(parseJsonb<{ x: number }>({ x: 2 })).toEqual({ x: 2 });
    expect(parseJsonb(null)).toBeNull();
  });

  it('asDate keeps null as null and parses strings', () => {
    expect(asDate(null)).toBeNull();
    expect(asDate(undefined)).toBeNull();
    expect(asDate('2026-01-02T00:00:00.000Z')?.toISOString()).toBe('2026-01-02T00:00:00.000Z');
    const d = new Date();
    expect(asDate(d)).toBe(d);
  });

  it('asDateOr uses the fallback only when the value is missing', () => {
    expect(asDateOr(null, new Date(0)).getTime()).toBe(0);
    expect(asDateOr('2026-01-02T00:00:00.000Z', new Date(0)).toISOString()).toBe(
      '2026-01-02T00:00:00.000Z',
    );
    const now = new Date('2030-01-01T00:00:00.000Z');
    expect(asDateOr(undefined, () => now)).toBe(now);
  });
});
