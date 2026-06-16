import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../slack/client', () => ({ createSlackClient: vi.fn() }));
import { createSlackClient } from '../slack/client';

import type { SlackClient, SlackUser } from '../slack/client';
import { createTestDb, seedUsers } from '../../test/helpers';
import type { Db } from '../../db/client';
import { channels, messages, slackUsers, threads } from '../../db/schema';
import { createLogger } from '../../lib/logger';
import {
  syncAll,
  syncChannels,
  syncExistingThreadsForChannel,
  syncMessagesForChannel,
  syncThreadsForChannel,
  syncUsers,
} from './syncService';

const createSlackClientMock = vi.mocked(createSlackClient);

function makeSlackUser(
  id: string,
  profile: { display_name?: string; real_name?: string; image_72?: string } = {},
): SlackUser {
  return { id, deleted: false, is_bot: false, is_app_user: false, profile };
}

function makeSlackClient(overrides: Partial<SlackClient> = {}): SlackClient {
  return {
    fetchChannels: vi.fn(async () => []),
    joinChannel: vi.fn(async () => {}),
    fetchMessages: vi.fn(async () => []),
    fetchThreadReplies: vi.fn(async () => []),
    fetchUsers: vi.fn(async () => []),
    ...overrides,
  };
}

let db: Db;

beforeEach(() => {
  db = createTestDb();
  seedUsers(db);
});

// ---------------------------------------------------------------------------
// syncChannels
// ---------------------------------------------------------------------------

describe('syncChannels', () => {
  it('inserts new channels', async () => {
    const client = makeSlackClient({
      fetchChannels: vi.fn(async () => [
        { id: 'C001', name: 'general', is_private: false },
        { id: 'C002', name: 'random', is_private: false },
      ]),
    });

    await syncChannels(db, client);

    const rows = await db.select().from(channels).all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.slackChannelId)).toEqual(expect.arrayContaining(['C001', 'C002']));
  });

  it('upserts existing channels (name change)', async () => {
    const client = makeSlackClient({
      fetchChannels: vi.fn(async () => [{ id: 'C001', name: 'general', is_private: false }]),
    });
    await syncChannels(db, client);

    // Rename
    const client2 = makeSlackClient({
      fetchChannels: vi.fn(async () => [{ id: 'C001', name: 'general-v2', is_private: false }]),
    });
    await syncChannels(db, client2);

    const rows = await db.select().from(channels).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('general-v2');
  });

  it('does nothing when no channels returned', async () => {
    const client = makeSlackClient({ fetchChannels: vi.fn(async () => []) });
    await syncChannels(db, client);
    const rows = await db.select().from(channels).all();
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// syncUsers
// ---------------------------------------------------------------------------

describe('syncUsers', () => {
  it('inserts new slack users', async () => {
    const client = makeSlackClient({
      fetchUsers: vi.fn(async () => [
        makeSlackUser('U001', {
          display_name: 'Alice',
          real_name: 'Alice Smith',
          image_72: 'https://img/alice.png',
        }),
        makeSlackUser('U002', { display_name: 'Bob', real_name: 'Bob Jones' }),
      ]),
    });

    await syncUsers(db, client);

    const rows = await db.select().from(slackUsers).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.slackUserId === 'U001')?.displayName).toBe('Alice');
    expect(rows.find((r) => r.slackUserId === 'U002')?.avatarUrl).toBeNull();
  });

  it('upserts existing slack users (avatar change)', async () => {
    const client = makeSlackClient({
      fetchUsers: vi.fn(async () => [
        makeSlackUser('U001', { display_name: 'Alice', image_72: 'https://img/old.png' }),
      ]),
    });
    await syncUsers(db, client);

    const client2 = makeSlackClient({
      fetchUsers: vi.fn(async () => [
        makeSlackUser('U001', { display_name: 'Alice', image_72: 'https://img/new.png' }),
      ]),
    });
    await syncUsers(db, client2);

    const rows = await db.select().from(slackUsers).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].avatarUrl).toBe('https://img/new.png');
  });

  it('falls back to real_name when display_name is empty', async () => {
    const client = makeSlackClient({
      fetchUsers: vi.fn(async () => [
        makeSlackUser('U003', { display_name: '', real_name: 'Carol Williams' }),
      ]),
    });
    await syncUsers(db, client);
    const row = await db.select().from(slackUsers).all();
    expect(row[0].displayName).toBe('Carol Williams');
  });
});

