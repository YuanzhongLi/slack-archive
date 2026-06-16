import { app } from './worker/app';
import { createDb } from './worker/db/client';
import { syncAll } from './worker/services/sync/syncService';

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const db = createDb(env.DB);
    ctx.waitUntil(
      syncAll(env, db).catch((err) => {
        console.error('[scheduled] syncAll failed:', err);
      }),
    );
  },
};
