import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { z } from 'zod';

// The zod schemas in client.ts are intentionally private, so everything is verified through the
// public client API with @slack/web-api's WebClient replaced by mocks.
type PageParams = {
  channel?: string;
  ts?: string;
  types?: string;
  exclude_archived?: boolean;
  limit?: number;
  oldest?: string;
  latest?: string;
  cursor?: string;
};

const mocks = vi.hoisted(() => ({
  webClientCtor: vi.fn<(token: string) => void>(),
  conversationsList: vi.fn<(params: PageParams) => Promise<unknown>>(),
  conversationsJoin: vi.fn<(params: { channel: string }) => Promise<unknown>>(),
  conversationsHistory: vi.fn<(params: PageParams) => Promise<unknown>>(),
  conversationsReplies: vi.fn<(params: PageParams) => Promise<unknown>>(),
  usersList: vi.fn<(params: PageParams) => Promise<unknown>>(),
}));

vi.mock('@slack/web-api', () => ({
  WebClient: class {
    conversations = {
      list: mocks.conversationsList,
      join: mocks.conversationsJoin,
      history: mocks.conversationsHistory,
      replies: mocks.conversationsReplies,
    };
    users = { list: mocks.usersList };
    constructor(token: string) {
      mocks.webClientCtor(token);
    }
  },
}));

import type { Logger } from '../../lib/logger';
import {
  type SlackChannel,
  type SlackClient,
  type SlackMessage,
  type SlackUser,
  createSlackClient,
} from './client';

// Each page request of a fetch* function is preceded by a sleep, so timers are faked and flushed
// explicitly. Racing the promise against the timer flush keeps a rejection from going unhandled.
async function settle<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([promise, vi.runAllTimersAsync()]);
  return result;
}

function makeLogger() {
  const warn = vi.fn<(msg: string, ctx?: Record<string, unknown>) => void>();
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn,
    error: vi.fn(),
    child: () => logger,
  };
  return { logger, warn };
}

// Most tests do not care about logging; the logger is required by createSlackClient.
const silentLogger = makeLogger().logger;
const makeClient = (logger: Logger = silentLogger) => createSlackClient('xoxb-test-token', logger);

beforeEach(() => {
  // clearMocks only clears calls; reset also drops any unconsumed mockResolvedValueOnce.
  for (const mock of Object.values(mocks)) mock.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createSlackClient', () => {
  it('creates the WebClient with the given token', () => {
    createSlackClient('xoxb-secret-token', silentLogger);
    expect(mocks.webClientCtor).toHaveBeenCalledExactlyOnceWith('xoxb-secret-token');
  });
});

describe('rate-limit pause', () => {
  // The exact sleep length is deliberately not pinned (the code uses 200ms, see SLEEP_MS and
  // .claude/rules/slack-api.md). What matters is that every page request is preceded by a pause
  // that is neither missing nor excessive.
  const MIN_PAUSE_MS = 100;
  const MAX_PAUSE_MS = 1000;

  type Fetcher = readonly [
    name: string,
    call: () => Promise<unknown>,
    api: 'conversationsList' | 'conversationsHistory' | 'conversationsReplies' | 'usersList',
  ];
  const fetchers: readonly Fetcher[] = [
    ['fetchChannels', () => makeClient().fetchChannels(), 'conversationsList'],
    ['fetchMessages', () => makeClient().fetchMessages('C1'), 'conversationsHistory'],
    [
      'fetchThreadReplies',
      () => makeClient().fetchThreadReplies('C1', '10.0'),
      'conversationsReplies',
    ],
    ['fetchUsers', () => makeClient().fetchUsers(), 'usersList'],
  ];

  it.each(fetchers)('%s pauses before every page request', async (_name, call, key) => {
    const callTimes: number[] = [];
    mocks[key].mockImplementation(async () => {
      callTimes.push(Date.now());
      // First page points at a second page; the second page ends the loop.
      return callTimes.length === 1 ? { response_metadata: { next_cursor: 'page-2' } } : {};
    });

    const start = Date.now();
    await settle(call());

    expect(callTimes).toHaveLength(2);
    expect(callTimes[0] - start).toBeGreaterThanOrEqual(MIN_PAUSE_MS);
    expect(callTimes[0] - start).toBeLessThanOrEqual(MAX_PAUSE_MS);
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(MIN_PAUSE_MS);
    expect(callTimes[1] - callTimes[0]).toBeLessThanOrEqual(MAX_PAUSE_MS);
  });
});

