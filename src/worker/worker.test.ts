import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    D1_SIZE_REPORT_ENABLED: 'false' as unknown as never,
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

    it('does NOT send alarm when D1_SIZE_REPORT_ENABLED is false', async () => {
      await runScheduled(makeEnv({ D1_SIZE_REPORT_ENABLED: 'false' as unknown as never }));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });

    it('does NOT send alarm when D1_SIZE_REPORT_ENABLED is unset', async () => {
      await runScheduled(makeEnv({ D1_SIZE_REPORT_ENABLED: undefined as unknown as never }));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });

    it('sends info report when D1_SIZE_REPORT_ENABLED is true', async () => {
      await runScheduled(makeEnv({ D1_SIZE_REPORT_ENABLED: 'true' as unknown as never }));
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      const payload = sendAlarmMock.mock.calls[0][1];
      expect(payload.level).toBe('info');
      expect(payload.title).toBe('D1 database size information');
      expect(payload.fields?.['DB size']).toBe('10.0 MB');
      expect(payload.fields?.Threshold).toBe('400 MB');
      expect(payload.fields?.['D1 free tier limit']).toBe('500 MB');
    });
  });

  describe('when size equals or exceeds threshold', () => {
    it('sends warn alarm when size equals threshold (boundary)', async () => {
      getD1SizeMbMock.mockResolvedValue(400);
      await runScheduled(makeEnv({ D1_SIZE_REPORT_ENABLED: 'false' as unknown as never }));
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      expect(sendAlarmMock.mock.calls[0][1].level).toBe('warn');
    });

    it('sends warn alarm when size exceeds threshold', async () => {
      getD1SizeMbMock.mockResolvedValue(450);
      await runScheduled(makeEnv({ D1_SIZE_REPORT_ENABLED: 'false' as unknown as never }));
      expect(sendAlarmMock).toHaveBeenCalledOnce();
      const payload = sendAlarmMock.mock.calls[0][1];
      expect(payload.level).toBe('warn');
      expect(payload.title).toBe('D1 database size approaching limit');
      expect(payload.fields?.['DB size']).toBe('450.0 MB');
    });

    it('sends warn alarm even when D1_SIZE_REPORT_ENABLED is false', async () => {
      getD1SizeMbMock.mockResolvedValue(450);
      await runScheduled(makeEnv({ D1_SIZE_REPORT_ENABLED: 'false' as unknown as never }));
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
      await runScheduled(makeEnv({ D1_SIZE_REPORT_ENABLED: 'true' as unknown as never }));
      expect(sendAlarmMock).not.toHaveBeenCalled();
    });
  });

  describe('webhook not configured', () => {
    it('does not call sendAlarm when SLACK_ALARM_WEBHOOK_URL is not set', async () => {
      getD1SizeMbMock.mockResolvedValue(500);
      await runScheduled(
        makeEnv({
          D1_SIZE_REPORT_ENABLED: 'true' as unknown as never,
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
