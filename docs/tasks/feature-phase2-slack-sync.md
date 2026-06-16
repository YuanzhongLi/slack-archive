# Phase 2: Slack同期基盤

## 概要
Slack APIからチャンネル・メッセージ・スレッド・ユーザーを取得してD1に保存する同期基盤を実装する。差分同期・レート制限対応・Cron自動同期・手動同期APIを含む。

## ソース
ユーザー指示: Phase 2基盤構築（docs/initial-plan/milestones.md参照）

## 実装計画

### Wave 1（並列実行）

#### Step 1: Slack APIクライアント
- `src/worker/services/slack/client.ts`
  - `fetchChannels()`: cursor paginationでパブリックチャンネル全件取得
  - `fetchMessages(channelId, oldest?)`: メッセージ取得（oldest指定で差分同期）
  - `fetchThreadReplies(channelId, threadTs)`: スレッド返信取得
  - `fetchUsers()`: ユーザー一覧全件取得
  - レート制限: 429時に`Retry-After`秒待機、呼び出し間100ms sleep

#### Step 2: 同期ロジック（syncService）
- `src/worker/services/sync/syncService.ts`
  - `syncAll(env)`: エントリーポイント（channels→messages→threads→users順）
  - `syncChannels(db, client)`: channels upsert
  - `syncMessages(db, client, channel)`: last_synced_atをoldestに使って差分取得、messages upsert
  - `syncThreads(db, client, channel, parentTsList)`: replies upsert
  - `syncUsers(db, client)`: slack_users upsert

### Wave 2（Wave 1完了後）

#### Step 3: Cron handler + 手動同期API
- `src/worker.ts`: scheduled()でsyncAll(env)を呼び出す
- `src/worker/routes/sync.ts`: POST /api/sync（admin以上のみ）
- `src/worker/app.ts`: sync routeを追加

## 技術的な判断メモ
- @slack/web-api はnodejs_compatフラグで Workers上で動作
- 差分同期: channels.last_synced_atをSlack APIのoldestパラメータに渡す
- upsertはDrizzleの`.onConflictDoUpdate()`で実装
- threads取得: thread_tsが存在するメッセージのみ対象

## 完了条件
- [ ] `make typecheck` がエラーなし
- [ ] `make build` が成功する
- [ ] `make test` が通る
- [ ] ローカルで手動同期API（POST /api/sync）を叩いてD1にデータが入る
