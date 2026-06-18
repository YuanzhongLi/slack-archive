// Extend the generated Env interface with secrets managed via `wrangler secret put`
// These are not in wrangler.toml vars, so wrangler types does not include them.
interface Env {
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
  SLACK_BOT_TOKEN: string;
  // Optional: Slack Incoming Webhook URL for alarm notifications
  SLACK_ALARM_WEBHOOK_URL?: string;
}
