import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { createSlackClient } from './client';

// Each page request of a fetch* function is preceded by a sleep, so timers are faked and flushed
// explicitly. Racing the promise against the timer flush keeps a rejection from going unhandled.
async function settle<T>(promise: Promise<T>): Promise<T> {
  const [result] = await Promise.all([promise, vi.runAllTimersAsync()]);
  return result;
}

const makeClient = () => createSlackClient('xoxb-test-token');

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
    createSlackClient('xoxb-secret-token');
    expect(mocks.webClientCtor).toHaveBeenCalledExactlyOnceWith('xoxb-secret-token');
  });
});

describe('rate-limit pause', () => {
  // The exact sleep length is deliberately not pinned (the code uses 200ms while
  // .claude/rules/slack-api.md mentions 1s). What matters is that every page request is preceded
  // by a pause that is neither missing nor excessive.
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

  // Current behavior, not an endorsed spec: optional fields accept undefined but not null, so an
  // explicit null drops the whole channel. Accepting null would be a deliberate change (use
  // .nullish() and update this test).
  it('drops a channel whose optional field is null', async () => {
    mocks.conversationsList.mockResolvedValue({
      channels: [
        { id: 'C1', name: 'null-flag', is_private: null },
        { id: 'C2', name: 'ok' },
      ],
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

  // Current behavior, not an endorsed spec: optional fields accept undefined but not null, so a
  // message carrying an explicit null in any of them is dropped as a whole (it would silently be
  // missing from the archive). Accepting null would be a deliberate change (use .nullish() and
  // update this test).
  it.each([
    'user',
    'text',
    'thread_ts',
    'subtype',
  ])('drops a message whose optional field %s is null', async (field) => {
    mocks.conversationsHistory.mockResolvedValue({
      messages: [
        { type: 'message', ts: '1.0', user: 'U1', text: 'ok', [field]: null },
        { type: 'message', ts: '2.0', user: 'U1', text: 'ok' },
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

  // Current behavior, not an endorsed spec: optional fields accept undefined but not null, so a
  // reply carrying an explicit null in any of them is dropped as a whole. Accepting null would be
  // a deliberate change (use .nullish() and update this test).
  it.each([
    'type',
    'subtype',
    'user',
    'text',
    'thread_ts',
  ])('drops a reply whose optional field %s is null', async (field) => {
    mocks.conversationsReplies.mockResolvedValue({
      messages: [
        { type: 'message', ts: '10.0', text: 'parent' },
        { type: 'message', ts: '10.1', user: 'U1', text: 'ok', [field]: null },
        { type: 'message', ts: '10.2', user: 'U1', text: 'ok' },
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

  // Current behavior, not an endorsed spec: optional fields accept undefined but not null, so a
  // user carrying an explicit null in any of them is dropped as a whole (including the flags,
  // because .default(false) only fills in undefined). Accepting null would be a deliberate change
  // (use .nullish() and update this test).
  it.each([
    ['deleted', { deleted: null }],
    ['is_bot', { is_bot: null }],
    ['is_app_user', { is_app_user: null }],
    ['profile', { profile: null }],
    ['profile.display_name', { profile: { display_name: null } }],
    ['profile.real_name', { profile: { real_name: null } }],
    ['profile.image_72', { profile: { image_72: null } }],
  ])('drops a user whose optional field %s is null', async (_field, override) => {
    mocks.usersList.mockResolvedValue({
      members: [{ id: 'U1', ...override }, { id: 'U2' }],
    });

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
