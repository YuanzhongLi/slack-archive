import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../db/client';
import { type User, channels, messages, threads } from '../db/schema';
import { cutoffIso } from '../lib/archive';
import { hasRole } from '../middleware/auth';

const router = new Hono<{ Bindings: Env; Variables: { user: User } }>();

// DELETE /api/archive/messages/:messageId
router.delete('/messages/:messageId', async (c) => {
  const currentUser = c.get('user');
  if (!hasRole(currentUser, 'admin')) {
    return c.json({ status: 'error', message: 'Forbidden' }, 403);
  }

  const messageId = c.req.param('messageId');
  const db = createDb(c.env.DB);
  const cutoff = cutoffIso();

  try {
    const message = await db.select().from(messages).where(eq(messages.id, messageId)).get();
    if (!message) {
      return c.json({ status: 'error', message: 'Message not found' }, 404);
    }
    if (message.createdAt >= cutoff) {
      return c.json({ status: 'error', message: 'Message is too recent to delete' }, 403);
    }

    // Delete thread replies first (foreign key: threads.channelId → channels)
    if (message.threadTs === message.slackTs) {
      await db
        .delete(threads)
        .where(
          and(eq(threads.channelId, message.channelId), eq(threads.parentTs, message.slackTs)),
        );
    }
    await db.delete(messages).where(eq(messages.id, messageId));

    return c.json({ status: 'done' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ status: 'error', message: msg }, 500);
  }
});

// DELETE /api/archive/threads/:threadId
router.delete('/threads/:threadId', async (c) => {
  const currentUser = c.get('user');
  if (!hasRole(currentUser, 'admin')) {
    return c.json({ status: 'error', message: 'Forbidden' }, 403);
  }

  const threadId = c.req.param('threadId');
  const db = createDb(c.env.DB);
  const cutoff = cutoffIso();

  try {
    const thread = await db.select().from(threads).where(eq(threads.id, threadId)).get();
    if (!thread) {
      return c.json({ status: 'error', message: 'Thread reply not found' }, 404);
    }
    if (thread.createdAt >= cutoff) {
      return c.json({ status: 'error', message: 'Thread reply is too recent to delete' }, 403);
    }

    await db.delete(threads).where(eq(threads.id, threadId));
    return c.json({ status: 'done' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ status: 'error', message: msg }, 500);
  }
});

// DELETE /api/archive/channels/:channelId
router.delete('/channels/:channelId', async (c) => {
  const currentUser = c.get('user');
  if (!hasRole(currentUser, 'admin')) {
    return c.json({ status: 'error', message: 'Forbidden' }, 403);
  }

  const channelId = c.req.param('channelId');
  const db = createDb(c.env.DB);

  try {
    const channel = await db.select().from(channels).where(eq(channels.id, channelId)).get();
    if (!channel) {
      return c.json({ status: 'error', message: 'Channel not found' }, 404);
    }

    await db.delete(threads).where(eq(threads.channelId, channelId));
    await db.delete(messages).where(eq(messages.channelId, channelId));
    await db.delete(channels).where(eq(channels.id, channelId));

    return c.json({ status: 'done' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ status: 'error', message: msg }, 500);
  }
});

export default router;