describe('fetchChannels', () => {
  it('requests non-archived public channels, 200 per page', async () => {
    mocks.conversationsList.mockResolvedValue({ channels: [] });
    await settle(makeClient().fetchChannels());

    expect(mocks.conversationsList).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ types: 'public_channel', exclude_archived: true, limit: 200 }),
    );
    expect(mocks.conversationsList.mock.calls[0][0].cursor).toBeUndefined();
  });

  it('keeps only the fields it uses and defaults is_private to false', async () => {
    mocks.conversationsList.mockResolvedValue({
      channels: [
        { id: 'C1', name: 'general', topic: { value: 'ignored' }, num_members: 3 },
        { id: 'C2', name: 'secret', is_private: true },
      ],
    });

    const result = await settle(makeClient().fetchChannels());

    expect(result).toEqual([
      { id: 'C1', name: 'general', is_private: false },
      { id: 'C2', name: 'secret', is_private: true },
    ]);
  });

  it('drops entries that do not match the schema', async () => {
    mocks.conversationsList.mockResolvedValue({
      channels: [
        { id: 'C1' },
        { name: 'no-id' },
        { id: 2, name: 'numeric-id' },
        { id: 'C3', name: 'bad-flag', is_private: 'yes' },
        null,
        'channel',
        { id: 'C5', name: 'valid' },
      ],
    });

    const result = await settle(makeClient().fetchChannels());

    expect(result).toEqual([{ id: 'C5', name: 'valid', is_private: false }]);
  });

  // Slack may send an explicit null for an optional field; it is treated like a missing field
  // instead of dropping the whole channel.
  it('treats a null is_private as false instead of dropping the channel', async () => {
    mocks.conversationsList.mockResolvedValue({
      channels: [{ id: 'C1', name: 'null-flag', is_private: null }],
    });

    const result = await settle(makeClient().fetchChannels());

    expect(result).toEqual([{ id: 'C1', name: 'null-flag', is_private: false }]);
  });

  it.each([
    ['id', { id: null, name: 'x' }],
    ['name', { id: 'C1', name: null }],
  ])('still drops a channel whose required field %s is null', async (_field, broken) => {
    mocks.conversationsList.mockResolvedValue({
      channels: [broken, { id: 'C2', name: 'ok' }],
    });

    const result = await settle(makeClient().fetchChannels());

    expect(result.map((c) => c.id)).toEqual(['C2']);
  });

  it('returns an empty list when the response has no channels', async () => {
    mocks.conversationsList.mockResolvedValue({});
    expect(await settle(makeClient().fetchChannels())).toEqual([]);
  });

  it('follows next_cursor across pages and stops on an empty cursor', async () => {
    mocks.conversationsList
      .mockResolvedValueOnce({
        channels: [{ id: 'C1', name: 'one' }],
        response_metadata: { next_cursor: 'page-2' },
      })
      .mockResolvedValueOnce({
        channels: [{ id: 'C2', name: 'two' }],
        response_metadata: { next_cursor: '' },
      });

    const result = await settle(makeClient().fetchChannels());

    expect(result.map((c) => c.id)).toEqual(['C1', 'C2']);
    expect(mocks.conversationsList).toHaveBeenCalledTimes(2);
    expect(mocks.conversationsList.mock.calls[0][0].cursor).toBeUndefined();
    expect(mocks.conversationsList.mock.calls[1][0].cursor).toBe('page-2');
  });

  it('propagates API errors to the caller', async () => {
    mocks.conversationsList
      .mockResolvedValueOnce({
        channels: [{ id: 'C1', name: 'one' }],
        response_metadata: { next_cursor: 'page-2' },
      })
      .mockRejectedValueOnce(new Error('ratelimited'));

    await expect(settle(makeClient().fetchChannels())).rejects.toThrow('ratelimited');
  });
});

describe('joinChannel', () => {
  // Unlike the fetch* functions, joining does not pause first.
  it('joins the given channel', async () => {
    mocks.conversationsJoin.mockResolvedValue({ ok: true });
    await makeClient().joinChannel('C1');
    expect(mocks.conversationsJoin).toHaveBeenCalledExactlyOnceWith({ channel: 'C1' });
  });
});

