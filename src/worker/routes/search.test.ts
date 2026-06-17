import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../db/client', () => ({ createDb: vi.fn() }));
import { app } from '../app';
import { createDb } from '../db/client';
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
) {
  db.insert(schema.messages)
    .values({
      id,
      channelId,
      slackTs,
      userSlackId,
      text,
      threadTs: null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

// ---------------------------------------------------------------------------
// GET /api/search
// ---------------------------------------------------------------------------

describe('GET /api/search', () => {
  beforeEach(() => {
    seedChannel('ch-1', 'general', 'S001');
    seedChannel('ch-2', 'random', 'S002');
    seedSlackUser('U001', 'Alice', 'https://example.com/alice.png');
    seedSlackUser('U002', 'Bob', null);
  });

  it('returns empty results and hasMore=false when q is empty', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'hello world');

    const res = await req('/api/search?q=');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[]; hasMore: boolean };
    expect(body.results).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('returns empty results and hasMore=false when q is whitespace only', async () => {
    const res = await req('/api/search?q=%20%20');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[]; hasMore: boolean };
    expect(body.results).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('returns empty results when no messages match', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'hello world');

    const res = await req('/api/search?q=nomatch');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: unknown[]; hasMore: boolean };
    expect(body.results).toEqual([]);
    expect(body.hasMore).toBe(false);
  });

  it('returns matching messages with channel and user info', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'hello world');
    seedMessage('m-2', 'ch-1', '1000000002.000000', 'U002', 'goodbye world');

    const res = await req('/api/search?q=hello');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: {
        id: string;
        text: string;
        channel: { id: string; name: string };
        user: { displayName: string; avatarUrl: string | null };
      }[];
      hasMore: boolean;
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].text).toBe('hello world');
    expect(body.results[0].channel).toEqual({ id: 'ch-1', name: 'general' });
    expect(body.results[0].user.displayName).toBe('Alice');
    expect(body.results[0].user.avatarUrl).toBe('https://example.com/alice.png');
  });

  it('searches across multiple channels', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'hello from general');
    seedMessage('m-2', 'ch-2', '1000000002.000000', 'U002', 'hello from random');

    const res = await req('/api/search?q=hello');
    const body = (await res.json()) as {
      results: { channel: { name: string } }[];
    };
    expect(body.results).toHaveLength(2);
    const channelNames = body.results.map((r) => r.channel.name).sort();
    expect(channelNames).toEqual(['general', 'random']);
  });

  it('returns results ordered by slackTs descending', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'match oldest');
    seedMessage('m-2', 'ch-1', '1000000003.000000', 'U001', 'match newest');
    seedMessage('m-3', 'ch-1', '1000000002.000000', 'U001', 'match middle');

    const res = await req('/api/search?q=match');
    const body = (await res.json()) as { results: { text: string }[] };
    expect(body.results.map((r) => r.text)).toEqual([
      'match newest',
      'match middle',
      'match oldest',
    ]);
  });

  it('falls back to "Unknown" for messages with no matching slack user', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U999', 'ghost message');

    const res = await req('/api/search?q=ghost');
    const body = (await res.json()) as {
      results: { user: { displayName: string; avatarUrl: string | null } }[];
    };
    expect(body.results[0].user.displayName).toBe('Unknown');
    expect(body.results[0].user.avatarUrl).toBeNull();
  });

  it('sets hasMore=true when there are more results', async () => {
    for (let i = 1; i <= 22; i++) {
      seedMessage(`m-${i}`, 'ch-1', `${1000000000 + i}.000000`, 'U001', `match message ${i}`);
    }

    const res = await req('/api/search?q=match&limit=20');
    const body = (await res.json()) as { results: unknown[]; hasMore: boolean };
    expect(body.results).toHaveLength(20);
    expect(body.hasMore).toBe(true);
  });

  it('respects offset parameter', async () => {
    for (let i = 1; i <= 5; i++) {
      seedMessage(`m-${i}`, 'ch-1', `${1000000000 + i}.000000`, 'U001', `match message ${i}`);
    }

    const resFirst = await req('/api/search?q=match&limit=3&offset=0');
    const resSecond = await req('/api/search?q=match&limit=3&offset=3');
    const first = (await resFirst.json()) as { results: { id: string }[] };
    const second = (await resSecond.json()) as { results: { id: string }[] };

    expect(first.results).toHaveLength(3);
    expect(second.results).toHaveLength(2);
    const firstIds = new Set(first.results.map((r) => r.id));
    for (const r of second.results) {
      expect(firstIds.has(r.id)).toBe(false);
    }
  });

  it('clamps limit to 100', async () => {
    for (let i = 1; i <= 110; i++) {
      seedMessage(`m-${i}`, 'ch-1', `${1000000000 + i}.000000`, 'U001', `match message ${i}`);
    }

    const res = await req('/api/search?q=match&limit=999');
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results.length).toBeLessThanOrEqual(100);
  });

  it('viewer can access search', async () => {
    const res = await req('/api/search?q=hello', makeMockEnv({ DEV_USER_EMAIL: VIEWER_EMAIL }));
    expect(res.status).toBe(200);
  });

  it('includes slackTs and threadTs in result', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'hello world');

    const res = await req('/api/search?q=hello');
    const body = (await res.json()) as {
      results: { slackTs: string; threadTs: string | null }[];
    };
    expect(body.results[0].slackTs).toBe('1000000001.000000');
    expect(body.results[0].threadTs).toBeNull();
  });

  it('matches Japanese text', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'こんにちは世界');
    seedMessage('m-2', 'ch-1', '1000000002.000000', 'U001', 'hello world');

    const res = await req(`/api/search?q=${encodeURIComponent('世界')}`);
    const body = (await res.json()) as { results: { text: string }[] };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].text).toBe('こんにちは世界');
  });

  it('escapes LIKE wildcards in query', async () => {
    seedMessage('m-1', 'ch-1', '1000000001.000000', 'U001', 'price is 100%');
    seedMessage('m-2', 'ch-1', '1000000002.000000', 'U001', 'other message');

    const res = await req(`/api/search?q=${encodeURIComponent('100%')}`);
    const body = (await res.json()) as { results: { text: string }[] };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].text).toBe('price is 100%');
  });
});
