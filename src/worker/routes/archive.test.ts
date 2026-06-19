import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ createDb: vi.fn() }));
vi.mock('../lib/archive', async (importOriginal) => {
  const original = await importOriginal<typeof import('../lib/archive')>();
  return { ...original, cutoffIso: vi.fn() };
});

import { createDb } from '../db/client';
import { cutoffIso } from '../lib/archive';
import { app } from '../app';
import * as schema from '../db/schema';
import { ADMIN_EMAIL, VIEWER_EMAIL, createTestDb, makeMockEnv, seedUsers } from '../test/helpers';
import type { Db } from '../db/client';

const createDbMock = vi.mocked(createDb);
const cutoffIsoMock = vi.mocked(cutoffIso);

// Dates relative to a fixed "now"
const OLD_DATE = '2020-01-01T00:00:00.000Z'; // older than cutoff
const NEW_DATE = new Date(Date.now() - 1000).toISOString(); // 1 second ago (recent)
const CUTOFF = '2023-01-01T00:00:00.000Z'; // cutoff boundary

let db: Db;

beforeEach(() => {
  db = createTestDb();
  seedUsers(db);
  createDbMock.mockReturnValue(db);
  cutoffIsoMock.mockReturnValue(CUTOFF);
});

function req(method: string, path: string, env?: Env): Promise<Response> {
  return Promise.resolve(app.request(path, { method }, env ?? makeMockEnv()));
}

function seedChannel(id: string, name = 'general') {
  db.insert(schema.channels)
    .values({ id, slackChannelId: `S-${id}`, name, isPrivate: false, lastSyncedAt: null })
    .run();
}

function seedMessage(
  id: string,
  channelId: string,
  slackTs: string,
  createdAt: string,
  threadTs: string | null = null,
) {
  db.insert(schema.messages)
    .values({ id, channelId, slackTs, userSlackId: null, text: 'msg', threadTs, createdAt })
    .run();
}

function seedThread(
  id: string,
  channelId: string,
  parentTs: string,
  slackTs: string,
  createdAt: string,
) {
  db.insert(schema.threads)
    .values({ id, channelId, parentTs, slackTs, userSlackId: null, text: 'reply', createdAt })
    .run();
}

function countMessages(): number {
  return (db.select().from(schema.messages).all() as unknown as unknown[]).length;
}

function countThreads(): number {
  return (db.select().from(schema.threads).all() as unknown as unknown[]).length;
}

function countChannels(): number {
  return (db.select().from(schema.channels).all() as unknown as unknown[]).length;
}

// ---------------------------------------------------------------------------
// DELETE /api/archive/messages/:messageId
// ---------------------------------------------------------------------------