describe('fetchMessages', () => {
  it('passes channel, oldest and latest through, 200 per page', async () => {
    mocks.conversationsHistory.mockResolvedValue({ messages: [] });
    await settle(makeClient().fetchMessages('C1', '100.000', '200.000'));

    expect(mocks.conversationsHistory).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ channel: 'C1', limit: 200, oldest: '100.000', latest: '200.000' }),
    );
    expect(mocks.conversationsHistory.mock.calls[0][0].cursor).toBeUndefined();
  });

  it('leaves oldest and latest undefined when omitted', async () => {
    mocks.conversationsHistory.mockResolvedValue({ messages: [] });
    await settle(makeClient().fetchMessages('C1'));

    const params = mocks.conversationsHistory.mock.calls[0][0];
    expect(params.oldest).toBeUndefined();
    expect(params.latest).toBeUndefined();
  });

  it('keeps only plain messages (type "message" without a subtype)', async () => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [
        { type: 'message', ts: '1.0', user: 'U1', text: 'hello', thread_ts: '1.0' },
        { type: 'message', subtype: 'channel_join', ts: '2.0', user: 'U2', text: 'joined' },
        { type: 'message', subtype: 'bot_message', ts: '3.0', text: 'bot' },
        { ts: '4.0', user: 'U3', text: 'no type' },
        { type: 'event', ts: '5.0', user: 'U4', text: 'other type' },
      ],
    });

    const result = await settle(makeClient().fetchMessages('C1'));

    expect(result).toEqual([
      { type: 'message', ts: '1.0', user: 'U1', text: 'hello', thread_ts: '1.0' },
    ]);
  });

  it('defaults text to an empty string and drops unused fields', async () => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [{ type: 'message', ts: '1.0', user: 'U1', reactions: [{ name: 'x' }] }],
    });

    const result = await settle(makeClient().fetchMessages('C1'));

    expect(result).toEqual([{ type: 'message', ts: '1.0', user: 'U1', text: '' }]);
  });

  it('drops entries that do not match the schema', async () => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [
        { type: 'message', user: 'U1', text: 'missing ts' },
        { type: 'message', ts: 123, text: 'numeric ts' },
        { type: 'message', ts: '1.0', text: 42 },
        { type: 'message', ts: '2.0', thread_ts: 3 },
        null,
        { type: 'message', ts: '9.0', text: 'valid' },
      ],
    });

    const result = await settle(makeClient().fetchMessages('C1'));

    expect(result).toEqual([{ type: 'message', ts: '9.0', text: 'valid' }]);
  });

  // Slack may send an explicit null for an optional field; it is treated like a missing field
  // instead of dropping the whole message.
  it.each([
    'user',
    'thread_ts',
    'subtype',
  ] as const)('keeps a message whose %s is null and treats it as missing', async (field) => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [{ type: 'message', ts: '1.0', text: 'ok', [field]: null }],
    });

    const result = await settle(makeClient().fetchMessages('C1'));

    expect(result).toHaveLength(1);
    expect(result[0][field]).toBeUndefined();
  });

  it('defaults a null text to an empty string', async () => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [{ type: 'message', ts: '1.0', user: 'U1', text: null }],
    });

    const result = await settle(makeClient().fetchMessages('C1'));

    expect(result).toEqual([{ type: 'message', ts: '1.0', user: 'U1', text: '' }]);
  });

  // A null type is no longer a schema failure, but such a message is still not a plain "message",
  // so the type filter excludes it.
  it('excludes a message whose type is null through the type filter', async () => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [{ type: null, ts: '1.0', text: 'ok' }],
    });

    expect(await settle(makeClient().fetchMessages('C1'))).toEqual([]);
  });

  it('still drops a message whose ts is null', async () => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [
        { type: 'message', ts: null, text: 'no ts' },
        { type: 'message', ts: '2.0', text: 'ok' },
      ],
    });

    const result = await settle(makeClient().fetchMessages('C1'));

    expect(result.map((m) => m.ts)).toEqual(['2.0']);
  });

  // Current behavior: the schema only requires ts to be a string, so unlike fetchThreadReplies an
  // empty ts is not filtered here.
  it('keeps a message with an empty ts', async () => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [{ type: 'message', ts: '', text: 'empty ts' }],
    });

    const result = await settle(makeClient().fetchMessages('C1'));

    expect(result).toEqual([{ type: 'message', ts: '', text: 'empty ts' }]);
  });

  it('returns an empty list when the response has no messages', async () => {
    mocks.conversationsHistory.mockResolvedValue({});
    expect(await settle(makeClient().fetchMessages('C1'))).toEqual([]);
  });

  it('follows next_cursor across pages', async () => {
    mocks.conversationsHistory
      .mockResolvedValueOnce({
        messages: [{ type: 'message', ts: '1.0', text: 'a' }],
        response_metadata: { next_cursor: 'page-2' },
      })
      .mockResolvedValueOnce({
        messages: [{ type: 'message', ts: '2.0', text: 'b' }],
        response_metadata: { next_cursor: '' },
      });

    const result = await settle(makeClient().fetchMessages('C1'));

    expect(result.map((m) => m.ts)).toEqual(['1.0', '2.0']);
    expect(mocks.conversationsHistory).toHaveBeenCalledTimes(2);
    expect(mocks.conversationsHistory.mock.calls[1][0].cursor).toBe('page-2');
  });
});

