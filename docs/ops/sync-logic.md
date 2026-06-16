# 同期ロジック

Slack APIからデータを取得してD1に保存する仕組みの解説。

---

## 同期の全体フロー

```
syncAll()
  │
  ├─ 1. syncChannels()      チャンネル一覧を upsert
  │
  ├─ 2. syncUsers()         ユーザー一覧を upsert
  │
  └─ 3. チャンネルごとにループ
         │
         ├─ joinChannel()              Bot をチャンネルに参加
         ├─ syncMessagesForChannel()   メッセージを upsert → thread parent の ts を収集
         └─ syncThreadsForChannel()    スレッド返信を upsert
```

同期のトリガーは2種類:
- **Cron Trigger**: 毎日 UTC 17:00（JST 02:00）に自動実行
- **手動同期**: `POST /api/sync`（admin/root のみ）

---

## 差分同期の仕組み

### channels テーブルの `last_synced_at`

```
channels テーブル
┌──────────────────────────┬──────────────────────────┐
│ name                     │ last_synced_at            │
├──────────────────────────┼──────────────────────────┤
│ general                  │ 2026-06-16T02:00:00.000Z  │  ← 前回の同期時刻
│ random                   │ NULL                      │  ← 初回は NULL（全件取得）
└──────────────────────────┴──────────────────────────┘
```

### 差分同期のシーケンス

```
syncMessagesForChannel(channel)
  │
  ├─ last_synced_at が NULL
  │    └─ oldest パラメータなし → 全件取得
  │
  └─ last_synced_at が存在する（例: 2026-06-16T02:00:00.000Z）
       │
       └─ Unix timestamp に変換（1750032000）
            └─ conversations.history(oldest: "1750032000") → その時刻以降のみ取得

同期完了後: channels.last_synced_at = 現在時刻 に更新
```

### 具体例

```
1回目の同期（last_synced_at = NULL）
  → Slack API: oldest 指定なし → 全メッセージ取得
  → last_synced_at = "2026-06-16T02:00:00.000Z" に更新

2回目の同期（翌日 JST 02:00）
  → last_synced_at = "2026-06-16T02:00:00.000Z"
  → Slack API: oldest = "1750032000"（Unix timestamp）
  → 2026-06-16T02:00:00 以降の新しいメッセージのみ取得
```

---

## upsert による冪等性

全データの保存は `INSERT ... ON CONFLICT DO UPDATE` で実装している。同じデータを何度 sync しても重複しない。

| テーブル | upsert のキー | 更新されるフィールド |
|---------|-------------|-------------------|
| `channels` | `slack_channel_id` | `name`, `is_private` |
| `slack_users` | `slack_user_id` | `display_name`, `real_name`, `avatar_url` |
| `messages` | `(channel_id, slack_ts)` | `text`, `thread_ts` |
| `threads` | `(channel_id, slack_ts)` | `text` |

---

## メッセージ編集・削除の扱い

### 編集されたメッセージ

Slack の `conversations.history` は**編集後のテキストを返す**。`slack_ts`（メッセージのタイムスタンプ）は変わらないため、upsert によって D1 の `text` が自動的に最新内容に更新される。

```
Slack 上でメッセージを編集
  │
  └─ 次回 sync 時
       └─ conversations.history が編集後テキストを返す
            └─ ON CONFLICT DO UPDATE SET text = <編集後テキスト>
                 └─ D1 の text が更新される ✅
```

ただし、`oldest` による差分同期では**編集は検出されない**。`conversations.history` の `oldest` パラメータは「その時刻以降に投稿されたメッセージ」を返すが、「その時刻以降に編集されたメッセージ」は含まれない。

**現在の制限**: 過去に投稿されたメッセージを後から編集した場合、次の差分同期では取得されず D1 の内容は古いまま残る。

### 削除されたメッセージ

Slack でメッセージを削除しても、D1 からは**削除されない**。現在の実装は「削除の検出・反映」をサポートしていない。

```
Slack 上でメッセージを削除
  │
  └─ 次回 sync 時
       └─ conversations.history が削除済みメッセージを返さない
            └─ D1 には削除前のレコードがそのまま残る ⚠️
```

これは意図的な設計で、アーカイブとして過去の発言を保持することがこのアプリの目的のため。

---

## スレッドの同期

```
fetchMessages() でメッセージを取得
  │
  └─ thread_ts === ts のメッセージ = スレッドの親メッセージ
       │
       └─ parentTsList に ts を追加
            │
            └─ syncThreadsForChannel() でスレッド返信を取得
                 └─ conversations.replies(ts: parentTs)
                      └─ 最初のメッセージ（親）はスキップして返信のみ保存
```

**スレッド差分同期の制限**: スレッド返信は `last_synced_at` による差分取得をしていない。親メッセージが差分取得の対象になった場合のみ、その返信全件を再取得して upsert する。

---

## レート制限対応

```
API呼び出しのたびに 200ms sleep
  │
  └─ レート制限エラー（429）が発生した場合
       └─ Retry-After ヘッダーの秒数だけ待機
            └─ 最大 3回リトライ
                 └─ 3回失敗したら例外をスロー → sync 全体がエラー終了
```

---

## 既知の制限

| 制限 | 内容 | 対応方針 | issue |
|------|------|---------|-------|
| 編集の差分検出なし | `oldest` 以前に投稿されたメッセージの編集は次回 sync で反映されない | Events API の `message_changed` Webhook で検出（全件スキャン不要） | [#2](https://github.com/YuanzhongLi/slack-archive/issues/2) |
| 削除の反映なし | Slack で削除されたメッセージは D1 に残り続ける | Events API の `message_deleted` Webhook で検出。D1 に残す（アーカイブ保持）か削除するかは設計判断 | [#2](https://github.com/YuanzhongLi/slack-archive/issues/2) |
| ~~スレッド差分なし~~ | ✅ 対応済み: `messages.replies_last_synced_at` + `conversations.replies(oldest)` で差分取得 | — | [#3](https://github.com/YuanzhongLi/slack-archive/issues/3) |
| プライベートチャンネル非対応 | `channels:history` スコープではパブリックのみ | `groups:history` スコープを追加（Phase 5以降） | - |
