import { Hono } from 'hono';
import { createDb } from '../db/client';
import type { Logger } from '../lib/logger';
import type { User } from '../middleware/auth';
import { hasRole } from '../middleware/auth';
import { syncAll } from '../services/sync/syncService';

const router = new Hono<{ Bindings: Env; Variables: { user: User; logger: Logger } }>();

// POST /api/sync — manual sync trigger (admin or root only)
router.post('/', async (c) => {
  const currentUser = c.get('user');
  const logger = c.get('logger');
  if (!hasRole(currentUser, 'admin')) {
    return c.json({ status: 'error', message: 'Forbidden' }, 403);
  }

  logger.info('manual sync triggered');
  try {
    const db = createDb(c.env.DB);
    const result = await syncAll(c.env, db, logger);
    return c.json({ status: 'done', ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('manual sync failed', { error: msg });
    return c.json({ status: 'error', message: msg }, 500);
  }
});

export default router;
