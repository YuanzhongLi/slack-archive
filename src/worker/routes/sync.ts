import { desc } from 'drizzle-orm';
import { Hono } from 'hono';
import { createDb } from '../db/client';
import { syncLogs } from '../db/schema';
import type { Logger } from '../lib/logger';
import type { User } from '../middleware/auth';
import { hasRole } from '../middleware/auth';
import { syncAll } from '../services/sync/syncService';

const router = new Hono<{ Bindings: Env; Variables: { user: User; logger: Logger } }>();

// GET /api/sync — list recent sync logs (admin or root only)
router.get('/', async (c) => {
  const currentUser = c.get('user');
  if (!hasRole(currentUser, 'admin')) {
    return c.json({ status: 'error', message: 'Forbidden' }, 403);
  }
  const db = createDb(c.env.DB);
  const logs = await db.select().from(syncLogs).orderBy(desc(syncLogs.startedAt)).limit(20).all();
  return c.json({ logs });
});

// POST /api/sync — manual sync trigger (admin or root only)
router.post('/', async (c) => {
  const currentUser = c.get('user');
  const logger = c.get('logger');
  if (!hasRole(currentUser, 'admin')) {
    return c.json({ status: 'error', message: 'Forbidden' }, 403);
  }

  logger.info('manual sync triggered');
  const db = createDb(c.env.DB);
  const startedAt = new Date().toISOString();
  const id = crypto.randomUUID();
  try {
    const result = await syncAll(c.env, db, logger);
    await db.insert(syncLogs).values({
      id,
      triggeredBy: 'manual',
      userEmail: currentUser.email,
      channelCount: result.channelCount,
      messageCount: result.messageCount,
      status: 'success',
      startedAt,
      completedAt: new Date().toISOString(),
    });
    return c.json({ status: 'done', logId: id, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('manual sync failed', { error: msg });
    await db.insert(syncLogs).values({
      id,
      triggeredBy: 'manual',
      userEmail: currentUser.email,
      status: 'error',
      errorMessage: msg,
      startedAt,
      completedAt: new Date().toISOString(),
    });
    return c.json({ status: 'error', message: msg }, 500);
  }
});

export default router;
