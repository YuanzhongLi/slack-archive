# 環境変数の管理

## 一覧

| 変数 | 用途 | 管理方法 | 本番での値 |
|---|---|---|---|
| `CF_ACCESS_TEAM_DOMAIN` | CF Access JWT の issuer / JWKS URL | `wrangler.toml` vars | `your-team.cloudflareaccess.com` |
| `CF_ACCESS_AUD` | CF Access Audience Tag | `wrangler secret put` | 64文字 hex |
| `SLACK_BOT_TOKEN` | Slack Bot API Token | `wrangler secret put` | `xoxb-...` |
| `SLACK_ALARM_WEBHOOK_URL` | アラーム通知用 Slack Incoming Webhook URL（省略可） | `wrangler secret put` | `https://hooks.slack.com/services/...` |
| `DEV_USER_EMAIL` | ローカル開発用 認証バイパス | `wrangler.toml` vars（空文字）/ `.dev.vars` | **本番では必ず `""`** |
| `D1_ALARM_SIZE_THRESHOLD_MB` | D1 サイズアラーム閾値（MB）。デフォルト 400 MB | `wrangler.toml` vars | `400` |

## vars vs secrets

| 種別 | 置き場 | git commit | 本番での値 |
|---|---|---|---|
| **vars** | `wrangler.toml` の `[vars]` | される | 公開しても問題ない設定値 |
| **secrets** | `wrangler secret put` | されない | 秘匿値（Token、AUD等） |
| **local dev** | `.dev.vars`（gitignore対象） | されない | ローカルのみの上書き値 |

## ローカル開発のセットアップ

```bash
cp .dev.vars.example .dev.vars
# .dev.vars を編集して各値を設定
```

`.dev.vars.example` の内容:

```
DEV_USER_EMAIL=you@example.com
CF_ACCESS_TEAM_DOMAIN=
CF_ACCESS_AUD=
SLACK_BOT_TOKEN=xoxb-your-token-here

# (Optional) Slack Incoming Webhook URL for alarm notifications (cron failure, D1 size)
# SLACK_ALARM_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```

`DEV_USER_EMAIL` に設定したメールアドレスが `users` テーブルに存在すれば、CF Access JWT 検証をスキップして認証バイパスされる。

> **注意**: `CF_ACCESS_TEAM_DOMAIN` が設定されている場合は `DEV_USER_EMAIL` の値は無視される（本番誤設定防止）。

## Secrets の設定（本番）

```bash
npx wrangler secret put CF_ACCESS_AUD
npx wrangler secret put SLACK_BOT_TOKEN
```

設定済みの Secrets を確認:

```bash
npx wrangler secret list
```