describe('DELETE /api/archive/messages/:messageId', () => {
  beforeEach(() => {
    seedChannel('ch-1');
  });

  it('viewer is forbidden', async () => {
    seedMessage('m-1', 'ch-1', '1000.000', OLD_DATE);
    const res = await req(
      'DELETE',
      '/api/archive/messages/m-1',
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent message', async () => {
    const res = await req('DELETE', '/api/archive/messages/no-such');
    expect(res.status).toBe(404);
  });

  it('returns 403 for a recent message (createdAt >= cutoff)', async () => {
    seedMessage('m-new', 'ch-1', '1000.000', NEW_DATE);
    const res = await req('DELETE', '/api/archive/messages/m-new');
    expect(res.status).toBe(403);
  });

  it('deletes an old message successfully', async () => {
    seedMessage('m-old', 'ch-1', '1000.000', OLD_DATE);
    const res = await req('DELETE', '/api/archive/messages/m-old');
    expect(res.status).toBe(200);
    expect(countMessages()).toBe(0);
  });

  it('admin can delete an old message', async () => {
    seedMessage('m-old', 'ch-1', '1000.000', OLD_DATE);
    const res = await req(
      'DELETE',
      '/api/archive/messages/m-old',
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
  });

  it('deletes thread replies when deleting a thread parent message', async () => {
    // threadTs === slackTs means it's the thread root
    seedMessage('m-parent', 'ch-1', '1000.000', OLD_DATE, '1000.000');
    seedThread('t-1', 'ch-1', '1000.000', '1001.000', OLD_DATE);
    seedThread('t-2', 'ch-1', '1000.000', '1002.000', OLD_DATE);

    const res = await req('DELETE', '/api/archive/messages/m-parent');
    expect(res.status).toBe(200);
    expect(countMessages()).toBe(0);
    expect(countThreads()).toBe(0);
  });

  it('does NOT delete threads from other channels with same parentTs', async () => {
    seedChannel('ch-2');
    seedMessage('m-parent', 'ch-1', '1000.000', OLD_DATE, '1000.000');
    // same parentTs in a different channel — must not be deleted
    seedThread('t-other', 'ch-2', '1000.000', '1001.000', OLD_DATE);
    seedThread('t-own', 'ch-1', '1000.000', '1002.000', OLD_DATE);

    const res = await req('DELETE', '/api/archive/messages/m-parent');
    expect(res.status).toBe(200);
    expect(countThreads()).toBe(1); // only ch-2 thread remains
  });

  it('does NOT delete thread replies when deleting a non-parent message', async () => {
    // threadTs !== slackTs means it's a regular message referencing a thread, not the root
    seedMessage('m-reply', 'ch-1', '2000.000', OLD_DATE, '1000.000');
    seedThread('t-1', 'ch-1', '1000.000', '1001.000', OLD_DATE);

    const res = await req('DELETE', '/api/archive/messages/m-reply');
    expect(res.status).toBe(200);
    expect(countMessages()).toBe(0);
    expect(countThreads()).toBe(1); // thread reply untouched
  });

  it('returns 500 when db throws on message delete', async () => {
    seedMessage('m-old', 'ch-1', '1000.000', OLD_DATE);

    const original = db.delete.bind(db);
    let callCount = 0;
    vi.spyOn(db, 'delete').mockImplementation((...args) => {
      callCount++;
      if (callCount === 1) throw new Error('DB_ERROR');
      return original(...args);
    });

    const res = await req('DELETE', '/api/archive/messages/m-old');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('DB_ERROR');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/archive/threads/:threadId
// ---------------------------------------------------------------------------

describe('DELETE /api/archive/threads/:threadId', () => {
  beforeEach(() => {
    seedChannel('ch-1');
  });

  it('viewer is forbidden', async () => {
    seedThread('t-1', 'ch-1', '1000.000', '1001.000', OLD_DATE);
    const res = await req(
      'DELETE',
      '/api/archive/threads/t-1',
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent thread reply', async () => {
    const res = await req('DELETE', '/api/archive/threads/no-such');
    expect(res.status).toBe(404);
  });

  it('returns 403 for a recent thread reply', async () => {
    seedThread('t-new', 'ch-1', '1000.000', '1001.000', NEW_DATE);
    const res = await req('DELETE', '/api/archive/threads/t-new');
    expect(res.status).toBe(403);
  });

  it('deletes an old thread reply successfully', async () => {
    seedThread('t-old', 'ch-1', '1000.000', '1001.000', OLD_DATE);
    const res = await req('DELETE', '/api/archive/threads/t-old');
    expect(res.status).toBe(200);
    expect(countThreads()).toBe(0);
  });

  it('only deletes the specified reply, leaving others intact', async () => {
    seedThread('t-1', 'ch-1', '1000.000', '1001.000', OLD_DATE);
    seedThread('t-2', 'ch-1', '1000.000', '1002.000', OLD_DATE);

    const res = await req('DELETE', '/api/archive/threads/t-1');
    expect(res.status).toBe(200);
    expect(countThreads()).toBe(1);
  });

  it('returns 500 when db throws on thread delete', async () => {
    seedThread('t-old', 'ch-1', '1000.000', '1001.000', OLD_DATE);

    vi.spyOn(db, 'delete').mockImplementation(() => {
      throw new Error('THREAD_DB_ERROR');
    });

    const res = await req('DELETE', '/api/archive/threads/t-old');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('THREAD_DB_ERROR');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/archive/channels/:channelId
// ---------------------------------------------------------------------------

describe('DELETE /api/archive/channels/:channelId', () => {
  it('viewer is forbidden', async () => {
    seedChannel('ch-1');
    const res = await req(
      'DELETE',
      '/api/archive/channels/ch-1',
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(403);
  });

  it('returns 404 for non-existent channel', async () => {
    const res = await req('DELETE', '/api/archive/channels/no-such');
    expect(res.status).toBe(404);
  });

  it('deletes channel with all messages and threads', async () => {
    seedChannel('ch-1');
    seedMessage('m-1', 'ch-1', '1000.000', OLD_DATE, '1000.000');
    seedMessage('m-2', 'ch-1', '2000.000', NEW_DATE);
    seedThread('t-1', 'ch-1', '1000.000', '1001.000', OLD_DATE);
    seedThread('t-2', 'ch-1', '1000.000', '1002.000', NEW_DATE);

    const res = await req('DELETE', '/api/archive/channels/ch-1');
    expect(res.status).toBe(200);
    expect(countChannels()).toBe(0);
    expect(countMessages()).toBe(0);
    expect(countThreads()).toBe(0);
  });

  it('only deletes the specified channel, leaving others intact', async () => {
    seedChannel('ch-1');
    seedChannel('ch-2');
    seedMessage('m-1', 'ch-1', '1000.000', OLD_DATE);
    seedMessage('m-2', 'ch-2', '1000.000', OLD_DATE);

    const res = await req('DELETE', '/api/archive/channels/ch-1');
    expect(res.status).toBe(200);
    expect(countChannels()).toBe(1);
    expect(countMessages()).toBe(1);
  });

  it('admin can delete a channel', async () => {
    seedChannel('ch-1');
    const res = await req(
      'DELETE',
      '/api/archive/channels/ch-1',
      makeMockEnv({ DEV_USER_EMAIL: ADMIN_EMAIL }),
    );
    expect(res.status).toBe(200);
  });

  it('returns 500 when db throws on channel delete', async () => {
    seedChannel('ch-1');

    vi.spyOn(db, 'delete').mockImplementation(() => {
      throw new Error('CHANNEL_DB_ERROR');
    });

    const res = await req('DELETE', '/api/archive/channels/ch-1');
    expect(res.status).toBe(500);
    const body = (await res.json()) as { message: string };
    expect(body.message).toBe('CHANNEL_DB_ERROR');
  });
});
