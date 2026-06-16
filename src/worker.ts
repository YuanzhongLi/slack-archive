import { app } from './worker/app';
import { createDb } from './worker/db/client';
import { syncLogs } from './worker/db/schema';
import { createLogger } from './worker/lib/logger';
import { fullResyncAll, syncAll } from './worker/services/sync/syncService';

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const pretty = Boolean(env.DEV_USER_EMAIL) && !env.CF_ACCESS_TEAM_DOMAIN;
    const logger = createLogger({ trigger: 'cron' }, { pretty });
    const db = createDb(env.DB);
    ctx.waitUntil(
      (async () => {
        const startedAt = new Date().toISOString();
        const id = crypto.randomUUID();
        try {
          const result = await syncAll(env, db, logger);
          await fullResyncAll(env, db, logger);
          await db.insert(syncLogs).values({
            id,
            triggeredBy: 'cron',
            channelCount: result.channelCount,
            messageCount: result.messageCount,
            status: 'success',
            startedAt,
            completedAt: new Date().toISOString(),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error('scheduled sync failed', { error: msg });
          await db.insert(syncLogs).values({
            id,
            triggeredBy: 'cron',
            status: 'error',
            errorMessage: msg,
            startedAt,
            completedAt: new Date().toISOString(),
          });
        }
      })(),
    );
  },
};
