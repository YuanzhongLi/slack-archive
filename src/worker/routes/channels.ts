import { and, asc, count, desc, eq, inArray, lt } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../db/client';
import { channels, messages, slackUsers, threads } from '../db/schema';
import { cutoffIso } from '../lib/archive';
import type { Logger } from '../lib/logger';
import type { User } from '../middleware/auth';

const router = new Hono<{ Bindings: Env; Variables: { user: User; logger: Logger } }>();

// GET /api/channels — list all channels ordered by name
router.get('/', async (c) => {
  try {
    const db = createDb(c.env.DB);
    const rows = await db
      .select({
        id: channels.id,
        slackChannelId: channels.slackChannelId,
        name: channels.name,
      })
      .from(channels)
      .orderBy(asc(channels.name));
    return c.json(rows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ status: 'error', message: msg }, 500);
  }
});

// GET /api/channels/:id/messages — paginated messages with user info
router.get('/:id/messages', async (c) => {
  const channelId = c.req.param('id');
  const limitParam = c.req.query('limit');
  const before = c.req.query('before');

  const rawLimit = limitParam !== undefined ? Number.parseInt(limitParam, 10) : 50;
  const limit = Number.isNaN(rawLimit) ? 50 : Math.min(rawLimit, 100);

  try {
    const db = createDb(c.env.DB);
    const cutoff = cutoffIso();

    // Build where conditions
    const conditions = [eq(messages.channelId, channelId)];
    if (before !== undefined) {
      conditions.push(lt(messages.slackTs, before));
    }

    // Fetch messages with left join on slackUsers
    const rows = await db
      .select({
        id: messages.id,
        slackTs: messages.slackTs,
        text: messages.text,
        threadTs: messages.threadTs,
        createdAt: messages.createdAt,
        userSlackId: messages.userSlackId,
        slackUserId: slackUsers.slackUserId,
        displayName: slackUsers.displayName,
        avatarUrl: slackUsers.avatarUrl,
      })
      .from(messages)
      .leftJoin(slackUsers, eq(messages.userSlackId, slackUsers.slackUserId))
      .where(and(...conditions))
      .orderBy(desc(messages.slackTs))
      .limit(limit + 1); // fetch one extra to determine hasMore

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    // Collect distinct parentTs values for reply count batch query
    const parentTsValues = pageRows.map((r) => r.slackTs).filter((ts): ts is string => ts !== null);

    // Fetch reply counts for all messages in this page
    const replyCounts = new Map<string, number>();
    if (parentTsValues.length > 0) {
      const countRows = await db
        .select({
          parentTs: threads.parentTs,
          replyCount: count(threads.id),
        })
        .from(threads)
        .where(and(eq(threads.channelId, channelId), inArray(threads.parentTs, parentTsValues)))
        .groupBy(threads.parentTs);

      for (const row of countRows) {
        replyCounts.set(row.parentTs, row.replyCount);
      }
    }

    const result = pageRows.map((r) => ({
      id: r.id,
      slackTs: r.slackTs,
      text: r.text,
      threadTs: r.threadTs,
      replyCount: replyCounts.get(r.slackTs) ?? 0,
      isDeletable: r.createdAt < cutoff,
      user: {
        slackUserId: r.slackUserId ?? r.userSlackId ?? '',
        displayName: r.displayName ?? 'Unknown',
        avatarUrl: r.avatarUrl ?? null,
      },
    }));

    return c.json({ messages: result, hasMore });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ status: 'error', message: msg }, 500);
  }
});

// GET /api/channels/:id/messages/:ts/threads — thread replies for a message
router.get('/:id/messages/:ts/threads', async (c) => {
  const channelId = c.req.param('id');
  const parentTs = c.req.param('ts');

  try {
    const db = createDb(c.env.DB);

    const threadCutoff = cutoffIso();

    const rows = await db
      .select({
        id: threads.id,
        slackTs: threads.slackTs,
        text: threads.text,
        createdAt: threads.createdAt,
        userSlackId: threads.userSlackId,
        slackUserId: slackUsers.slackUserId,
        displayName: slackUsers.displayName,
        avatarUrl: slackUsers.avatarUrl,
      })
      .from(threads)
      .leftJoin(slackUsers, eq(threads.userSlackId, slackUsers.slackUserId))
      .where(and(eq(threads.channelId, channelId), eq(threads.parentTs, parentTs)))
      .orderBy(asc(threads.slackTs));

    const result = rows.map((r) => ({
      id: r.id,
      slackTs: r.slackTs,
      text: r.text,
      isDeletable: r.createdAt < threadCutoff,
      user: {
        slackUserId: r.slackUserId ?? r.userSlackId ?? '',
        displayName: r.displayName ?? 'Unknown',
        avatarUrl: r.avatarUrl ?? null,
      },
    }));

    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ status: 'error', message: msg }, 500);
  }
});

export default router;
