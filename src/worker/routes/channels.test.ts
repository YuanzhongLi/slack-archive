import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ createDb: vi.fn() }));
import { createDb } from '../db/client';
import { app } from '../app';
import * as schema from '../db/schema';
import { VIEWER_EMAIL, createTestDb, makeMockEnv, seedUsers } from '../test/helpers';
import type { Db } from '../db/client';

const createDbMock = vi.mocked(createDb);

let db: Db;

beforeEach(() => {
  db = createTestDb();
  seedUsers(db);
  createDbMock.mockReturnValue(db);
});

function req(path: string, env?: Env): Promise<Response> {
  return Promise.resolve(app.request(path, { method: 'GET' }, env ?? makeMockEnv()));
}

function seedChannel(id: string, name: string, slackChannelId: string) {
  db.insert(schema.channels)
    .values({ id, slackChannelId, name, isPrivate: false, lastSyncedAt: null })
    .run();
}

function seedSlackUser(slackUserId: string, displayName: string, avatarUrl: string | null = null) {
  db.insert(schema.slackUsers)
    .values({ id: `su-${slackUserId}`, slackUserId, displayName, avatarUrl })
    .run();
}

function seedMessage(
  id: string,
  channelId: string,
  slackTs: string,
  userSlackId: string,
  text: string,
  threadTs: string | null = null,
) {
  db.insert(schema.messages)
    .values({
      id,
      channelId,
      slackTs,
      userSlackId,
      text,
      threadTs,
      createdAt: new Date().toISOString(),
    })
    .run();
}

