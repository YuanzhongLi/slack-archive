import { WebClient } from '@slack/web-api';
import { z } from 'zod';
import type { Logger } from '../../lib/logger';

// ---------------------------------------------------------------------------
// Response schemas — parse only the fields we actually use
// ---------------------------------------------------------------------------

// Slack may send an explicit null for an optional field. Treat it like a missing field so the whole
// element is not dropped. Output types stay identical to the previous .optional() and
// .optional().default(x) (zod's .default() only fills in undefined, never null). The trailing
// .optional() keeps the object key itself optional, which .transform() would otherwise make required.
const nullishAsUndefined = <T extends z.ZodType>(schema: T) =>
  schema
    .nullish()
    .transform((value) => value ?? undefined)
    .optional();
const nullishWithDefault = <T extends z.ZodType>(schema: T, fallback: z.output<T>) =>
  schema.nullish().transform((value) => value ?? fallback);

const slackChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_private: nullishWithDefault(z.boolean(), false),
});

const slackMessageSchema = z.object({
  ts: z.string(),
  type: nullishAsUndefined(z.string()),
  subtype: nullishAsUndefined(z.string()),
  user: nullishAsUndefined(z.string()),
  text: nullishWithDefault(z.string(), ''),
  thread_ts: nullishAsUndefined(z.string()),
});

const slackUserSchema = z.object({
  id: z.string(),
  deleted: nullishWithDefault(z.boolean(), false),
  is_bot: nullishWithDefault(z.boolean(), false),
  is_app_user: nullishWithDefault(z.boolean(), false),
  profile: nullishAsUndefined(
    z.object({
      display_name: nullishAsUndefined(z.string()),
      real_name: nullishAsUndefined(z.string()),
      image_72: nullishAsUndefined(z.string()),
    }),
  ),
});

// Infer types from schemas — single source of truth
export type SlackChannel = z.infer<typeof slackChannelSchema>;
export type SlackMessage = z.infer<typeof slackMessageSchema>;
export type SlackUser = z.infer<typeof slackUserSchema>;

// ---------------------------------------------------------------------------
// Dropped-entry reporting
// ---------------------------------------------------------------------------

// Entries that fail schema validation are skipped. Report them once per fetch so a data gap in the
// archive is visible. Only the entry id/ts and the names of the offending fields are logged, never
// message text, user names or profile values (Workers Logs are retained and widely readable).
const MAX_LOGGED_DROPS = 20;
const MAX_LOGGED_ID_LENGTH = 32;

// Channels and users are identified by `id`, messages by `ts`. The key is passed explicitly so a
// stray field of the other kind in a payload is never picked up (and logged) by accident.
function identify(raw: unknown, key: 'id' | 'ts'): string | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(raw));
  const id = record[key];
  return typeof id === 'string' ? id.slice(0, MAX_LOGGED_ID_LENGTH) : undefined;
}

