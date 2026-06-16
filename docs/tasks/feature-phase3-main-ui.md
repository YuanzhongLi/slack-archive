# Phase 3 メインUI（チャンネル一覧 + メッセージビュー + スレッド）

## 概要

Phase 3 UIの中核となるチャンネル一覧サイドバー・メッセージ表示・スレッド展開表示を実装する。

## ソース

milestones.md Phase 3 タスク（1〜3）

## 実装計画

### Wave 1（並列実行）

#### Step 1: バックエンド API エンドポイント追加
- `GET /api/channels` — チャンネル一覧（id, slackChannelId, name）
- `GET /api/channels/:id/messages` — メッセージ一覧（ユーザー情報結合、カーソルページネーション）
- `GET /api/channels/:id/messages/:ts/threads` — スレッド返信一覧
- `src/worker/routes/channels.ts` 新規作成
- `src/worker/app.ts` にルート登録

#### Step 2: フロントエンド基盤
- `swr` + `react-router-dom` インストール
- `src/client/types/api.ts` — APIレスポンス型定義（Channel, Message, ThreadReply）
- `src/client/hooks/useChannels.ts` — SWRでチャンネル一覧取得
- `src/client/hooks/useMessages.ts` — SWRでメッセージ一覧取得
- `src/client/hooks/useThreadReplies.ts` — SWRでスレッド返信取得

### Wave 2（Wave 1 完了後）

#### Step 3: UI コンポーネント実装
- `src/client/components/Avatar.tsx` — ユーザーアイコン（avatarUrl or イニシャルフォールバック）
- `src/client/components/Timestamp.tsx` — フォーマット済みタイムスタンプ
- `src/client/components/ChannelList.tsx` — サイドバーチャンネル一覧
- `src/client/components/MessageItem.tsx` — 1メッセージ（アイコン・名前・時刻・テキスト・スレッド展開ボタン）
- `src/client/components/MessageList.tsx` — チャンネルメッセージ一覧
- `src/client/components/ThreadPanel.tsx` — スレッド展開パネル（右サイドパネル）

#### Step 4: App.tsx + ルーティング統合
- 依存: Step 3 コンポーネント
- `react-router-dom` でチャンネルルート設定（`/channels/:id`）
- `src/client/main.tsx` に `BrowserRouter` 追加
- `App.tsx` を ChannelList・MessageList・ThreadPanel を組み合わせたレイアウトに更新

## 技術的な判断メモ

- データ取得: SWR（キャッシュ・revalidation・loading/error 状態管理）
- ルーティング: react-router-dom（/channels/:id 形式）
- スレッドパネル: 右サイドに固定幅パネルとして表示（モーダルではなく）
- メッセージページネーション: cursor ベース（slackTs を cursor に使用）
- Slack `ts` は文字列 Unix タイムスタンプ（例: "1234567890.123456"）→ 表示時に Date 変換

## 完了条件

- [ ] チャンネル一覧がサイドバーに表示される
- [ ] チャンネル選択でメッセージ一覧が表示される
- [ ] メッセージにユーザーアイコン・表示名・タイムスタンプが表示される
- [ ] スレッドのある投稿に「N件の返信」ボタンが表示され、クリックで展開できる
- [ ] make format && make lint && make typecheck && make build が通る
