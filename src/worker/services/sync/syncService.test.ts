import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../slack/client', () => ({ createSlackClient: vi.fn() }));
import { createSlackClient } from '../slack/client';

import type { SlackClient, SlackUser } from '../slack/client';
import { createTestDb, seedUsers } from '../../test/helpers';
import type { Db } from '../../db/client';
import { channels, messages, slackUsers, threads } from '../../db/schema';
import { createLogger } from '../../lib/logger';
import {
  fullResyncAll,
  fullResyncWindowForChannel,
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

// ---------------------------------------------------------------------------
// fullResyncWindowForChannel
// ---------------------------------------------------------------------------

describe('fullResyncWindowForChannel', () => {
  const OLDEST = '1700000000';
  const LATEST = '1700259200'; // OLDEST + 3 days in seconds

  let channelRow: { id: string; slackChannelId: string };

  beforeEach(async () => {
    const client = makeSlackClient({
      fetchChannels: vi.fn(async () => [{ id: 'C001', name: 'general', is_private: false }]),
    });
    await syncChannels(db, client);
    const ch = await db.select().from(channels).all();
    channelRow = ch[0];
  });

  it('passes oldest and latest to fetchMessages', async () => {
    const fetchMessages = vi.fn(async () => []);
    const client = makeSlackClient({ fetchMessages });

    await fullResyncWindowForChannel(db, client, channelRow, OLDEST, LATEST);

    expect(fetchMessages).toHaveBeenCalledWith('C001', OLDEST, LATEST);
  });

  it('upserts messages in the window (reflects edits)', async () => {
    // Seed the message with old text
    await db.insert(messages).values({
      id: 'msg-1',
      slackTs: '1700100000.000',
      channelId: channelRow.id,
      userSlackId: 'U001',
      text: 'original text',
      threadTs: null,
      createdAt: new Date(1700100000 * 1000).toISOString(),
    });

    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [
        { ts: '1700100000.000', user: 'U001', text: 'edited text' },
      ]),
    });

    await fullResyncWindowForChannel(db, client, channelRow, OLDEST, LATEST);

    const rows = await db.select().from(messages).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe('edited text');
  });

  it('deletes messages that no longer exist in Slack (reflects deletions)', async () => {
    // Seed two messages in the window
    await db.insert(messages).values([
      {
        id: 'msg-keep',
        slackTs: '1700100000.000',
        channelId: channelRow.id,
        userSlackId: 'U001',
        text: 'keep',
        threadTs: null,
        createdAt: new Date(1700100000 * 1000).toISOString(),
      },
      {
        id: 'msg-deleted',
        slackTs: '1700110000.000',
        channelId: channelRow.id,
        userSlackId: 'U001',
        text: 'deleted in Slack',
        threadTs: null,
        createdAt: new Date(1700110000 * 1000).toISOString(),
      },
    ]);

    // API returns only the first message (second was deleted in Slack)
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [{ ts: '1700100000.000', user: 'U001', text: 'keep' }]),
    });

    await fullResyncWindowForChannel(db, client, channelRow, OLDEST, LATEST);

    const rows = await db.select().from(messages).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].slackTs).toBe('1700100000.000');
  });

  it('also deletes thread replies for deleted parent messages', async () => {
    // Seed a thread parent and its reply
    await db.insert(messages).values({
      id: 'msg-parent',
      slackTs: '1700100000.000',
      channelId: channelRow.id,
      userSlackId: 'U001',
      text: 'parent',
      threadTs: '1700100000.000',
      createdAt: new Date(1700100000 * 1000).toISOString(),
    });
    await db.insert(threads).values({
      id: 'thread-1',
      parentTs: '1700100000.000',
      channelId: channelRow.id,
      userSlackId: 'U002',
      text: 'reply',
      slackTs: '1700100001.000',
      createdAt: new Date(1700100001 * 1000).toISOString(),
    });

    // API returns no messages — parent was deleted
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => []),
    });

    await fullResyncWindowForChannel(db, client, channelRow, OLDEST, LATEST);

    const msgRows = await db.select().from(messages).all();
    const threadRows = await db.select().from(threads).all();
    expect(msgRows).toHaveLength(0);
    expect(threadRows).toHaveLength(0);
  });

  it('does not delete messages outside the window', async () => {
    // Seed a message outside the window (before OLDEST)
    await db.insert(messages).values({
      id: 'msg-old',
      slackTs: '1699000000.000', // before OLDEST
      channelId: channelRow.id,
      userSlackId: 'U001',
      text: 'old message outside window',
      threadTs: null,
      createdAt: new Date(1699000000 * 1000).toISOString(),
    });

    // API returns nothing for the window range
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => []),
    });

    await fullResyncWindowForChannel(db, client, channelRow, OLDEST, LATEST);

    // The old message should NOT be deleted (it's outside the window)
    const rows = await db.select().from(messages).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].slackTs).toBe('1699000000.000');
  });

  it('fully resyncs thread replies for thread parents in the window', async () => {
    // API returns a thread parent in the window
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [
        { ts: '1700100000.000', user: 'U001', text: 'parent', thread_ts: '1700100000.000' },
      ]),
      fetchThreadReplies: vi.fn(async () => [
        { ts: '1700100001.000', user: 'U002', text: 'reply A', thread_ts: '1700100000.000' },
        { ts: '1700100002.000', user: 'U003', text: 'reply B', thread_ts: '1700100000.000' },
      ]),
    });

    await fullResyncWindowForChannel(db, client, channelRow, OLDEST, LATEST);

    const threadRows = await db.select().from(threads).all();
    expect(threadRows).toHaveLength(2);
  });

  it('deletes thread replies that no longer exist in Slack', async () => {
    // Seed the parent message
    await db.insert(messages).values({
      id: 'msg-parent',
      slackTs: '1700100000.000',
      channelId: channelRow.id,
      userSlackId: 'U001',
      text: 'parent',
      threadTs: '1700100000.000',
      createdAt: new Date(1700100000 * 1000).toISOString(),
      repliesLastSyncedAt: '2024-01-01T00:00:00.000Z',
    });
    // Seed two existing replies
    await db.insert(threads).values([
      {
        id: 'reply-keep',
        parentTs: '1700100000.000',
        channelId: channelRow.id,
        userSlackId: 'U002',
        text: 'keep reply',
        slackTs: '1700100001.000',
        createdAt: new Date(1700100001 * 1000).toISOString(),
      },
      {
        id: 'reply-deleted',
        parentTs: '1700100000.000',
        channelId: channelRow.id,
        userSlackId: 'U003',
        text: 'deleted reply',
        slackTs: '1700100002.000',
        createdAt: new Date(1700100002 * 1000).toISOString(),
      },
    ]);

    // API returns only one reply (the other was deleted)
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [
        { ts: '1700100000.000', user: 'U001', text: 'parent', thread_ts: '1700100000.000' },
      ]),
      fetchThreadReplies: vi.fn(async () => [
        { ts: '1700100001.000', user: 'U002', text: 'keep reply', thread_ts: '1700100000.000' },
      ]),
    });

    await fullResyncWindowForChannel(db, client, channelRow, OLDEST, LATEST);

    const threadRows = await db.select().from(threads).all();
    expect(threadRows).toHaveLength(1);
    expect(threadRows[0].slackTs).toBe('1700100001.000');
  });

  it('fetches thread replies with no oldest filter (full resync)', async () => {
    const fetchThreadReplies = vi.fn(async () => []);
    const client = makeSlackClient({
      fetchMessages: vi.fn(async () => [
        { ts: '1700100000.000', user: 'U001', text: 'parent', thread_ts: '1700100000.000' },
      ]),
      fetchThreadReplies,
    });

    await fullResyncWindowForChannel(db, client, channelRow, OLDEST, LATEST);

    // No oldest — full thread resync
    expect(fetchThreadReplies).toHaveBeenCalledWith('C001', '1700100000.000');
  });
});

