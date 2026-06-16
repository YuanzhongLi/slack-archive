import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ createDb: vi.fn() }));
vi.mock('../services/sync/syncService', () => ({ syncAll: vi.fn() }));

import { createDb } from '../db/client';
import { syncAll } from '../services/sync/syncService';
import { app } from '../app';
import {
  ADMIN_EMAIL,
  ROOT_EMAIL,
  VIEWER_EMAIL,
  createTestDb,
  makeMockEnv,
  seedUsers,
} from '../test/helpers';
import { syncLogs } from '../db/schema';
import type { Db } from '../db/client';

const createDbMock = vi.mocked(createDb);
const syncAllMock = vi.mocked(syncAll);

let db: Db;

beforeEach(() => {
  db = createTestDb();
  seedUsers(db);
  createDbMock.mockReturnValue(db);
  syncAllMock.mockResolvedValue({ channelCount: 3, messageCount: 42 });
});

describe('POST /api/sync', () => {
  it('admin can trigger sync', async () => {
    const res = await app.request(
      '/api/sync',
      { method: 'POST' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      channelCount: number;
      messageCount: number;
      logId: string;
    };
    expect(body.status).toBe('done');
    expect(body.channelCount).toBe(3);
    expect(body.messageCount).toBe(42);
    expect(body.logId).toBeDefined();
    expect(syncAllMock).toHaveBeenCalledOnce();
  });

  it('root can trigger sync', async () => {
    const res = await app.request(
      '/api/sync',
      { method: 'POST' },
      makeMockEnv({ DEV_USER_EMAIL: ROOT_EMAIL }),
    );
    expect(res.status).toBe(200);
  });

  it('viewer cannot trigger sync', async () => {
    const res = await app.request(
      '/api/sync',
      { method: 'POST' },
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
    expect(syncAllMock).not.toHaveBeenCalled();
  });

  it('returns 500 when syncAll throws', async () => {
    syncAllMock.mockRejectedValueOnce(new Error('Slack API error'));
    const res = await app.request(
      '/api/sync',
      { method: 'POST' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { status: string; message: string };
    expect(body.status).toBe('error');
    expect(body.message).toBe('Slack API error');
  });

  it('saves a success sync_log record on successful sync', async () => {
    await app.request(
      '/api/sync',
      { method: 'POST' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );

    const logs = await db.select().from(syncLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].triggeredBy).toBe('manual');
    expect(logs[0].userEmail).toBe(ADMIN_EMAIL);
    expect(logs[0].status).toBe('success');
    expect(logs[0].channelCount).toBe(3);
    expect(logs[0].messageCount).toBe(42);
    expect(logs[0].completedAt).not.toBeNull();
  });

  it('saves an error sync_log record when syncAll throws', async () => {
    syncAllMock.mockRejectedValueOnce(new Error('Slack API error'));
    await app.request(
      '/api/sync',
      { method: 'POST' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );

    const logs = await db.select().from(syncLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('error');
    expect(logs[0].errorMessage).toBe('Slack API error');
    expect(logs[0].completedAt).not.toBeNull();
  });
});

describe('GET /api/sync', () => {
  it('admin can list sync logs', async () => {
    // Seed some logs
    await db.insert(syncLogs).values([
      {
        id: 'log-1',
        triggeredBy: 'cron',
        status: 'success',
        channelCount: 2,
        messageCount: 10,
        startedAt: '2024-01-01T10:00:00.000Z',
        completedAt: '2024-01-01T10:01:00.000Z',
      },
      {
        id: 'log-2',
        triggeredBy: 'manual',
        userEmail: ADMIN_EMAIL,
        status: 'error',
        errorMessage: 'Oops',
        startedAt: '2024-01-02T10:00:00.000Z',
        completedAt: '2024-01-02T10:00:01.000Z',
      },
    ]);

    const res = await app.request(
      '/api/sync',
      { method: 'GET' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[] };
    expect(body.logs).toHaveLength(2);
  });

  it('returns logs in descending order by started_at', async () => {
    await db.insert(syncLogs).values([
      {
        id: 'log-old',
        triggeredBy: 'cron',
        status: 'success',
        startedAt: '2024-01-01T10:00:00.000Z',
        completedAt: '2024-01-01T10:01:00.000Z',
      },
      {
        id: 'log-new',
        triggeredBy: 'cron',
        status: 'success',
        startedAt: '2024-01-03T10:00:00.000Z',
        completedAt: '2024-01-03T10:01:00.000Z',
      },
    ]);

    const res = await app.request(
      '/api/sync',
      { method: 'GET' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    const body = (await res.json()) as { logs: Array<{ id: string }> };
    expect(body.logs[0].id).toBe('log-new');
    expect(body.logs[1].id).toBe('log-old');
  });

  it('viewer cannot list sync logs', async () => {
    const res = await app.request(
      '/api/sync',
      { method: 'GET' },
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
  });

  it('returns empty list when no logs exist', async () => {
    const res = await app.request(
      '/api/sync',
      { method: 'GET' },
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { logs: unknown[] };
    expect(body.logs).toHaveLength(0);
  });
});