// ---------------------------------------------------------------------------
// syncMessagesForChannel
// ---------------------------------------------------------------------------

describe('syncMessagesForChannel', () => {
  let channelRow: { id: string; slackChannelId: string; lastSyncedAt: string | null };

  beforeEach(async () => {
    const client = makeSlackClient({
      fetchChannels: vi.fn(async () => [{ id: 'C001', name: 'general', is_private: false }]),
    });
    await syncChannels(db, client);
    const ch = await db.select().from(channels).all();
    channelRow = ch[0];
  });

  it('inserts messages', async () => {
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [
        { ts: '1000.000', user: 'U001', text: 'hello' },
        { ts: '1001.000', user: 'U002', text: 'world' },
      ]),
    });

    await syncMessagesForChannel(db, client, channelRow);

    const rows = await db.select().from(messages).all();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.slackTs)).toEqual(expect.arrayContaining(['1000.000', '1001.000']));
  });

  it('upserts existing messages (text change)', async () => {
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [{ ts: '1000.000', user: 'U001', text: 'original' }]),
    });
    await syncMessagesForChannel(db, client, channelRow);

    const client2 = makeSlackClient({
      fetchMessages: vi.fn(async () => [{ ts: '1000.000', user: 'U001', text: 'edited' }]),
    });
    await syncMessagesForChannel(db, client2, channelRow);

    const rows = await db.select().from(messages).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('edited');
  });

  it('returns thread parent ts list', async () => {
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [
        { ts: '1000.000', user: 'U001', text: 'thread parent', thread_ts: '1000.000' },
        { ts: '1001.000', user: 'U002', text: 'normal message' },
      ]),
    });

    const parentTsList = await syncMessagesForChannel(db, client, channelRow);
    expect(parentTsList).toEqual(['1000.000']);
  });

  it('updates last_synced_at after sync', async () => {
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [{ ts: '1000.000', user: 'U001', text: 'hi' }]),
    });

    await syncMessagesForChannel(db, client, channelRow);

    const updated = await db.select().from(channels).all();
    expect(updated[0].lastSyncedAt).not.toBeNull();
  });

  it('passes last_synced_at as oldest to Slack API', async () => {
    const fetchMessages = vi.fn(async () => []);
    const client = makeSlackClient({ fetchMessages });

    const channelWithSyncedAt = { ...channelRow, lastSyncedAt: '2024-01-01T00:00:00.000Z' };
    await syncMessagesForChannel(db, client, channelWithSyncedAt);

    // oldest = last_synced_at unix timestamp - 1s (off-by-one guard)
    expect(fetchMessages).toHaveBeenCalledWith(
      'C001',
      String(Math.floor(new Date('2024-01-01T00:00:00.000Z').getTime() / 1000) - 1),
    );
  });
});

// ---------------------------------------------------------------------------
// syncThreadsForChannel
// ---------------------------------------------------------------------------