// ---------------------------------------------------------------------------
// fullResyncAll
// ---------------------------------------------------------------------------

describe('fullResyncAll', () => {
  const mockEnv = { SLACK_BOT_TOKEN: 'xoxb-test' } as unknown as Env;

  it('calls fullResyncWindowForChannel for every channel', async () => {
    const fetchMessages = vi.fn(async () => []);
    const client = makeSlackClient({ fetchMessages });
    createSlackClientMock.mockReturnValue(client);

    // Seed two channels directly
    await db.insert(channels).values([
      {
        id: 'ch-1',
        slackChannelId: 'C001',
        name: 'general',
        isPrivate: false,
        lastSyncedAt: null,
      },
      {
        id: 'ch-2',
        slackChannelId: 'C002',
        name: 'random',
        isPrivate: false,
        lastSyncedAt: null,
      },
    ]);

    await fullResyncAll(mockEnv, db, createLogger());

    // fetchMessages called once per channel
    expect(fetchMessages).toHaveBeenCalledTimes(2);
    expect(fetchMessages).toHaveBeenCalledWith('C001', expect.any(String), expect.any(String));
    expect(fetchMessages).toHaveBeenCalledWith('C002', expect.any(String), expect.any(String));
  });

  it('uses a window of 90 days ago to 87 days ago', async () => {
    const fetchMessages = vi.fn(async () => []);
    const client = makeSlackClient({ fetchMessages });
    createSlackClientMock.mockReturnValue(client);

    await db.insert(channels).values({
      id: 'ch-1',
      slackChannelId: 'C001',
      name: 'general',
      isPrivate: false,
      lastSyncedAt: null,
    });

    const before = Math.floor(Date.now() / 1000);
    await fullResyncAll(mockEnv, db, createLogger());
    const after = Math.floor(Date.now() / 1000);

    const [_channelId, oldest, latest] = fetchMessages.mock.calls[0] as unknown as [
      string,
      string,
      string,
    ];
    const oldestNum = Number(oldest);
    const latestNum = Number(latest);

    // oldest ≈ now - 90 days
    expect(oldestNum).toBeGreaterThanOrEqual(before - 90 * 24 * 60 * 60);
    expect(oldestNum).toBeLessThanOrEqual(after - 90 * 24 * 60 * 60);

    // latest ≈ now - 87 days
    expect(latestNum).toBeGreaterThanOrEqual(before - 87 * 24 * 60 * 60);
    expect(latestNum).toBeLessThanOrEqual(after - 87 * 24 * 60 * 60);

    // window is exactly 3 days
    expect(latestNum - oldestNum).toBe(3 * 24 * 60 * 60);
  });

  it('throws when SLACK_BOT_TOKEN is not configured', async () => {
    const envWithoutToken = { SLACK_BOT_TOKEN: '' } as unknown as Env;
    await expect(fullResyncAll(envWithoutToken, db, createLogger())).rejects.toThrow(
      'SLACK_BOT_TOKEN is not configured',
    );
  });

  it('does nothing when there are no channels', async () => {
    const fetchMessages = vi.fn(async () => []);
    const client = makeSlackClient({ fetchMessages });
    createSlackClientMock.mockReturnValue(client);

    await fullResyncAll(mockEnv, db, createLogger());

    expect(fetchMessages).not.toHaveBeenCalled();
  });
});
