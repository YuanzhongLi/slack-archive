# Slack API ルール

## 使用ライブラリ

`@slack/web-api` を使用する。Bot Token（`xoxb-*`）で認証する。

## 必要な Bot Token スコープ

| スコープ | 用途 |
|---------|------|
| `channels:read` | パブリックチャンネル一覧取得 |
| `channels:history` | パブリックチャンネルのメッセージ取得 + スレッド（replies）取得 |
| `channels:join` | メッセージ取得前にBotを自動でチャンネル参加させる（`conversations.history` に必要） |
| `users:read` | ユーザー情報取得 |

## レート制限対応

Slack API には Tier ごとのレート制限がある（Tier 3: 50+ RPM）。

- ページネーションを含むループでは、各ページ取得の前に 200ms 待つ（`src/worker/services/slack/client.ts` の `SLEEP_MS`。これを正とする）
- `429 Too Many Requests` は `@slack/web-api` の組み込みリトライ（`Retry-After` を尊重）に任せ、自前のリトライは書かない
- 並列リクエストは最大 3〜5 本に制限する

## ページネーション

`conversations.history` / `conversations.list` は cursor ベースのページネーション:

```ts
let cursor: string | undefined;
do {
  const res = await client.conversations.history({
    channel: channelId,
    cursor,
    limit: 200,
  });
  // process res.messages
  cursor = res.response_metadata?.next_cursor;
} while (cursor);
```

## 差分同期

- `channels` テーブルの `last_synced_at` を起点に差分取得する
- `conversations.history` の `oldest` パラメータに `last_synced_at` の Unix timestamp を渡す
- 同期完了後に `last_synced_at` を現在時刻に更新する

## アンチパターン

- ❌ 全履歴を毎回フルスキャンする → `oldest` で差分取得する
- ❌ レート制限を無視して並列リクエストを多数投げる → 429 になる
- ❌ Bot Token を wrangler.toml の `[vars]` に書く → `wrangler secret put SLACK_BOT_TOKEN` で管理する