describe('syncThreadsForChannel', () => {
  let channelRow: { id: string; slackChannelId: string };

  beforeEach(async () => {
    const client = makeSlackClient({
      fetchChannels: vi.fn(async () => [{ id: 'C001', name: 'general', is_private: false }]),
    });
    await syncChannels(db, client);
    const ch = await db.select().from(channels).all();
    channelRow = ch[0];
  });

  it('inserts thread replies', async () => {
    const client = makeSlackClient({
      fetchThreadReplies: vi.fn(async () => [
        { ts: '1000.001', user: 'U002', text: 'reply 1', thread_ts: '1000.000' },
        { ts: '1000.002', user: 'U003', text: 'reply 2', thread_ts: '1000.000' },
      ]),
    });

    await syncThreadsForChannel(db, client, channelRow, ['1000.000']);

    const rows = await db.select().from(threads).all();
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.parentTs === '1000.000')).toBe(true);
  });

  it('upserts existing thread replies (text change)', async () => {
    const client = makeSlackClient({
      fetchThreadReplies: vi.fn(async () => [
        { ts: '1000.001', user: 'U002', text: 'original reply', thread_ts: '1000.000' },
      ]),
    });
    await syncThreadsForChannel(db, client, channelRow, ['1000.000']);

    const client2 = makeSlackClient({
      fetchThreadReplies: vi.fn(async () => [
        { ts: '1000.001', user: 'U002', text: 'edited reply', thread_ts: '1000.000' },
      ]),
    });
    await syncThreadsForChannel(db, client2, channelRow, ['1000.000']);

    const rows = await db.select().from(threads).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('edited reply');
  });

  it('does nothing when parentTsList is empty', async () => {
    const fetchThreadReplies = vi.fn(async () => []);
    const client = makeSlackClient({ fetchThreadReplies });
    await syncThreadsForChannel(db, client, channelRow, []);
    expect(fetchThreadReplies).not.toHaveBeenCalled();
    const rows = await db.select().from(threads).all();
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// syncAll
// ---------------------------------------------------------------------------

describe('syncAll', () => {
  const mockEnv = { SLACK_BOT_TOKEN: 'xoxb-test' } as unknown as Env;

  it('runs full sync and returns counts', async () => {
    const client = makeSlackClient({
      fetchChannels: vi.fn(async () => [
        { id: 'C001', name: 'general', is_private: false },
        { id: 'C002', name: 'random', is_private: false },
      ]),
      fetchUsers: vi.fn(async () => [makeSlackUser('U001', { display_name: 'Alice' })]),
      fetchMessages: vi.fn(async () => [
        { ts: '1000.000', user: 'U001', text: 'hello' },
        { ts: '1001.000', user: 'U001', text: 'world', thread_ts: '1001.000' },
      ]),
      fetchThreadReplies: vi.fn(async () => [
        { ts: '1001.001', user: 'U001', text: 'reply', thread_ts: '1001.000' },
      ]),
    });
    createSlackClientMock.mockReturnValue(client);

    const result = await syncAll(mockEnv, db, createLogger());

    expect(result.channelCount).toBe(2);
    // 2 messages × 2 channels
    expect(result.messageCount).toBe(4);

    // Channels stored
    const chRows = await db.select().from(channels).all();
    expect(chRows).toHaveLength(2);

    // Users stored
    const userRows = await db.select().from(slackUsers).all();
    expect(userRows).toHaveLength(1);

    // Threads stored (1 reply × 2 channels)
    const threadRows = await db.select().from(threads).all();
    expect(threadRows).toHaveLength(2);
  });

  it('handles zero channels gracefully', async () => {
    const client = makeSlackClient({
      fetchChannels: vi.fn(async () => []),
      fetchUsers: vi.fn(async () => []),
    });
    createSlackClientMock.mockReturnValue(client);

    const result = await syncAll(mockEnv, db, createLogger());
    expect(result.channelCount).toBe(0);
    expect(result.messageCount).toBe(0);
  });

  it('creates SlackClient with the token from env', async () => {
    const client = makeSlackClient();
    createSlackClientMock.mockReturnValue(client);

    await syncAll(mockEnv, db, createLogger());

    expect(createSlackClientMock).toHaveBeenCalledWith('xoxb-test');
  });
});

// ---------------------------------------------------------------------------
// syncExistingThreadsForChannel
// ---------------------------------------------------------------------------

describe('syncExistingThreadsForChannel', () => {
  let channelRow: { id: string; slackChannelId: string };

  beforeEach(async () => {
    const client = makeSlackClient({
      fetchChannels: vi.fn(async () => [{ id: 'C001', name: 'general', is_private: false }]),
    });
    await syncChannels(db, client);
    const ch = await db.select().from(channels).all();
    channelRow = ch[0];
  });

  it('fetches replies with oldest from replies_last_synced_at', async () => {
    // Seed a thread parent message with replies_last_synced_at set
    const syncedAt = '2024-01-01T00:00:00.000Z';
    await db.insert(messages).values({
      id: 'msg-1',
      slackTs: '1000.000',
      channelId: channelRow.id,
      userSlackId: 'U001',
      text: 'parent',
      threadTs: '1000.000',
      createdAt: '2024-01-01T00:00:00.000Z',
      repliesLastSyncedAt: syncedAt,
    });

    const fetchThreadReplies = vi.fn(async () => [
      { ts: '1000.001', user: 'U002', text: 'new reply', thread_ts: '1000.000' },
    ]);
    const client = makeSlackClient({ fetchThreadReplies });

    await syncExistingThreadsForChannel(db, client, channelRow);

    // Should pass oldest = unix timestamp of syncedAt
    const expectedOldest = String(Math.floor(new Date(syncedAt).getTime() / 1000));
    expect(fetchThreadReplies).toHaveBeenCalledWith('C001', '1000.000', expectedOldest);

    // New reply should be in threads table
    const rows = await db.select().from(threads).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('new reply');
  });

  it('updates replies_last_synced_at after sync', async () => {
    await db.insert(messages).values({
      id: 'msg-1',
      slackTs: '1000.000',
      channelId: channelRow.id,
      userSlackId: 'U001',
      text: 'parent',
      threadTs: '1000.000',
      createdAt: '2024-01-01T00:00:00.000Z',
      repliesLastSyncedAt: '2024-01-01T00:00:00.000Z',
    });

    const client = makeSlackClient({ fetchThreadReplies: vi.fn(async () => []) });
    await syncExistingThreadsForChannel(db, client, channelRow);

    const updated = await db.select().from(messages).all();
    // replies_last_synced_at should be updated to a more recent time
    expect(updated[0].repliesLastSyncedAt).not.toBe('2024-01-01T00:00:00.000Z');
  });

  it('skips messages without replies_last_synced_at', async () => {
    // Normal message (not a thread parent, no repliesLastSyncedAt)
    await db.insert(messages).values({
      id: 'msg-1',
      slackTs: '1000.000',
      channelId: channelRow.id,
      userSlackId: 'U001',
      text: 'normal message',
      threadTs: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      repliesLastSyncedAt: null,
    });

    const fetchThreadReplies = vi.fn(async () => []);
    const client = makeSlackClient({ fetchThreadReplies });

    await syncExistingThreadsForChannel(db, client, channelRow);

    expect(fetchThreadReplies).not.toHaveBeenCalled();
  });

  it('passes undefined as oldest when repliesLastSyncedAt is null', async () => {
    // This path is normally unreachable via the isNotNull() query filter,
    // but tests the fallback branch in syncRepliesForParent directly.
    await db.insert(messages).values({
      id: 'msg-1',
      slackTs: '1000.000',
      channelId: channelRow.id,
      userSlackId: 'U001',
      text: 'parent',
      threadTs: '1000.000',
      createdAt: '2024-01-01T00:00:00.000Z',
      repliesLastSyncedAt: '2024-01-01T00:00:00.000Z',
    });

    // Manually call with a parent that has null repliesLastSyncedAt to hit the else branch
    const fetchThreadReplies = vi.fn(async () => []);
    const client = makeSlackClient({ fetchThreadReplies });

    // Call syncRepliesForParent indirectly via syncThreadsForChannel (no oldest)
    await syncThreadsForChannel(db, client, channelRow, ['1000.000']);

    expect(fetchThreadReplies).toHaveBeenCalledWith('C001', '1000.000', undefined);
  });
});

// ---------------------------------------------------------------------------
// syncAll — SLACK_BOT_TOKEN guard
// ---------------------------------------------------------------------------

describe('syncAll — SLACK_BOT_TOKEN guard', () => {
  it('throws when SLACK_BOT_TOKEN is not configured', async () => {
    const envWithoutToken = { SLACK_BOT_TOKEN: '' } as unknown as Env;
    await expect(syncAll(envWithoutToken, db, createLogger())).rejects.toThrow(
      'SLACK_BOT_TOKEN is not configured',
    );
  });
});
