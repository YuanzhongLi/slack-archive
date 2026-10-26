import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db/client', () => ({ createDb: vi.fn() }));
vi.mock('./services/sync/syncService', () => ({
  syncAll: vi.fn(),
  fullResyncAll: vi.fn(),
}));
vi.mock('./services/alarm/d1SizeCheck', () => ({ getD1SizeMb: vi.fn() }));
vi.mock('./services/alarm/slackWebhook', () => ({ sendAlarm: vi.fn() }));

import { runScheduled } from './scheduled';
import { createDb } from './db/client';
import { getD1SizeMb } from './services/alarm/d1SizeCheck';
import { sendAlarm } from './services/alarm/slackWebhook';
import { syncAll, fullResyncAll } from './services/sync/syncService';
import { createTestDb, makeMockEnv, ROOT_EMAIL } from './test/helpers';
import type { Db } from './db/client';

const createDbMock = vi.mocked(createDb);
const syncAllMock = vi.mocked(syncAll);
const fullResyncAllMock = vi.mocked(fullResyncAll);
const getD1SizeMbMock = vi.mocked(getD1SizeMb);
const sendAlarmMock = vi.mocked(sendAlarm);

const WEBHOOK_URL = 'https://hooks.slack.com/services/test';

function makeEnv(overrides: Partial<Env> = {}): Env {
  return makeMockEnv({
    DEV_USER_EMAIL: ROOT_EMAIL,
    SLACK_ALARM_WEBHOOK_URL: WEBHOOK_URL,
    D1_ALARM_SIZE_THRESHOLD_MB: '400' as unknown as never,
    D1_SIZE_REPORT_FREQUENCY: 'None' as unknown as never,
    ...overrides,
  });
}

let db: Db;