// `where` locates the fetch in Slack (channel id, parent ts). ts values are only unique per channel,
// so without it a logged ts cannot be traced back. None of it is message content.
function createDropReporter(
  logger: Logger,
  fn: string,
  idKey: 'id' | 'ts',
  where: Record<string, string> = {},
) {
  const entries: { id: string | undefined; fields: string[] }[] = [];
  let count = 0;

  return {
    record(raw: unknown, error: z.ZodError): void {
      count += 1;
      if (entries.length >= MAX_LOGGED_DROPS) return;
      const fields = new Set(
        error.issues.map((issue) => issue.path.map(String).join('.') || '(root)'),
      );
      entries.push({ id: identify(raw, idKey), fields: [...fields] });
    },
    flush(): void {
      if (count === 0) return;
      logger.warn('dropped Slack entries that did not match the expected schema', {
        fn,
        ...where,
        count,
        entries,
        truncated: count > entries.length,
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Rate limit helpers
// ---------------------------------------------------------------------------

// 200ms sleep between API calls to stay within Slack's rate limits (Tier 3: 50+ RPM)
const SLEEP_MS = 200;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Client factory
// ---------------------------------------------------------------------------

// `logger` is required on purpose: an optional one would let a caller silently go back to dropping
// entries without a trace.
export function createSlackClient(token: string, logger: Logger) {
  // Rely on @slack/web-api's built-in retry (tenRetriesInAboutThirtyMinutes by default)
  // which handles Retry-After headers from Slack's rate limit responses correctly.
  const client = new WebClient(token);

  async function fetchChannels(): Promise<SlackChannel[]> {
    const results: SlackChannel[] = [];
    const dropped = createDropReporter(logger, 'fetchChannels', 'id');
    let cursor: string | undefined;

    try {
      do {
        await sleep(SLEEP_MS);
        const res = await client.conversations.list({
          types: 'public_channel',
          exclude_archived: true,
          limit: 200,
          cursor,
        });

        for (const raw of res.channels ?? []) {
          const parsed = slackChannelSchema.safeParse(raw);
          if (parsed.success) results.push(parsed.data);
          else dropped.record(raw, parsed.error);
        }

        cursor = res.response_metadata?.next_cursor ?? undefined;
      } while (cursor);
    } finally {
      // Also report on failure: the drops seen before an error are exactly what a debugger needs.
      dropped.flush();
    }

    return results;
  }

  async function joinChannel(channelId: string): Promise<void> {
    await client.conversations.join({ channel: channelId });
  }

  async function fetchMessages(
    channelId: string,
    oldest?: string,
    latest?: string,
  ): Promise<SlackMessage[]> {
    const results: SlackMessage[] = [];
    const dropped = createDropReporter(logger, 'fetchMessages', 'ts', { channel: channelId });
    let cursor: string | undefined;

    try {
      do {
        await sleep(SLEEP_MS);
        const res = await client.conversations.history({
          channel: channelId,
          limit: 200,
          oldest,
          latest,
          cursor,
        });

        for (const raw of res.messages ?? []) {
          const parsed = slackMessageSchema.safeParse(raw);
          if (!parsed.success) {
            dropped.record(raw, parsed.error);
          } else if (parsed.data.type === 'message' && !parsed.data.subtype) {
            results.push(parsed.data);
          }
        }

        cursor = res.response_metadata?.next_cursor ?? undefined;
      } while (cursor);
    } finally {
      // Also report on failure: the drops seen before an error are exactly what a debugger needs.
      dropped.flush();
    }

    return results;
  }

  async function fetchThreadReplies(
    channelId: string,
    threadTs: string,
    oldest?: string,
  ): Promise<SlackMessage[]> {
    const results: SlackMessage[] = [];
    const dropped = createDropReporter(logger, 'fetchThreadReplies', 'ts', {
      channel: channelId,
      thread_ts: threadTs,
    });
    let cursor: string | undefined;

    try {
      do {
        await sleep(SLEEP_MS);
        const res = await client.conversations.replies({
          channel: channelId,
          ts: threadTs,
          limit: 200,
          oldest,
          cursor,
        });

        const messages = res.messages ?? [];
        // First message is the parent — skip it
        for (const raw of messages.slice(1)) {
          const parsed = slackMessageSchema.safeParse(raw);
          if (!parsed.success) dropped.record(raw, parsed.error);
          else if (parsed.data.ts) results.push(parsed.data);
        }

        cursor = res.response_metadata?.next_cursor ?? undefined;
      } while (cursor);
    } finally {
      // Also report on failure: the drops seen before an error are exactly what a debugger needs.
      dropped.flush();
    }

    return results;
  }

  async function fetchUsers(): Promise<SlackUser[]> {
    const results: SlackUser[] = [];
    const dropped = createDropReporter(logger, 'fetchUsers', 'id');
    let cursor: string | undefined;

    try {
      do {
        await sleep(SLEEP_MS);
        const res = await client.users.list({ limit: 200, cursor });

        for (const raw of res.members ?? []) {
          const parsed = slackUserSchema.safeParse(raw);
          if (!parsed.success) {
            dropped.record(raw, parsed.error);
          } else if (
            !parsed.data.deleted &&
            !parsed.data.is_bot &&
            !parsed.data.is_app_user &&
            parsed.data.id !== 'USLACKBOT'
          ) {
            results.push(parsed.data);
          }
        }

        cursor = res.response_metadata?.next_cursor ?? undefined;
      } while (cursor);
    } finally {
      // Also report on failure: the drops seen before an error are exactly what a debugger needs.
      dropped.flush();
    }

    return results;
  }

  return { fetchChannels, joinChannel, fetchMessages, fetchThreadReplies, fetchUsers };
}

export type SlackClient = ReturnType<typeof createSlackClient>;
