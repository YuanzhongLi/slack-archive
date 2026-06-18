import { app } from './worker/app';
import { createDb } from './worker/db/client';
import { syncLogs } from './worker/db/schema';
import { createLogger } from './worker/lib/logger';
import { type AlarmPayload, sendAlarm } from './worker/services/alarm/slackWebhook';
import { fullResyncAll, syncAll } from './worker/services/sync/syncService';

async function notifyAlarm(
  env: Env,
  payload: AlarmPayload,
  logger: ReturnType<typeof createLogger>,
): Promise<void> {
  if (!env.SLACK_ALARM_WEBHOOK_URL) {
    logger.info('SLACK_ALARM_WEBHOOK_URL not set, skipping alarm notification', {
      title: payload.title,
    });
    return;
  }
  try {
    await sendAlarm(env.SLACK_ALARM_WEBHOOK_URL, payload);
  } catch (e) {
    logger.error('failed to send alarm notification', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

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

          // Check D1 database size against threshold (free tier limit: 500 MB per DB)
          const thresholdMb = Number(env.D1_ALARM_SIZE_THRESHOLD_MB) || 400;
          const sizeResult = await env.DB.prepare(
            'SELECT page_count * page_size as size_bytes FROM pragma_page_count(), pragma_page_size()',
          ).first<{ size_bytes: number }>();
          const sizeMb = sizeResult ? sizeResult.size_bytes / (1024 * 1024) : 0;
          if (sizeMb >= thresholdMb) {
            await notifyAlarm(
              env,
              {
                level: 'warn',
                title: 'D1 database size approaching limit',
                message: `Database size (${sizeMb.toFixed(1)} MB) has reached the alarm threshold (${thresholdMb} MB). D1 free tier limit is 500 MB per database.`,
                fields: {
                  'DB size': `${sizeMb.toFixed(1)} MB`,
                  Threshold: `${thresholdMb} MB`,
                  'D1 free tier limit': '500 MB',
                },
              },
              logger,
            );
          }
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
          await notifyAlarm(
            env,
            {
              level: 'error',
              title: 'Cron sync failed',
              message: msg,
              fields: { 'Started at': startedAt },
            },
            logger,
          );
        }
      })(),
    );
  },
};