describe('fetchThreadReplies', () => {
  it('passes channel, thread ts and oldest through, 200 per page', async () => {
    mocks.conversationsReplies.mockResolvedValue({ messages: [] });
    await settle(makeClient().fetchThreadReplies('C1', '10.0', '5.0'));

    expect(mocks.conversationsReplies).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ channel: 'C1', ts: '10.0', limit: 200, oldest: '5.0' }),
    );
    expect(mocks.conversationsReplies.mock.calls[0][0].cursor).toBeUndefined();
  });

  it('skips the first message of the page (the thread parent)', async () => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent', thread_ts: '10.0' },
        { type: 'message', ts: '10.1', user: 'U1', text: 'reply 1', thread_ts: '10.0' },
        { type: 'message', ts: '10.2', user: 'U2', text: 'reply 2', thread_ts: '10.0' },
      ],
    });

    const result = await settle(makeClient().fetchThreadReplies('C1', '10.0'));

    expect(result.map((m) => m.ts)).toEqual(['10.1', '10.2']);
  });

  it('returns nothing when the thread only contains its parent', async () => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [{ type: 'message', ts: '10.0', text: 'parent' }],
    });
    expect(await settle(makeClient().fetchThreadReplies('C1', '10.0'))).toEqual([]);
  });

  it('returns an empty list when the response has no messages', async () => {
    mocks.conversationsReplies.mockResolvedValue({});
    expect(await settle(makeClient().fetchThreadReplies('C1', '10.0'))).toEqual([]);
  });

  // Unlike fetchMessages, replies are not filtered by type or subtype (e.g. thread_broadcast).
  it('does not filter replies by type or subtype', async () => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent' },
        { type: 'message', subtype: 'thread_broadcast', ts: '10.1', user: 'U1', text: 'bcast' },
        { ts: '10.2', user: 'U2', text: 'no type' },
      ],
    });

    const result = await settle(makeClient().fetchThreadReplies('C1', '10.0'));

    expect(result.map((m) => m.ts)).toEqual(['10.1', '10.2']);
  });

  it('drops replies that do not match the schema', async () => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent' },
        { type: 'message', user: 'U1', text: 'missing ts' },
        { type: 'message', ts: 11, text: 'numeric ts' },
        { type: 'message', ts: '10.4', user: 'U1', text: 'valid' },
      ],
    });

    const result = await settle(makeClient().fetchThreadReplies('C1', '10.0'));

    expect(result).toEqual([{ type: 'message', ts: '10.4', user: 'U1', text: 'valid' }]);
  });

  // Slack may send an explicit null for an optional field; it is treated like a missing field
  // instead of dropping the whole reply.
  it.each([
    'type',
    'subtype',
    'user',
    'thread_ts',
  ] as const)('keeps a reply whose %s is null and treats it as missing', async (field) => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent' },
        { type: 'message', ts: '10.1', text: 'ok', [field]: null },
      ],
    });

    const result = await settle(makeClient().fetchThreadReplies('C1', '10.0'));

    expect(result).toHaveLength(1);
    expect(result[0].ts).toBe('10.1');
    expect(result[0][field]).toBeUndefined();
  });

  it('defaults a null reply text to an empty string', async () => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent' },
        { type: 'message', ts: '10.1', user: 'U1', text: null },
      ],
    });

    const result = await settle(makeClient().fetchThreadReplies('C1', '10.0'));

    expect(result).toEqual([{ type: 'message', ts: '10.1', user: 'U1', text: '' }]);
  });

  it('still drops a reply whose ts is null', async () => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent' },
        { type: 'message', ts: null, text: 'no ts' },
        { type: 'message', ts: '10.2', text: 'ok' },
      ],
    });

    const result = await settle(makeClient().fetchThreadReplies('C1', '10.0'));

    expect(result.map((m) => m.ts)).toEqual(['10.2']);
  });

  // Current behavior: the schema accepts any string for ts, but fetchThreadReplies additionally
  // requires it to be non-empty. fetchMessages has no such check, so the two are asymmetric.
  it('drops replies with an empty ts', async () => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent' },
        { type: 'message', ts: '', text: 'empty ts' },
        { type: 'message', ts: '10.1', text: 'valid' },
      ],
    });

    const result = await settle(makeClient().fetchThreadReplies('C1', '10.0'));

    expect(result.map((m) => m.ts)).toEqual(['10.1']);
  });

  // Characterization of the current implementation, not verified Slack behavior: the first
  // message of EVERY page is skipped as the parent. The fixture below assumes Slack repeats the
  // parent on each page of conversations.replies; if it does not, the first reply of every later
  // page would be lost, and this test (and the implementation) would need revisiting.
  it('skips the first message of every page when paginating', async () => {
    mocks.conversationsReplies
      .mockResolvedValueOnce({
        messages: [
          { type: 'message', ts: '10.0', text: 'parent' },
          { type: 'message', ts: '10.1', text: 'r1' },
        ],
        response_metadata: { next_cursor: 'page-2' },
      })
      .mockResolvedValueOnce({
        messages: [
          { type: 'message', ts: '10.0', text: 'parent' },
          { type: 'message', ts: '10.2', text: 'r2' },
        ],
        response_metadata: { next_cursor: '' },
      });

    const result = await settle(makeClient().fetchThreadReplies('C1', '10.0'));

    expect(result.map((m) => m.ts)).toEqual(['10.1', '10.2']);
    expect(mocks.conversationsReplies).toHaveBeenCalledTimes(2);
    expect(mocks.conversationsReplies.mock.calls[1][0].cursor).toBe('page-2');
  });
});

