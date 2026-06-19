# Archive Delete — アーカイブデータ削除機能

## 概要

D1 Free Tier 500MB 上限に対応するため、アーカイブ済みデータを削除できる機能を追加する。

## ソース

[issue #20](https://github.com/YuanzhongLi/slack-archive/issues/20)

## 仕様

- メッセージ・スレッドの削除は **91日以上前のデータに限定**
- チャンネルごと削除は年齢制限なし（チャンネルレコード＋全メッセージ・スレッドを一括削除）
- 削除前に「完全に失われる」という警告ダイアログを表示
- 認可: admin 以上のみ実行可能

## 実装計画

### Wave 1（並列実行）

#### Step 1: Backend — archive API ルート新設

- ファイル: `src/worker/routes/archive.ts`（新規）
- `app.route('/api/archive', archiveRouter)` を `src/worker/app.ts` に追加
- エンドポイント:
  - `GET /api/archive/stats` — チャンネルごとの削除可能件数（messages + threads の91日以上前）
  - `DELETE /api/archive/channels/:channelId/messages` — チャンネル内の91日以上前のメッセージ＋スレッドを削除
  - `DELETE /api/archive/channels/:channelId` — チャンネルレコード＋全メッセージ・スレッドを一括削除

#### Step 2: i18n・型定義

- `src/client/i18n/locales/en.ts` に `dataManagement` キー追加
- `src/client/i18n/locales/ja.ts` に `dataManagement` キー追加
- `src/client/types/api.ts` に `ArchiveStats`, `ArchiveChannelStat` 型追加

### Wave 2（Wave 1 完了後）

#### Step 3: Frontend — DataManagementPage 新設

- 新ページ: `src/client/pages/DataManagementPage.tsx`（route: `/management/data`）
- チャンネル一覧＋91日以上前メッセージ件数を表示
- 「古いメッセージを削除」ボタン → 警告dialog → 実行
- 「チャンネルごと削除」ボタン → より強い警告dialog → 実行
- `src/client/pages/AdminDashboardPage.tsx` に "Data Management" カード追加
- `src/client/App.tsx`（またはルーティングファイル）に `/management/data` ルート追加

## 技術的な判断メモ

- 削除条件: `messages.createdAt < (現在 - 91日)` の ISO8601 文字列比較
- チャンネル削除時は messages / threads の外部キー制約を確認（CASCADE or 手動削除）
- stats API はページロード時に1回だけ呼び出し、削除後に再フェッチ
- 警告ダイアログは `window.confirm()` を使用（UserManagementPage のパターン流用）

## 完了条件

- [ ] `GET /api/archive/stats` が各チャンネルの削除可能件数を返す
- [ ] `DELETE /api/archive/channels/:channelId/messages` で91日以上前のメッセージ・スレッドが削除される
- [ ] `DELETE /api/archive/channels/:channelId` でチャンネルごと完全削除できる
- [ ] `/management/data` ページでチャンネル一覧と件数が表示される
- [ ] 削除前に警告ダイアログが出る
- [ ] admin 以上のみ実行可能（viewer は非表示）
- [ ] i18n 対応（日英）
