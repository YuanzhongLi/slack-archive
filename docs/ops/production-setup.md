# Production Environment Setup

本番環境の初回セットアップ手順。各ステップを順番に実施する。

---

## 前提・準備

以下のアカウントとアクセス権が必要:

- Cloudflare アカウント（Workers / D1 / Access が有効）
- Slack ワークスペースの管理者権限（Bot App のインストール許可）
- ローカルに `wrangler` CLI（`npx wrangler --version` で確認）

### Cloudflare アカウントへのログイン

```bash
npx wrangler login
```

---

## Step 1: D1 データベース作成

```bash
npx wrangler d1 create slack-archive-db
```

出力例:

```
✅ Successfully created DB 'slack-archive-db'

[[d1_databases]]
binding = "DB"
database_name = "slack-archive-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

`database_id` をコピーし、`wrangler.toml` を更新する:

```diff
- database_id = "placeholder-replace-after-wrangler-d1-create"
+ database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### migration 適用

```bash
make db-migrate-remote
```

### root ユーザー初期投入

```bash
npx wrangler d1 execute slack-archive-db --remote \
  --command "INSERT INTO users (id, email, role, created_at, updated_at) VALUES (lower(hex(randomblob(16))), 'your-email@example.com', 'root', datetime('now'), datetime('now'));"
```

`your-email@example.com` は Google アカウントのメールアドレスに変更する。CF Access ログイン時のメールアドレスと一致させること。

---

## Step 2: Cloudflare Access 設定

Cloudflare Zero Trust ダッシュボード（`dash.cloudflare.com` → Zero Trust）で設定する。

### 2-1. Team domain の確認

Zero Trust > Settings > Custom Pages に表示される `<team>.cloudflareaccess.com` の `<team>` 部分を記録する。

`wrangler.toml` の `[vars]` に追加:

```toml
[vars]
DEV_USER_EMAIL = ""
CF_ACCESS_TEAM_DOMAIN = "your-team.cloudflareaccess.com"
```

### 2-2. Access Application 作成

Zero Trust > Access > Applications > Add an Application > Self-hosted

| 項目 | 値 |
|---|---|
| Application name | slack-archive |
| Destination | `<worker-name>.<subdomain>.workers.dev` |
| Session Duration | 24 hours（任意） |

Path はブランク（アプリ全体を保護）。

ポリシー設定:

| 項目 | 値 |
|---|---|
| Policy name | Allow Google users |
| Action | Allow |
| Include rule | **Everyone**（Googleアカウントで認証済みなら通過） |

> **設計意図**: CF Access は「Googleアカウントで認証済みであること」のみを保証する。実際のアクセス制御は Worker 側の `users` テーブルの role で判定する。`users` に登録されていないGoogleアカウントは 403 で弾かれる。

### 2-3. AUD Tag の設定

Application 作成後、**Audience Tag**（64文字の hex）を取得する。

確認場所: Zero Trust > Access > Applications > 該当アプリを選択 > **Additional settings** > "Application Audience (AUD) Tag"

> **注意**: Application 一覧の "Application ID"（UUID形式）ではなく、Additional settings 内の 64文字 hex の AUD Tag を使うこと。

```bash
npx wrangler secret put CF_ACCESS_AUD
# Audience Tag（64文字 hex）を貼り付けて Enter
```

### 2-4. Google IdP の設定

Zero Trust > Settings > Authentication > Add login methods > **Google**

Google Cloud Console で OAuth クライアントを作成:

1. APIs & Services > Credentials > Create Credentials > OAuth client ID
2. Application type: **Web application**
3. Authorized redirect URIs に追加:
   ```
   https://your-team.cloudflareaccess.com/cdn-cgi/access/callback
   ```
4. 作成した Client ID / Client Secret を CF Access の Google IdP 設定に入力

---

## Step 3: Slack App セットアップ

[slack-app-setup.md](./slack-app-setup.md) を参照して Bot Token を取得する。

```bash
npx wrangler secret put SLACK_BOT_TOKEN
# xoxb-... を入力して Enter
```

---

## Step 4: 初回デプロイ

```bash
make build
npx wrangler deploy
```

---

## Step 5: 動作確認

| 確認項目 | 手順 |
|---|---|
| アプリが CF Access で保護されている | Worker URL にアクセス → Google ログイン画面が出る |
| ログイン後 /api/me が返る | ログイン後 `GET /api/me` → `{ id, email, role: "root" }` |
| 手動同期が動く | `POST /api/sync` → `{ status: "done", channelCount: N }` |
| Cron が設定されている | Cloudflare Dashboard > Workers > Triggers > Cron Triggers に `0 17 * * *` が表示される |

---

## セットアップ完了チェックリスト

```
[ ] D1 データベース作成済み
[ ] wrangler.toml の database_id を実際の ID に更新済み
[ ] D1 migration を --remote で適用済み
[ ] root ユーザーを D1 に追加済み
[ ] CF Access Application 作成済み（Everyone policy）
[ ] wrangler.toml の CF_ACCESS_TEAM_DOMAIN を更新済み
[ ] wrangler secret put CF_ACCESS_AUD 実行済み
[ ] CF Access に Google IdP を設定済み
[ ] Slack App を作成し Bot Token スコープを設定済み
[ ] wrangler secret put SLACK_BOT_TOKEN 実行済み
[ ] wrangler deploy 実行済み
[ ] ログイン → /api/me 確認済み
[ ] 手動同期（POST /api/sync）確認済み
```

---

## トラブルシュート

| 症状 | 原因候補 | 対処 |
|---|---|---|
| ログインしても 403 | `users` テーブルに email が未登録 | D1 に root ユーザーを INSERT |
| `/api/sync` が 401 | CF Access JWT が無効 | `CF_ACCESS_AUD` の値を確認 |
| `/api/sync` が 500 | `SLACK_BOT_TOKEN` が未設定 | `wrangler secret put SLACK_BOT_TOKEN` を実行 |
| Cron が動かない | `wrangler.toml` の `[triggers]` が未設定 | `0 17 * * *` が設定されているか確認して再デプロイ |