describe('fetchUsers', () => {
  it('requests 200 members per page', async () => {
    mocks.usersList.mockResolvedValue({ members: [] });
    await settle(makeClient().fetchUsers());

    expect(mocks.usersList).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ limit: 200 }),
    );
    expect(mocks.usersList.mock.calls[0][0].cursor).toBeUndefined();
  });

  it('keeps only the profile fields it uses and applies flag defaults', async () => {
    mocks.usersList.mockResolvedValue({
      members: [
        {
          id: 'U1',
          team_id: 'T1',
          real_name: 'top level, ignored',
          profile: {
            display_name: 'alice',
            real_name: 'Alice A',
            image_72: 'https://example.com/a.png',
            title: 'ignored',
          },
        },
        { id: 'U2' },
      ],
    });

    const result = await settle(makeClient().fetchUsers());

    expect(result).toEqual([
      {
        id: 'U1',
        deleted: false,
        is_bot: false,
        is_app_user: false,
        profile: {
          display_name: 'alice',
          real_name: 'Alice A',
          image_72: 'https://example.com/a.png',
        },
      },
      { id: 'U2', deleted: false, is_bot: false, is_app_user: false },
    ]);
  });

  it('keeps users whose profile has only some of the fields', async () => {
    mocks.usersList.mockResolvedValue({
      members: [
        { id: 'U1', profile: { display_name: 'only-display' } },
        { id: 'U2', profile: { real_name: 'Only Real' } },
        { id: 'U3', profile: { image_72: 'https://example.com/c.png' } },
        { id: 'U4', profile: {} },
      ],
    });

    const result = await settle(makeClient().fetchUsers());

    expect(result.map((u) => [u.id, u.profile])).toEqual([
      ['U1', { display_name: 'only-display' }],
      ['U2', { real_name: 'Only Real' }],
      ['U3', { image_72: 'https://example.com/c.png' }],
      ['U4', {}],
    ]);
  });

  it('excludes deleted users, bots, app users and Slackbot', async () => {
    mocks.usersList.mockResolvedValue({
      members: [
        { id: 'U1' },
        { id: 'U2', deleted: true },
        { id: 'U3', is_bot: true },
        { id: 'U4', is_app_user: true },
        { id: 'USLACKBOT' },
        { id: 'U5', deleted: false, is_bot: false, is_app_user: false },
      ],
    });

    const result = await settle(makeClient().fetchUsers());

    expect(result.map((u) => u.id)).toEqual(['U1', 'U5']);
  });

  it('drops entries that do not match the schema', async () => {
    mocks.usersList.mockResolvedValue({
      members: [
        { name: 'no-id' },
        { id: 7 },
        { id: 'U1', deleted: 'no' },
        { id: 'U3', profile: 'not an object' },
        { id: 'U4', profile: { display_name: 5 } },
        null,
        { id: 'U9' },
      ],
    });

    const result = await settle(makeClient().fetchUsers());

    expect(result.map((u) => u.id)).toEqual(['U9']);
  });

  // Slack may send an explicit null for an optional field; it is treated like a missing field
  // instead of dropping the whole user. A null flag counts as false (the default).
  it.each([
    'deleted',
    'is_bot',
    'is_app_user',
  ] as const)('keeps a user whose %s is null and treats it as false', async (field) => {
    mocks.usersList.mockResolvedValue({ members: [{ id: 'U1', [field]: null }] });

    const result = await settle(makeClient().fetchUsers());

    expect(result).toHaveLength(1);
    expect(result[0][field]).toBe(false);
  });

  it('keeps a user whose profile is null and treats it as missing', async () => {
    mocks.usersList.mockResolvedValue({ members: [{ id: 'U1', profile: null }] });

    const result = await settle(makeClient().fetchUsers());

    expect(result).toHaveLength(1);
    expect(result[0].profile).toBeUndefined();
  });

  it.each([
    'display_name',
    'real_name',
    'image_72',
  ] as const)('keeps a user whose profile.%s is null and treats it as missing', async (field) => {
    mocks.usersList.mockResolvedValue({
      members: [
        { id: 'U1', profile: { display_name: 'a', real_name: 'b', image_72: 'c', [field]: null } },
      ],
    });

    const result = await settle(makeClient().fetchUsers());

    expect(result).toHaveLength(1);
    expect(result[0].profile?.[field]).toBeUndefined();
  });

  it('still drops a user whose id is null', async () => {
    mocks.usersList.mockResolvedValue({ members: [{ id: null }, { id: 'U2' }] });

    const result = await settle(makeClient().fetchUsers());

    expect(result.map((u) => u.id)).toEqual(['U2']);
  });

  it('returns an empty list when the response has no members', async () => {
    mocks.usersList.mockResolvedValue({});
    expect(await settle(makeClient().fetchUsers())).toEqual([]);
  });

  it('follows next_cursor across pages', async () => {
    mocks.usersList
      .mockResolvedValueOnce({
        members: [{ id: 'U1' }],
        response_metadata: { next_cursor: 'page-2' },
      })
      .mockResolvedValueOnce({
        members: [{ id: 'U2' }],
        response_metadata: { next_cursor: '' },
      });

    const result = await settle(makeClient().fetchUsers());

    expect(result.map((u) => u.id)).toEqual(['U1', 'U2']);
    expect(mocks.usersList).toHaveBeenCalledTimes(2);
    expect(mocks.usersList.mock.calls[1][0].cursor).toBe('page-2');
  });
});

