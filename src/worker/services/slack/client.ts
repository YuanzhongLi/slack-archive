import { WebClient } from '@slack/web-api';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Response schemas — parse only the fields we actually use
// ---------------------------------------------------------------------------

const slackChannelSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_private: z.boolean().optional().default(false),
});

const slackMessageSchema = z.object({
  ts: z.string(),
  type: z.string().optional(),
  subtype: z.string().optional(),
  user: z.string().optional(),
  text: z.string().optional().default(''),
  thread_ts: z.string().optional(),
});

const slackUserSchema = z.object({
  id: z.string(),
  deleted: z.boolean().optional().default(false),
  is_bot: z.boolean().optional().default(false),
  is_app_user: z.boolean().optional().default(false),
  profile: z
    .object({
      display_name: z.string().optional(),
      real_name: z.string().optional(),
      image_72: z.string().optional(),
    })
    .optional(),
});

// Infer types from schemas — single source of truth
export type SlackChannel = z.infer<typeof slackChannelSchema>;
export type SlackMessage = z.infer<typeof slackMessageSchema>;
export type SlackUser = z.infer<typeof slackUserSchema>;

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

export function createSlackClient(token: string) {
  // Rely on @slack/web-api's built-in retry (tenRetriesInAboutThirtyMinutes by default)
  // which handles Retry-After headers from Slack's rate limit responses correctly.
  const client = new WebClient(token);

  async function fetchChannels(): Promise<SlackChannel[]> {
    const results: SlackChannel[] = [];
    let cursor: string | undefined;

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
      }

      cursor = res.response_metadata?.next_cursor ?? undefined;
    } while (cursor);

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
    let cursor: string | undefined;

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
        if (parsed.success && parsed.data.type === 'message' && !parsed.data.subtype) {
          results.push(parsed.data);
        }
      }

      cursor = res.response_metadata?.next_cursor ?? undefined;
    } while (cursor);

    return results;
  }

  async function fetchThreadReplies(
    channelId: string,
    threadTs: string,
    oldest?: string,
  ): Promise<SlackMessage[]> {
    const results: SlackMessage[] = [];
    let cursor: string | undefined;

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
        if (parsed.success && parsed.data.ts) results.push(parsed.data);
      }

      cursor = res.response_metadata?.next_cursor ?? undefined;
    } while (cursor);

    return results;
  }

  async function fetchUsers(): Promise<SlackUser[]> {
    const results: SlackUser[] = [];
    let cursor: string | undefined;

    do {
      await sleep(SLEEP_MS);
      const res = await client.users.list({ limit: 200, cursor });

      for (const raw of res.members ?? []) {
        const parsed = slackUserSchema.safeParse(raw);
        if (
          parsed.success &&
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

    return results;
  }

  return { fetchChannels, joinChannel, fetchMessages, fetchThreadReplies, fetchUsers };
}

export type SlackClient = ReturnType<typeof createSlackClient>;
