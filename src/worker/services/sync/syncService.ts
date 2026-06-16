import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { Db } from '../../db/client';
import { channels, messages, slackUsers, threads } from '../../db/schema';
import { type SlackClient, createSlackClient } from '../slack/client';

function generateId(): string {
  return crypto.randomUUID();
}

export async function syncChannels(db: Db, client: SlackClient): Promise<void> {
  const slackChannels = await client.fetchChannels();

  for (const ch of slackChannels) {
    await db
      .insert(channels)
      .values({
        id: generateId(),
        slackChannelId: ch.id,
        name: ch.name,
        isPrivate: ch.is_private,
        lastSyncedAt: null,
      })
      .onConflictDoUpdate({
        target: channels.slackChannelId,
        set: { name: ch.name, isPrivate: ch.is_private },
      });
  }
}

export async function syncUsers(db: Db, client: SlackClient): Promise<void> {
  const slackUserList = await client.fetchUsers();

  for (const u of slackUserList) {
    const displayName = u.profile?.display_name || u.profile?.real_name || u.id;
    await db
      .insert(slackUsers)
      .values({
        id: generateId(),
        slackUserId: u.id,
        displayName,
        realName: u.profile?.real_name ?? null,
        avatarUrl: u.profile?.image_72 ?? null,
      })
      .onConflictDoUpdate({
        target: slackUsers.slackUserId,
        set: {
          displayName,
          realName: u.profile?.real_name ?? null,
          avatarUrl: u.profile?.image_72 ?? null,
        },
      });
  }
}

export async function syncMessagesForChannel(
  db: Db,
  client: SlackClient,
  channelRow: { id: string; slackChannelId: string; lastSyncedAt: string | null },
): Promise<string[]> {
  // Join the channel first — conversations.history requires the bot to be a member
  await client.joinChannel(channelRow.slackChannelId);

  const oldest = channelRow.lastSyncedAt
    ? // Subtract 1s to avoid missing messages at the exact sync boundary.
      // Slack's `oldest` is exclusive; onConflictDoUpdate handles any duplicates.
      String(Math.floor(new Date(channelRow.lastSyncedAt).getTime() / 1000) - 1)
    : undefined;

  const slackMessages = await client.fetchMessages(channelRow.slackChannelId, oldest);
  const threadParentTsList: string[] = [];

  for (const msg of slackMessages) {
    await db
      .insert(messages)
      .values({
        id: generateId(),
        slackTs: msg.ts,
        channelId: channelRow.id,
        userSlackId: msg.user ?? null,
        text: msg.text ?? '',
        threadTs: msg.thread_ts ?? null,
        createdAt: new Date(Number(msg.ts) * 1000).toISOString(),
      })
      .onConflictDoUpdate({
        target: [messages.channelId, messages.slackTs],
        set: { text: msg.text ?? '', threadTs: msg.thread_ts ?? null },
      });

    // Collect thread parents (thread_ts === ts means this is a parent message)
    if (msg.thread_ts && msg.thread_ts === msg.ts) {
      threadParentTsList.push(msg.ts);
    }
  }

  // Update last_synced_at after successful message sync
  await db
    .update(channels)
    .set({ lastSyncedAt: new Date().toISOString() })
    .where(eq(channels.id, channelRow.id));

  return threadParentTsList;
}

async function syncRepliesForParent(
  db: Db,
  client: SlackClient,
  channelRow: { id: string; slackChannelId: string },
  parentTs: string,
  oldest?: string,
): Promise<void> {
  const replies = await client.fetchThreadReplies(channelRow.slackChannelId, parentTs, oldest);

  for (const reply of replies) {
    await db
      .insert(threads)
      .values({
        id: generateId(),
        parentTs,
        channelId: channelRow.id,
        userSlackId: reply.user ?? null,
        text: reply.text ?? '',
        slackTs: reply.ts,
        createdAt: new Date(Number(reply.ts) * 1000).toISOString(),
      })
      .onConflictDoUpdate({
        target: [threads.channelId, threads.slackTs],
        set: { text: reply.text ?? '' },
      });
  }

  // Update replies_last_synced_at on the parent message
  await db
    .update(messages)
    .set({ repliesLastSyncedAt: new Date().toISOString() })
    .where(and(eq(messages.channelId, channelRow.id), eq(messages.slackTs, parentTs)));
}

export async function syncThreadsForChannel(
  db: Db,
  client: SlackClient,
  channelRow: { id: string; slackChannelId: string },
  parentTsList: string[],
): Promise<void> {
  for (const parentTs of parentTsList) {
    // New thread parents: fetch all replies (no oldest filter)
    await syncRepliesForParent(db, client, channelRow, parentTs);
  }
}

export async function syncExistingThreadsForChannel(
  db: Db,
  client: SlackClient,
  channelRow: { id: string; slackChannelId: string },
): Promise<void> {
  // Find thread parents already in D1 that were synced before
  const existingParents = await db
    .select({ slackTs: messages.slackTs, repliesLastSyncedAt: messages.repliesLastSyncedAt })
    .from(messages)
    .where(and(eq(messages.channelId, channelRow.id), isNotNull(messages.repliesLastSyncedAt)))
    .all();

  for (const parent of existingParents) {
    const oldest = parent.repliesLastSyncedAt
      ? String(Math.floor(new Date(parent.repliesLastSyncedAt).getTime() / 1000))
      : undefined;
    await syncRepliesForParent(db, client, channelRow, parent.slackTs, oldest);
  }
}

export async function syncAll(
  env: Env,
  db: Db,
): Promise<{ channelCount: number; messageCount: number }> {
  if (!env.SLACK_BOT_TOKEN) {
    throw new Error('SLACK_BOT_TOKEN is not configured');
  }
  const client = createSlackClient(env.SLACK_BOT_TOKEN);

  // 1. Sync channels
  await syncChannels(db, client);

  // 2. Sync users
  await syncUsers(db, client);

  // 3. Sync messages + threads per channel
  const allChannels = await db.select().from(channels).all();
  let messageCount = 0;

  for (const ch of allChannels) {
    // Sync new messages (diff by last_synced_at) + collect new thread parents
    const newParentTsList = await syncMessagesForChannel(db, client, ch);
    messageCount +=
      (
        await db
          .select({ count: sql<number>`count(*)` })
          .from(messages)
          .where(eq(messages.channelId, ch.id))
          .get()
      )?.count ?? 0;

    // Sync replies for new thread parents (full fetch)
    if (newParentTsList.length > 0) {
      await syncThreadsForChannel(db, client, ch, newParentTsList);
    }

    // Sync replies for existing thread parents (diff by replies_last_synced_at)
    await syncExistingThreadsForChannel(db, client, ch);
  }

  return { channelCount: allChannels.length, messageCount };
}