describe('dropped entry reporting', () => {
  const MESSAGE = 'dropped Slack entries that did not match the expected schema';

  // Parse the logged context instead of casting it, so a change in its shape fails loudly.
  const loggedSchema = z.object({
    fn: z.string(),
    count: z.number(),
    truncated: z.boolean(),
    entries: z.array(z.object({ id: z.string().optional(), fields: z.array(z.string()) })),
  });
  const firstWarning = (warn: ReturnType<typeof makeLogger>['warn']) =>
    loggedSchema.parse(warn.mock.calls[0][1]);

  type Api = 'conversationsList' | 'conversationsHistory' | 'conversationsReplies' | 'usersList';
  type Fetcher = {
    name: string;
    run: (client: SlackClient) => Promise<unknown>;
    api: Api;
    // Extra context that locates the fetch in Slack (channel id, parent ts).
    where: Record<string, string>;
    // Builds an API response page from raw entries (replies prepend the thread parent).
    page: (entries: unknown[], nextCursor?: string) => unknown;
    // The i-th entry that fails the schema, its logged id and offending fields.
    bad: (i: number) => unknown;
    badId: (i: number) => string;
    badFields: string[];
    // An entry with no id/ts that carries content which must never reach the log.
    leaky: unknown;
  };

  const message = (i: number) => ({ type: 'message', ts: `${i}.0`, text: 42 });
  const fetchers: readonly Fetcher[] = [
    {
      name: 'fetchChannels',
      run: (client) => client.fetchChannels(),
      api: 'conversationsList',
      where: {},
      page: (entries, next) => ({ channels: entries, response_metadata: { next_cursor: next } }),
      bad: (i) => ({ id: `C${i}` }),
      badId: (i) => `C${i}`,
      badFields: ['name'],
      leaky: { name: 'TOP-SECRET channel name' },
    },
    {
      name: 'fetchMessages',
      run: (client) => client.fetchMessages('C1'),
      api: 'conversationsHistory',
      where: { channel: 'C1' },
      page: (entries, next) => ({ messages: entries, response_metadata: { next_cursor: next } }),
      bad: message,
      badId: (i) => `${i}.0`,
      badFields: ['text'],
      leaky: { type: 'message', text: 'TOP-SECRET message body', user: 'TOP-SECRET user' },
    },
    {
      name: 'fetchThreadReplies',
      run: (client) => client.fetchThreadReplies('C1', '10.0'),
      api: 'conversationsReplies',
      where: { channel: 'C1', thread_ts: '10.0' },
      page: (entries, next) => ({
        messages: [{ type: 'message', ts: '10.0', text: 'parent' }, ...entries],
        response_metadata: { next_cursor: next },
      }),
      bad: message,
      badId: (i) => `${i}.0`,
      badFields: ['text'],
      leaky: { type: 'message', text: 'TOP-SECRET reply body' },
    },
    {
      name: 'fetchUsers',
      run: (client) => client.fetchUsers(),
      api: 'usersList',
      where: {},
      page: (entries, next) => ({ members: entries, response_metadata: { next_cursor: next } }),
      bad: (i) => ({ id: `U${i}`, deleted: 'no' }),
      badId: (i) => `U${i}`,
      badFields: ['deleted'],
      leaky: { profile: { real_name: 'TOP-SECRET Person', display_name: 5 } },
    },
  ];

  it.each(
    fetchers,
  )('$name warns once with the function, location, count, id and offending field', async (f) => {
    const { logger, warn } = makeLogger();
    mocks[f.api].mockResolvedValue(f.page([f.bad(1)]));

    await settle(f.run(makeClient(logger)));

    expect(warn).toHaveBeenCalledExactlyOnceWith(MESSAGE, {
      fn: f.name,
      ...f.where,
      count: 1,
      entries: [{ id: f.badId(1), fields: f.badFields }],
      truncated: false,
    });
  });

  it.each(fetchers)('$name aggregates drops across pages into a single warning', async (f) => {
    const { logger, warn } = makeLogger();
    mocks[f.api]
      .mockResolvedValueOnce(f.page([f.bad(1)], 'page-2'))
      .mockResolvedValueOnce(f.page([f.bad(2)]));

    await settle(f.run(makeClient(logger)));

    expect(warn).toHaveBeenCalledOnce();
    const logged = firstWarning(warn);
    expect(logged.count).toBe(2);
    expect(logged.entries.map((e) => e.id)).toEqual([f.badId(1), f.badId(2)]);
  });

  it.each(fetchers)('$name does not carry drops over between calls on one client', async (f) => {
    const { logger, warn } = makeLogger();
    const client = makeClient(logger);
    mocks[f.api]
      .mockResolvedValueOnce(f.page([f.bad(1)]))
      .mockResolvedValueOnce(f.page([f.bad(2)]));

    await settle(f.run(client));
    await settle(f.run(client));

    expect(warn).toHaveBeenCalledTimes(2);
    const second = loggedSchema.parse(warn.mock.calls[1][1]);
    expect(second.count).toBe(1);
    expect(second.entries.map((e) => e.id)).toEqual([f.badId(2)]);
  });

  it.each(fetchers)('$name marks truncation only above 20 logged entries', async (f) => {
    const exactly20 = makeLogger();
    mocks[f.api].mockResolvedValueOnce(f.page(Array.from({ length: 20 }, (_, i) => f.bad(i))));
    await settle(f.run(makeClient(exactly20.logger)));
    const at20 = firstWarning(exactly20.warn);
    expect([at20.count, at20.entries.length, at20.truncated]).toEqual([20, 20, false]);

    const over20 = makeLogger();
    mocks[f.api].mockResolvedValueOnce(f.page(Array.from({ length: 21 }, (_, i) => f.bad(i))));
    await settle(f.run(makeClient(over20.logger)));
    const at21 = firstWarning(over20.warn);
    expect([at21.count, at21.entries.length, at21.truncated]).toEqual([21, 20, true]);
  });

  it.each(fetchers)('$name still reports the drops seen before an API failure', async (f) => {
    const { logger, warn } = makeLogger();
    mocks[f.api]
      .mockResolvedValueOnce(f.page([f.bad(1)], 'page-2'))
      .mockRejectedValueOnce(new Error('boom'));

    await expect(settle(f.run(makeClient(logger)))).rejects.toThrow('boom');

    expect(warn).toHaveBeenCalledOnce();
    expect(firstWarning(warn).count).toBe(1);
  });

  it.each(fetchers)('$name never logs message text, names or profile values', async (f) => {
    const { logger, warn } = makeLogger();
    mocks[f.api].mockResolvedValue(f.page([f.leaky]));

    await settle(f.run(makeClient(logger)));

    expect(warn).toHaveBeenCalledOnce();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('TOP-SECRET');
  });

  it('lists each offending field once, using dotted paths for nested fields', async () => {
    const { logger, warn } = makeLogger();
    mocks.usersList.mockResolvedValue({
      members: [
        { id: 'U1', deleted: 'x', is_bot: 'y', profile: { display_name: 5, real_name: 6 } },
      ],
    });

    await settle(makeClient(logger).fetchUsers());

    const { fields } = firstWarning(warn).entries[0];
    expect([...fields].sort()).toEqual([
      'deleted',
      'is_bot',
      'profile.display_name',
      'profile.real_name',
    ]);
  });

  it('logs no id for entries that are not objects or have a non-string id, and caps long ids', async () => {
    const { logger, warn } = makeLogger();
    mocks.conversationsList.mockResolvedValue({
      channels: [null, 'channel', { id: 7 }, { id: 'C'.repeat(100) }],
    });

    await settle(makeClient(logger).fetchChannels());

    const { entries } = firstWarning(warn);
    expect(entries[0]).toEqual({ id: undefined, fields: ['(root)'] });
    expect(entries[1]).toEqual({ id: undefined, fields: ['(root)'] });
    expect(entries[2].id).toBeUndefined();
    expect(entries[3].id).toBe('C'.repeat(32));
  });

  // Each fetcher identifies entries by its own key (channels/users: id, messages: ts), so a stray
  // field of the other kind is never logged.
  it('identifies messages by ts and ignores a stray id field', async () => {
    const { logger, warn } = makeLogger();
    mocks.conversationsHistory.mockResolvedValue({
      messages: [{ id: 'STRAY-ID', type: 'message', ts: '1.0', text: 42 }],
    });

    await settle(makeClient(logger).fetchMessages('C1'));

    expect(firstWarning(warn).entries[0].id).toBe('1.0');
    expect(JSON.stringify(warn.mock.calls)).not.toContain('STRAY-ID');
  });

  it('does not warn when nothing failed the schema, including intentional filtering', async () => {
    const { logger, warn } = makeLogger();
    mocks.conversationsHistory.mockResolvedValue({
      messages: [
        { type: 'message', subtype: 'channel_join', ts: '1.0' },
        { type: 'message', ts: '2.0', user: null, text: null },
      ],
    });
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent' },
        { type: 'message', ts: '', text: 'empty ts' },
      ],
    });
    mocks.usersList.mockResolvedValue({
      members: [{ id: 'U1', is_bot: true }, { id: 'USLACKBOT' }, { id: 'U2', profile: null }],
    });

    await settle(makeClient(logger).fetchMessages('C1'));
    await settle(makeClient(logger).fetchThreadReplies('C1', '10.0'));
    await settle(makeClient(logger).fetchUsers());

    expect(warn).not.toHaveBeenCalled();
  });
});

// The null handling is built from .transform(), which would turn optional keys into required ones.
// Pin the element types that syncService.ts consumes so such a regression fails typecheck.
describe('element types', () => {
  it('stay unchanged', () => {
    expectTypeOf<SlackChannel>().toEqualTypeOf<{ id: string; name: string; is_private: boolean }>();
    expectTypeOf<SlackMessage>().toEqualTypeOf<{
      ts: string;
      type?: string | undefined;
      subtype?: string | undefined;
      user?: string | undefined;
      text: string;
      thread_ts?: string | undefined;
    }>();
    expectTypeOf<SlackUser>().toEqualTypeOf<{
      id: string;
      deleted: boolean;
      is_bot: boolean;
      is_app_user: boolean;
      profile?:
        | {
            display_name?: string | undefined;
            real_name?: string | undefined;
            image_72?: string | undefined;
          }
        | undefined;
    }>();
  });
});
