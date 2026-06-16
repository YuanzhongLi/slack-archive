# Slack App セットアップ

Slack APIからデータを取得するためのBot Tokenを取得する手順。

---

## Step 1: Slack App を作成

1. https://api.slack.com/apps を開く
2. **Create New App** をクリックすると、以下の選択肢が表示される:
   - **From scratch** — 今回はこちらを選択
   - **From an app manifest** — 設定ファイルからAppを作成する方法（後述）
3. 以下を入力:
   - **App Name**: `slack-archive`（任意）
   - **Pick a workspace**: アーカイブしたいワークスペースを選択
4. **Create App** をクリック

> **Your App Configuration Tokens について**
>
> App作成画面の上部に「Your App Configuration Tokens」という項目が表示される場合がある。これは App Manifest（App の設定をYAML/JSONで管理する機能）をAPIやCLIから操作するための特殊なトークンであり、**今回の用途（メッセージ取得）には不要**。無視して問題ない。
>
> | | App Configuration Token | Bot User OAuth Token（今回使うもの） |
> |---|---|---|
> | 用途 | App自体の設定をAPI経由で自動化 | ワークスペースのデータ読み書き |
> | 取得タイミング | App作成前 | App作成・インストール後 |
> | 今回必要か | 不要 | **必要** |

---

## Step 2: Bot Token Scopes を設定

左メニュー **OAuth & Permissions** → **Scopes** → **Bot Token Scopes** に以下を追加:

| Scope | 用途 |
|---|---|
| `channels:read` | パブリックチャンネル一覧の取得 |
| `channels:history` | パブリックチャンネルのメッセージ取得 + スレッド（返信）の取得 |
| `channels:join` | メッセージ取得前にBotを自動でチャンネルに参加させる |
| `users:read` | ユーザー情報の取得 |

---

## Step 3: ワークスペースにインストール

左メニュー **OAuth & Permissions** → **Install to Workspace** をクリック → **許可する**

インストール完了後、同ページに **Bot User OAuth Token**（`xoxb-...`）が表示される。コピーしておく。

---

## Step 4: Token を設定

### ローカル開発

`.dev.vars` に追加（`.dev.vars.example` をコピーして作成）:

```
SLACK_BOT_TOKEN=xoxb-your-token-here
```

### 本番（Cloudflare Workers）

```bash
npx wrangler secret put SLACK_BOT_TOKEN
# プロンプトに xoxb-... を入力して Enter
```

---

## Step 5: 動作確認

`.dev.vars` と local D1 が整った状態で同期を手動実行:

```bash
# D1をセットアップ（初回のみ）
make db-migrate-local

# users テーブルに自分を登録
npx wrangler d1 execute slack-archive-db --local \
  --command "INSERT INTO users (id, email, role, created_at, updated_at) VALUES ('root-1', 'you@example.com', 'root', datetime('now'), datetime('now'))"

# 開発サーバーを起動
make dev

# 別ターミナルで手動同期を実行
curl -X POST http://localhost:5173/api/sync
```

レスポンス例:
```json
{ "status": "done", "channelCount": 5, "messageCount": 312 }
```

---

## トラブルシュート

| 症状 | 原因候補 | 対処 |
|---|---|---|
| `missing_scope` エラー | スコープが不足 | Step 2 で該当スコープを追加後、Step 3 を再実行 |
| `invalid_auth` エラー | トークンが無効 | Step 3 でアプリを再インストールし、新しい Token を取得 |
| `not_in_channel` エラー | Bot がチャンネルに未参加 | パブリックチャンネルは参加不要のはず。スコープを確認 |
| channels が0件 | ワークスペース内にパブリックチャンネルがない | Slack でパブリックチャンネルが存在するか確認 |
