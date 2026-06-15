import { app } from './worker/app';

export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    // Phase 2: Slack sync cron handler
  },
};