beforeEach(() => {
  db = createTestDb();
  createDbMock.mockReturnValue(db);
  syncAllMock.mockResolvedValue({ channelCount: 2, messageCount: 5 });
  fullResyncAllMock.mockResolvedValue(undefined);
  getD1SizeMbMock.mockResolvedValue(10);
  sendAlarmMock.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// D1 size check logic
// ---------------------------------------------------------------------------

describe('scheduled: D1 size check', () => {
  describe('when size is below threshold', () => {
    beforeEach(() => {
      getD1SizeMbMock.mockResolvedValue(10); // 10 MB < 400 MB
    });

    const freq = (v: string | undefined) =>
      makeEnv({ D1_SIZE_REPORT_FREQUENCY: v as unknown as never });
    // 2026-10-31T17:00Z = 2026-11-01 02:00 JST (Sunday, 1st of month): the real cron time
    const SUNDAY_FIRST = '2026-10-31T17:00:00Z';
    // 2026-11-02T17:00Z = 2026-11-03 02:00 JST (Tuesday, 3rd)
    const TUESDAY_THIRD = '2026-11-02T17:00:00Z';
    // 2026-11-07T17:00Z = 2026-11-08 02:00 JST (Sunday, not the 1st)
    const SUNDAY_EIGHTH = '2026-11-07T17:00:00Z';
    // 2026-11-30T17:00Z = 2026-12-01 02:00 JST (Tuesday, the 1st)
    const TUESDAY_FIRST = '2026-11-30T17:00:00Z';

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does NOT send alarm when D1_SIZE_REPORT_FREQUENCY is None', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(SUNDAY_FIRST) });
      await runScheduled(freq('None'));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });

    it('does NOT send alarm when D1_SIZE_REPORT_FREQUENCY is unset', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(SUNDAY_FIRST) });
      await runScheduled(freq(undefined));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });

    it('does NOT send alarm when D1_SIZE_REPORT_FREQUENCY is invalid', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(SUNDAY_FIRST) });
      await runScheduled(freq('month'));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });

    it('sends info report every day when D1_SIZE_REPORT_FREQUENCY is Day', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(TUESDAY_THIRD) });
      await runScheduled(freq('Day'));
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      const payload = sendAlarmMock.mock.calls[0][1];
      expect(payload.level).toBe('info');
      expect(payload.title).toBe('D1 database size information');
      expect(payload.fields?.['DB size']).toBe('10.0 MB');
      expect(payload.fields?.Threshold).toBe('400 MB');
      expect(payload.fields?.['D1 free tier limit']).toBe('500 MB');
    });

    it('Week: sends on Sunday (JST) only', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(SUNDAY_FIRST) });
      await runScheduled(freq('Week'));
      expect(sendAlarmMock).toHaveBeenCalledOnce();

      sendAlarmMock.mockClear();
      vi.setSystemTime(new Date(TUESDAY_THIRD));
      await runScheduled(freq('Week'));
      expect(sendAlarmMock).not.toHaveBeenCalled();

      // Sunday that is not the 1st still sends; the 1st that is not Sunday does not
      vi.setSystemTime(new Date(SUNDAY_EIGHTH));
      await runScheduled(freq('Week'));
      expect(sendAlarmMock).toHaveBeenCalledOnce();

      sendAlarmMock.mockClear();
      vi.setSystemTime(new Date(TUESDAY_FIRST));
      await runScheduled(freq('Week'));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });

    it('Month: sends on the 1st (JST) only', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(SUNDAY_FIRST) });
      await runScheduled(freq('Month'));
      expect(sendAlarmMock).toHaveBeenCalledOnce();

      sendAlarmMock.mockClear();
      vi.setSystemTime(new Date(TUESDAY_THIRD));
      await runScheduled(freq('Month'));
      expect(sendAlarmMock).not.toHaveBeenCalled();

      // The 1st that is not Sunday sends; Sunday that is not the 1st does not
      vi.setSystemTime(new Date(TUESDAY_FIRST));
      await runScheduled(freq('Month'));
      expect(sendAlarmMock).toHaveBeenCalledOnce();

      sendAlarmMock.mockClear();
      vi.setSystemTime(new Date(SUNDAY_EIGHTH));
      await runScheduled(freq('Month'));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });
  });

  describe('when size equals or exceeds threshold', () => {
    it('sends warn alarm when size equals threshold (boundary)', async () => {
      getD1SizeMbMock.mockResolvedValue(400);
      await runScheduled(makeEnv({ D1_SIZE_REPORT_FREQUENCY: 'None' as unknown as never }));
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      expect(sendAlarmMock.mock.calls[0][1].level).toBe('warn');
    });

    it('sends warn alarm when size exceeds threshold', async () => {
      getD1SizeMbMock.mockResolvedValue(450);
      await runScheduled(makeEnv({ D1_SIZE_REPORT_FREQUENCY: 'None' as unknown as never }));
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      const payload = sendAlarmMock.mock.calls[0][1];
      expect(payload.level).toBe('warn');
      expect(payload.title).toBe('D1 database size approaching limit');
      expect(payload.fields?.['DB size']).toBe('450.0 MB');
    });

    it('sends warn alarm even when D1_SIZE_REPORT_FREQUENCY is None', async () => {
      getD1SizeMbMock.mockResolvedValue(450);
      await runScheduled(makeEnv({ D1_SIZE_REPORT_FREQUENCY: 'None' as unknown as never }));
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      expect(sendAlarmMock.mock.calls[0][1].level).toBe('warn');
    });
  });

  describe('threshold parsing (Number.isNaN fix)', () => {
    it('uses 400 as default when threshold env var is NaN', async () => {
      getD1SizeMbMock.mockResolvedValue(500);
      await runScheduled(
        makeEnv({ D1_ALARM_SIZE_THRESHOLD_MB: 'not-a-number' as unknown as never }),
      );
      // 500 >= 400 (default) → warn
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      expect(sendAlarmMock.mock.calls[0][1].level).toBe('warn');
    });

    it('respects threshold=0 without falling back to 400', async () => {
      getD1SizeMbMock.mockResolvedValue(0.1);
      await runScheduled(makeEnv({ D1_ALARM_SIZE_THRESHOLD_MB: '0' as unknown as never }));
      // 0.1 >= 0 → warn (0 is a valid threshold, not a falsy fallback)
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      expect(sendAlarmMock.mock.calls[0][1].level).toBe('warn');
    });
  });

  describe('error isolation', () => {
    it('does not mark sync as failed when getD1SizeMb throws', async () => {
      getD1SizeMbMock.mockRejectedValue(new Error('D1_ERROR: SQLITE_AUTH'));
      await runScheduled(makeEnv());
      const { syncLogs } = await import('./db/schema');
      const logs = await db.select().from(syncLogs).all();
      expect(logs).toHaveLength(1);
      expect(logs[0].status).toBe('success');
    });

    it('does not send size alarm when getD1SizeMb throws', async () => {
      getD1SizeMbMock.mockRejectedValue(new Error('D1_ERROR: SQLITE_AUTH'));
      await runScheduled(makeEnv({ D1_SIZE_REPORT_FREQUENCY: 'Day' as unknown as never }));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });
  });

  describe('webhook not configured', () => {
    it('does not call sendAlarm when SLACK_ALARM_WEBHOOK_URL is not set', async () => {
      getD1SizeMbMock.mockResolvedValue(500);
      await runScheduled(
        makeEnv({
          D1_SIZE_REPORT_FREQUENCY: 'Day' as unknown as never,
          SLACK_ALARM_WEBHOOK_URL: undefined as unknown as never,
        }),
      );
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });
  });

  describe('sendAlarm failure handling', () => {
    it('does not propagate when sendAlarm throws', async () => {
      getD1SizeMbMock.mockResolvedValue(450);
      sendAlarmMock.mockRejectedValue(new Error('Webhook unreachable'));
      // Should not throw — error is caught inside notifyAlarm
      await expect(runScheduled(makeEnv())).resolves.toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Cron failure alarm
// ---------------------------------------------------------------------------

describe('scheduled: cron failure alarm', () => {
  it('sends error alarm when syncAll throws', async () => {
    syncAllMock.mockRejectedValue(new Error('Slack API timeout'));
    await runScheduled(makeEnv());
    expect(sendAlarmMock).toHaveBeenCalledOnce();
    const payload = sendAlarmMock.mock.calls[0][1];
    expect(payload.level).toBe('error');
    expect(payload.title).toBe('Cron sync failed');
    expect(payload.message).toBe('Slack API timeout');
  });

  it('records error sync log when syncAll throws', async () => {
    syncAllMock.mockRejectedValue(new Error('timeout'));
    await runScheduled(makeEnv());
    const { syncLogs } = await import('./db/schema');
    const logs = await db.select().from(syncLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('error');
    expect(logs[0].errorMessage).toBe('timeout');
  });
});
