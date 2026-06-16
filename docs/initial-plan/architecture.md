# アーキテクチャ

## 技術スタック

| カテゴリ | 技術 | 選定理由 |
|---------|------|---------|
| Runtime | Node.js v24 | 指定要件 |
| Frontend | React 19 + Vite | Cloudflare Workers上でのSPA、qipaiqiu-paymentと同構成 |
| Backend | Hono | Cloudflare Workers向け軽量フレームワーク |
| ORM | Drizzle ORM | Cloudflare D1との相性が良い、型安全 |
| Database | Cloudflare D1 (SQLite) | 1ワークスペース = 1D1インスタンス、無料枠5GB |
| Infra | Cloudflare Workers | エッジ実行、無料枠あり |
| 認証 | Cloudflare Access (Google provider) | OAuthフローを委譲、Googleアカウント必須でbot対策 |
| 認可 | Worker内自前実装 | usersテーブルのrole確認、DB操作のみでユーザー管理完結 |
| 定期実行 | Cloudflare Cron Triggers | 無料枠内で定期同期 |
| パッケージ管理 | pnpm | 高速、ディスク効率 |

## システム構成

```
[Slack API]
     ↓ Bot Token
[Cloudflare Worker (Hono)]
     ├── CF Access (Google OAuth) → users テーブルで認可
     ├── /api/sync  ← 手動同期エンドポイント
     ├── /api/*     ← メッセージ・チャンネル取得API
     └── Cron Trigger (scheduled handler) ← 自動同期
          ↓
     [Cloudflare D1]
          ├── workspaces
          ├── channels
          ├── messages
          ├── threads
          └── users (認可用)
```

## 主要コンポーネント

### Frontend (React + Vite)
- 責務: Slackライクなチャンネル一覧・メッセージ表示・スレッド展開
- ルーティング: `/ → チャンネル一覧`, `/:channelId → メッセージ`, `/management → 管理画面`
- 認証フロー: CF Accessのリダイレクト後、`/api/auth/me`でWorker側の認可確認

### Backend API (Hono)
- 責務: Slack APIクライアント、D1 CRUD、同期ロジック
- ミドルウェア: CF Access JWT検証 → usersテーブルemailチェック
- 同期ロジック: 差分同期（最終同期タイムスタンプ以降のみ取得）

### Cron Handler
- 責務: 定期自動同期（Cloudflare Cron Triggers）
- 処理: channels → messages → threads → users の順に取得・upsert

## DB スキーマ概要

```sql
workspaces  (id, slack_team_id, name, synced_at)
channels    (id, slack_channel_id, name, is_private, last_synced_at)
messages    (id, slack_ts, channel_id, user_slack_id, text, thread_ts, created_at)
threads     (id, parent_ts, channel_id, user_slack_id, text, created_at)
slack_users (id, slack_user_id, display_name, real_name, avatar_url)
users       (id, email, role, created_at)  -- 認可用
```

## 外部サービス連携

- **Slack API**: Bot Token（`xoxb-*`）でchannels.list / conversations.history / conversations.replies / users.list
- **Cloudflare Access**: Google OAuthプロバイダー、Everyone policy（認証はGoogleアカウントのみ）

## ディレクトリ構成案

```
slack-archive/
├── src/
│   ├── worker/          # Hono backend (Cloudflare Worker)
│   │   ├── index.ts     # エントリーポイント + Cron handler
│   │   ├── routes/      # APIルート
│   │   ├── middleware/  # 認証・認可ミドルウェア
│   │   ├── services/    # Slack API クライアント・同期ロジック
│   │   └── db/          # Drizzle スキーマ・クエリ
│   └── client/          # React フロントエンド
│       ├── pages/       # ルートコンポーネント
│       └── components/  # UIコンポーネント
├── wrangler.toml
├── drizzle.config.ts
└── package.json
```
