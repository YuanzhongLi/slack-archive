import { app } from './worker/app';
import { createDb } from './worker/db/client';
import { createLogger } from './worker/lib/logger';
import { syncAll } from './worker/services/sync/syncService';

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const pretty = Boolean(env.DEV_USER_EMAIL) && !env.CF_ACCESS_TEAM_DOMAIN;
    const logger = createLogger({ trigger: 'cron' }, { pretty });
    const db = createDb(env.DB);
    ctx.waitUntil(
      syncAll(env, db, logger).catch((err) => {
        logger.error('scheduled syncAll failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      }),
    );
  },
};
