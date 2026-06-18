import { createDb } from './db/client';
import { syncLogs } from './db/schema';
import { createLogger } from './lib/logger';
import { getD1SizeMb } from './services/alarm/d1SizeCheck';
import { type AlarmPayload, sendAlarm } from './services/alarm/slackWebhook';
import { fullResyncAll, syncAll } from './services/sync/syncService';

export async function notifyAlarm(
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

export async function runScheduled(env: Env): Promise<void> {
  const pretty = Boolean(env.DEV_USER_EMAIL) && !env.CF_ACCESS_TEAM_DOMAIN;
  const logger = createLogger({ trigger: 'cron' }, { pretty });
  const db = createDb(env.DB);
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

    // Check D1 database size. Run in a separate try/catch so failures do not affect sync status.
    try {
      const raw = Number(env.D1_ALARM_SIZE_THRESHOLD_MB);
      const thresholdMb = Number.isNaN(raw) ? 400 : raw;
      const sizeMb = await getD1SizeMb(env.DB);
      const sizeFields = {
        'DB size': `${sizeMb.toFixed(1)} MB`,
        Threshold: `${thresholdMb} MB`,
        'D1 free tier limit': '500 MB',
      };

      if (sizeMb >= thresholdMb) {
        // Threshold exceeded: always notify as warning
        await notifyAlarm(
          env,
          {
            level: 'warn',
            title: 'D1 database size approaching limit',
            message: `Database size (${sizeMb.toFixed(1)} MB) has reached the alarm threshold (${thresholdMb} MB). D1 free tier limit is 500 MB per database.`,
            fields: sizeFields,
          },
          logger,
        );
      } else if (env.D1_SIZE_REPORT_ENABLED === 'true') {
        // Regular size report for monitoring (controlled by D1_SIZE_REPORT_ENABLED)
        await notifyAlarm(
          env,
          {
            level: 'info',
            title: 'D1 database size information',
            message: 'Database size is within the normal range.',
            fields: sizeFields,
          },
          logger,
        );
      }
    } catch (sizeErr) {
      logger.warn('D1 size check failed', {
        error: sizeErr instanceof Error ? sizeErr.message : String(sizeErr),
      });
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
}
