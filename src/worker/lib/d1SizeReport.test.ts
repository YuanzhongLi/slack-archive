import { describe, expect, it } from 'vitest';
import { parseD1SizeReportFrequency, shouldSendD1SizeReport } from './d1SizeReport';

describe('parseD1SizeReportFrequency', () => {
  it.each(['Month', 'Week', 'Day', 'None'])('accepts %s', (v) => {
    expect(parseD1SizeReportFrequency(v)).toBe(v);
  });

  it.each(['month', 'DAY', 'Daily', '', ' Day', 'true', undefined, null, 1])('rejects %s', (v) => {
    expect(parseD1SizeReportFrequency(v)).toBeNull();
  });
});

describe('shouldSendD1SizeReport (JST)', () => {
  // The cron runs at 17:00 UTC = 02:00 JST of the next day.
  const at = (iso: string) => new Date(iso);

  it('Day always sends', () => {
    expect(shouldSendD1SizeReport('Day', at('2026-10-27T17:00:00Z'))).toBe(true);
  });

  it('None never sends', () => {
    expect(shouldSendD1SizeReport('None', at('2026-10-31T17:00:00Z'))).toBe(false);
    expect(shouldSendD1SizeReport('None', at('2026-11-01T00:00:00Z'))).toBe(false);
  });

  describe('Month', () => {
    it('sends on the 1st in JST (cron time: Oct 31 17:00 UTC)', () => {
      expect(shouldSendD1SizeReport('Month', at('2026-10-31T17:00:00Z'))).toBe(true);
    });

    it('does not send on the 2nd in JST', () => {
      expect(shouldSendD1SizeReport('Month', at('2026-11-01T17:00:00Z'))).toBe(false);
    });

    it('uses the JST date at the UTC/JST boundary', () => {
      // 2026-10-31T14:59:59Z = Oct 31 23:59:59 JST -> not the 1st
      expect(shouldSendD1SizeReport('Month', at('2026-10-31T14:59:59Z'))).toBe(false);
      // 2026-10-31T15:00:00Z = Nov 1 00:00:00 JST -> the 1st
      expect(shouldSendD1SizeReport('Month', at('2026-10-31T15:00:00Z'))).toBe(true);
    });

    it('handles year rollover', () => {
      expect(shouldSendD1SizeReport('Month', at('2026-12-31T17:00:00Z'))).toBe(true);
    });
  });

  describe('Week vs Month are independent', () => {
    // 2026-11-07T17:00Z = 2026-11-08 02:00 JST (Sunday, not the 1st)
    it('Sunday that is not the 1st: Week sends, Month does not', () => {
      const d = at('2026-11-07T17:00:00Z');
      expect(shouldSendD1SizeReport('Week', d)).toBe(true);
      expect(shouldSendD1SizeReport('Month', d)).toBe(false);
    });

    // 2026-11-30T17:00Z = 2026-12-01 02:00 JST (Tuesday, the 1st)
    it('1st that is not a Sunday: Month sends, Week does not', () => {
      const d = at('2026-11-30T17:00:00Z');
      expect(shouldSendD1SizeReport('Month', d)).toBe(true);
      expect(shouldSendD1SizeReport('Week', d)).toBe(false);
    });
  });

  describe('Week', () => {
    it('sends on Sunday in JST (cron time: Saturday 17:00 UTC)', () => {
      // 2026-10-31 is Saturday (UTC) -> Sunday Nov 1 JST
      expect(shouldSendD1SizeReport('Week', at('2026-10-31T17:00:00Z'))).toBe(true);
    });

    it('does not send on other days', () => {
      expect(shouldSendD1SizeReport('Week', at('2026-10-26T17:00:00Z'))).toBe(false);
      expect(shouldSendD1SizeReport('Week', at('2026-11-01T17:00:00Z'))).toBe(false);
    });

    it('uses the JST day at the UTC/JST boundary', () => {
      // Saturday 14:59:59Z = Saturday 23:59:59 JST
      expect(shouldSendD1SizeReport('Week', at('2026-10-31T14:59:59Z'))).toBe(false);
      // Saturday 15:00:00Z = Sunday 00:00:00 JST
      expect(shouldSendD1SizeReport('Week', at('2026-10-31T15:00:00Z'))).toBe(true);
    });
  });
});
