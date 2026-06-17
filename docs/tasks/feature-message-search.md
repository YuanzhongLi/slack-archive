# メッセージ検索

## 概要

チャンネル横断でメッセージをキーワード検索できる機能を追加する。
検索バックエンドは LIKE クエリで実装し、パフォーマンスが問題になった場合は FTS5（trigram）へ移行する（移行手順は `docs/ops/db-model.md` 参照）。

## ソース

`docs/initial-plan/milestones.md` Phase 4: メッセージ検索

## 実装計画

### Wave 1（並列実行）

#### Step 1: バックエンド検索 API
- `src/worker/routes/search.ts` 新規作成
  - `GET /api/search?q=...&limit=20&offset=0`
  - `messages.text LIKE '%q%'` + channels / slackUsers を LEFT JOIN
  - レスポンス: `{ results: SearchResult[], hasMore: boolean }`
- `src/worker/app.ts` に `app.route('/api/search', searchRouter)` を追加

#### Step 2: フロントエンド型定義 + i18n キー追加
- `src/client/types/api.ts` に `SearchResult`, `SearchResponse` 型追加
- `src/client/i18n/locales/en.ts`, `ja.ts` に `search.*` キー追加
  - `search.placeholder`, `search.empty`, `search.error`, `search.loading`

### Wave 2（Wave 1 完了後）

#### Step 3: UI コンポーネント実装
- `src/client/hooks/useSearch.ts`
  - debounce（300ms）付き検索フック
  - `q` が空のときはリクエストを送らない
- `src/client/components/SearchBar.tsx`
  - テキスト入力 + クリアボタン
- `src/client/components/SearchResultPanel.tsx`
  - 結果一覧（チャンネル名・ユーザーアバター・メッセージ本文・タイムスタンプ）
  - クリックで対象チャンネルへ遷移
  - ローディング・空・エラー状態の表示

#### Step 4: App.tsx への組み込み
- サイドバー（チャンネル一覧の上）に SearchBar を配置
- SearchResultPanel を ThreadPanel と排他表示（検索中はスレッドパネルを閉じる）

## 技術的な判断メモ

- LIKE クエリ採用: 初期実装としてシンプルに動く。FTS5 への移行パスは `docs/ops/db-model.md` に整備済み
- `offset` ベースのページネーション: 検索結果は cursor ベースより offset の方が UI が単純
- debounce 300ms: 入力のたびに API を叩かないようにする

## 完了条件

- [ ] `GET /api/search?q=xxx` が動作する
- [ ] 日本語キーワードで検索できる
- [ ] チャンネル名・ユーザー名・タイムスタンプが結果に表示される
- [ ] 結果クリックで対象チャンネルへ遷移する
- [ ] `make format && make lint && make typecheck && make build` が通る
