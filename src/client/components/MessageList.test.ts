import { describe, expect, it } from 'vitest';
import { formatDateLabel, isSameDay, slackTsToDate } from './MessageList';

const t = (key: string) => {
  const map: Record<string, string> = {
    'messageList.today': 'Today',
    'messageList.yesterday': 'Yesterday',
  };
  return map[key] ?? key;
};

const tJa = (key: string) => {
  const map: Record<string, string> = {
    'messageList.today': '今日',
    'messageList.yesterday': '昨日',
  };
  return map[key] ?? key;
};

describe('slackTsToDate', () => {
  it('converts slack timestamp to Date', () => {
    const date = slackTsToDate('1750000000.000000');
    expect(date).toBeInstanceOf(Date);
    expect(date.getTime()).toBe(1750000000 * 1000);
  });

  it('returns NaN Date for invalid input', () => {
    const date = slackTsToDate('invalid');
    expect(Number.isNaN(date.getTime())).toBe(true);
  });
});

describe('isSameDay', () => {
  it('returns true for same day', () => {
    const a = new Date(2026, 5, 16, 8, 0);
    const b = new Date(2026, 5, 16, 23, 59);
    expect(isSameDay(a, b)).toBe(true);
  });

  it('returns false for different days', () => {
    const a = new Date(2026, 5, 15, 23, 59);
    const b = new Date(2026, 5, 16, 0, 0);
    expect(isSameDay(a, b)).toBe(false);
  });

  it('returns false for different months', () => {
    const a = new Date(2026, 5, 16);
    const b = new Date(2026, 6, 16);
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe('formatDateLabel', () => {
  const today = new Date(2026, 5, 19); // 2026-06-19

  it('returns today label for same day (en)', () => {
    const date = new Date(2026, 5, 19, 10, 30);
    expect(formatDateLabel(date, today, t, 'en')).toBe('Today');
  });

  it('returns today label for same day (ja)', () => {
    const date = new Date(2026, 5, 19, 10, 30);
    expect(formatDateLabel(date, today, tJa, 'ja')).toBe('今日');
  });

  it('returns yesterday label for 1 day ago (en)', () => {
    const date = new Date(2026, 5, 18, 10, 30);
    expect(formatDateLabel(date, today, t, 'en')).toBe('Yesterday');
  });

  it('returns yesterday label for 1 day ago (ja)', () => {
    const date = new Date(2026, 5, 18, 10, 30);
    expect(formatDateLabel(date, today, tJa, 'ja')).toBe('昨日');
  });

  it('returns locale-formatted date for older dates (en)', () => {
    const date = new Date(2026, 5, 16, 10, 30);
    const result = formatDateLabel(date, today, t, 'en');
    expect(result).toBe('June 16, 2026');
  });

  it('returns locale-formatted date for older dates (ja)', () => {
    const date = new Date(2026, 5, 16, 10, 30);
    const result = formatDateLabel(date, today, tJa, 'ja');
    expect(result).toBe('2026年6月16日');
  });

  it('handles midnight boundary correctly (today vs yesterday)', () => {
    const justBeforeMidnight = new Date(2026, 5, 18, 23, 59, 59);
    const justAfterMidnight = new Date(2026, 5, 19, 0, 0, 0);
    expect(formatDateLabel(justBeforeMidnight, today, t, 'en')).toBe('Yesterday');
    expect(formatDateLabel(justAfterMidnight, today, t, 'en')).toBe('Today');
  });

  it('returns locale-formatted date for future dates (diffDays < 0)', () => {
    const future = new Date(2026, 5, 25, 10, 0);
    expect(formatDateLabel(future, today, t, 'en')).toBe('June 25, 2026');
  });

  it('handles year boundary correctly (Dec 31 when today is Jan 2)', () => {
    const todayJan2 = new Date(2027, 0, 2);
    const dec31 = new Date(2026, 11, 31, 10, 0);
    expect(formatDateLabel(dec31, todayJan2, t, 'en')).toBe('December 31, 2026');
  });
});
