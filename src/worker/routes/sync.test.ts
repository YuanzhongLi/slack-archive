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

const createDbMock = vi.mocked(createDb);
const syncAllMock = vi.mocked(syncAll);

beforeEach(() => {
  const db = createTestDb();
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
    };
    expect(body.status).toBe('done');
    expect(body.channelCount).toBe(3);
    expect(body.messageCount).toBe(42);
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
});