function seedThread(
  id: string,
  channelId: string,
  parentTs: string,
  slackTs: string,
  userSlackId: string,
  text: string,
) {
  db.insert(schema.threads)
    .values({
      id,
      channelId,
      parentTs,
      slackTs,
      userSlackId,
      text,
      createdAt: new Date().toISOString(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// GET /api/channels
// ---------------------------------------------------------------------------

describe('GET /api/channels', () => {
  it('returns empty array when no channels exist', async () => {
    const res = await req('/api/channels');
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([]);
  });

  it('returns channels ordered by name', async () => {
    seedChannel('ch-2', 'beta', 'S002');
    seedChannel('ch-1', 'alpha', 'S001');
    seedChannel('ch-3', 'gamma', 'S003');

    const res = await req('/api/channels');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; name: string; slackChannelId: string }[];
    expect(body.map((c) => c.name)).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('returns id, slackChannelId, name fields', async () => {
    seedChannel('ch-1', 'general', 'S001');

    const res = await req('/api/channels');
    const body = (await res.json()) as { id: string; name: string; slackChannelId: string }[];
    expect(body[0]).toEqual({ id: 'ch-1', name: 'general', slackChannelId: 'S001' });
  });

  it('viewer can access channels', async () => {
    const res = await req('/api/channels', makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/channels/:id/messages
// ---------------------------------------------------------------------------

describe('GET /api/channels/:id/messages', () => {
  beforeEach(() => {
    seedChannel('ch-1', 'general', 'S001');
    seedSlackUser('U001', 'Alice', 'https://example.com/alice.png');
    seedSlackUser('U002', 'Bob', null);
  });

  it('returns empty messages array when channel has no messages', async () => {
    const res = await req('/api/channels/ch-1/messages');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { messages: unknown[]; hasMore: boolean };
    expect(body.messages).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('returns messages with user info and replyCount', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'Hello');

    const res = await req('/api/channels/ch-1/messages');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      messages: {
        id: string;
        slackTs: string;
        text: string;
        replyCount: number;
        user: { slackUserId: string; displayName: string; avatarUrl: string | null };
      }[];
      hasMore: boolean;
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].text).toBe('Hello');
    expect(body.messages[0].replyCount).toBe(0);
    expect(body.messages[0].user.displayName).toBe('Alice');
    expect(body.messages[0].user.avatarUrl).toBe('https://example.com/alice.png');
  });

  it('falls back to "Unknown" for messages with no matching slack user', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U999', 'Ghost message');

    const res = await req('/api/channels/ch-1/messages');
    const body = (await res.json()) as {
      messages: { user: { displayName: string; avatarUrl: string | null } }[];
    };
    expect(body.messages[0].user.displayName).toBe('Unknown');
    expect(body.messages[0].user.avatarUrl).toBeNull();
  });

  it('returns messages in descending order by slackTs', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'first');
    seedMessage('m-2', 'ch-1', '1000000002.000000', 'U001', 'second');
    seedMessage('m-3', 'ch-1', '1000000003.000000', 'U001', 'third');

    const res = await req('/api/channels/ch-1/messages');
    const body = (await res.json()) as { messages: { text: string }[] };
    expect(body.messages.map((m) => m.text)).toEqual(['third', 'second', 'first']);
  });

  it('counts thread replies in replyCount', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'parent', '1000000001.000000');
    seedThread('t-1', 'ch-1', '1000000001.000000', '1000000002.000000', 'U002', 'reply 1');
    seedThread('t-2', 'ch-1', '1000000001.000000', '1000000003.000000', 'U002', 'reply 2');

    const res = await req('/api/channels/ch-1/messages');
    const body = (await res.json()) as { messages: { replyCount: number }[] };
    expect(body.messages[0].replyCount).toBe(2);
  });

  it('paginates with before cursor', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'oldest');
    seedMessage('m-2', 'ch-1', '1000000002.000000', 'U001', 'middle');
    seedMessage('m-3', 'ch-1', '1000000003.000000', 'U001', 'newest');

    const res = await req('/api/channels/ch-1/messages?before=1000000003.000000');
    const body = (await res.json()) as { messages: { text: string }[]; hasMore: boolean };
    expect(body.messages.map((m) => m.text)).toEqual(['middle', 'oldest']);
    expect(body.hasMore).toBe(false);
  });

  it('sets hasMore=true when there are more pages', async () => {
    for (let i = 1; i <= 52; i++) {
      seedMessage(`m-${i}`, 'ch-1', `${1000000000 + i}.000000`, 'U001', `message ${i}`);
    }

    const res = await req('/api/channels/ch-1/messages?limit=50');
    const body = (await res.json()) as { messages: unknown[]; hasMore: boolean };
    expect(body.messages).toHaveLength(50);
    expect(body.hasMore).toBe(true);
  });

  it('clamps limit to 100', async () => {
    for (let i = 1; i <= 110; i++) {
      seedMessage(`m-${i}`, 'ch-1', `${1000000000 + i}.000000`, 'U001', `message ${i}`);
    }

    const res = await req('/api/channels/ch-1/messages?limit=999');
    const body = (await res.json()) as { messages: unknown[] };
    expect(body.messages.length).toBeLessThanOrEqual(100);
  });

  it('viewer can access messages', async () => {
    const res = await req(
      '/api/channels/ch-1/messages',
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/channels/:id/messages/:ts/threads
// ---------------------------------------------------------------------------

describe('GET /api/channels/:id/messages/:ts/threads', () => {
  beforeEach(() => {
    seedChannel('ch-1', 'general', 'S001');
    seedSlackUser('U001', 'Alice', null);
    seedSlackUser('U002', 'Bob', null);
  });

  it('returns empty array when no thread replies exist', async () => {
    const res = await req('/api/channels/ch-1/messages/1000000001.000000/threads');
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toEqual([]);
  });

  it('returns thread replies with user info in ascending order', async () => {
    seedThread('t-1', 'ch-1', '1000000001.000000', '1000000002.000000', 'U001', 'first reply');
    seedThread('t-2', 'ch-1', '1000000001.000000', '1000000003.000000', 'U002', 'second reply');

    const res = await req('/api/channels/ch-1/messages/1000000001.000000/threads');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      slackTs: string;
      text: string;
      user: { displayName: string };
    }[];
    expect(body).toHaveLength(2);
    expect(body[0].text).toBe('first reply');
    expect(body[0].user.displayName).toBe('Alice');
    expect(body[1].text).toBe('second reply');
    expect(body[1].user.displayName).toBe('Bob');
  });

  it('only returns replies for the requested parentTs', async () => {
    seedThread('t-1', 'ch-1', '1000000001.000000', '1000000002.000000', 'U001', 'for thread 1');
    seedThread('t-2', 'ch-1', '1000000099.000000', '1000000100.000000', 'U002', 'for thread 99');

    const res = await req('/api/channels/ch-1/messages/1000000001.000000/threads');
    const body = (await res.json()) as { text: string }[];
    expect(body).toHaveLength(1);
    expect(body[0].text).toBe('for thread 1');
  });

  it('falls back to "Unknown" for threads with no matching slack user', async () => {
    seedThread('t-1', 'ch-1', '1000000001.000000', '1000000002.000000', 'U999', 'ghost reply');

    const res = await req('/api/channels/ch-1/messages/1000000001.000000/threads');
    const body = (await res.json()) as { user: { displayName: string } }[];
    expect(body[0].user.displayName).toBe('Unknown');
  });

  it('viewer can access thread replies', async () => {
    const res = await req(
      '/api/channels/ch-1/messages/1000000001.000000/threads',
      makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }),
    );
    expect(res.status).toBe(200);
  });
});
