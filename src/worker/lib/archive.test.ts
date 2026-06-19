import { describe, expect, it } from 'vitest';
import { ARCHIVE_CUTOFF_DAYS, cutoffIso } from './archive';

describe('ARCHIVE_CUTOFF_DAYS', () => {
  it('is 91', () => {
    expect(ARCHIVE_CUTOFF_DAYS).toBe(91);
  });
});

describe('cutoffIso', () => {
  it('returns an ISO8601 string', () => {
    const result = cutoffIso();
    expect(() => new Date(result)).not.toThrow();
    expect(new Date(result).toISOString()).toBe(result);
  });

  it('is approximately 91 days before now', () => {
    const before = Date.now();
    const result = cutoffIso();
    const after = Date.now();

    const expected = 91 * 24 * 60 * 60 * 1000;
    const ts = new Date(result).getTime();

    expect(before - ts).toBeGreaterThanOrEqual(expected - 1000);
    expect(after - ts).toBeLessThanOrEqual(expected + 1000);
  });

  it('is strictly less than now', () => {
    expect(new Date(cutoffIso()).getTime()).toBeLessThan(Date.now());
  });
});
