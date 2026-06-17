import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../db/client';
import { channels, messages, slackUsers } from '../db/schema';
import type { Logger } from '../lib/logger';
import type { User } from '../middleware/auth';

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}

const router = new Hono<{ Bindings: Env; Variables: { user: User; logger: Logger } }>();

// GET /api/search?q=...&limit=20&offset=0
router.get('/', async (c) => {
  const q = c.req.query('q') ?? '';
  const limitParam = c.req.query('limit');
  const offsetParam = c.req.query('offset');

  const rawLimit = limitParam !== undefined ? Number.parseInt(limitParam, 10) : 20;
  const limit = Number.isNaN(rawLimit) ? 20 : Math.min(rawLimit, 100);

  const rawOffset = offsetParam !== undefined ? Number.parseInt(offsetParam, 10) : 0;
  const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : rawOffset;

  if (q.trim() === '') {
    return c.json({ results: [], hasMore: false });
  }

  try {
    const db = createDb(c.env.DB);

    const rows = await db
      .select({
        id: messages.id,
        slackTs: messages.slackTs,
        text: messages.text,
        threadTs: messages.threadTs,
        channelId: channels.id,
        channelName: channels.name,
        userSlackId: messages.userSlackId,
        slackUserId: slackUsers.slackUserId,
        displayName: slackUsers.displayName,
        avatarUrl: slackUsers.avatarUrl,
      })
      .from(messages)
      .innerJoin(channels, eq(messages.channelId, channels.id))
      .leftJoin(slackUsers, eq(messages.userSlackId, slackUsers.slackUserId))
      .where(sql`${messages.text} LIKE ${`%${escapeLike(q)}%`} ESCAPE '\\'`)
      .orderBy(desc(messages.slackTs))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;

    const results = pageRows.map((r) => ({
      id: r.id,
      slackTs: r.slackTs,
      text: r.text,
      threadTs: r.threadTs,
      channel: {
        id: r.channelId,
        name: r.channelName,
      },
      user: {
        slackUserId: r.slackUserId ?? r.userSlackId ?? '',
        displayName: r.displayName ?? 'Unknown',
        avatarUrl: r.avatarUrl ?? null,
      },
    }));

    return c.json({ results, hasMore });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ status: 'error', message: msg }, 500);
  }
});

export default router;
