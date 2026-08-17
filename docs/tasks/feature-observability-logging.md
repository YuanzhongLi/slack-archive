# Cloudflare Workers Logs 有効化

## 概要

Cloudflare Dashboard および `wrangler tail` でリクエストログを閲覧できるようにする。
`[observability] enabled = true` は設定済みで JSON 構造化ログも実装済みだが、
HTTPリクエスト/レスポンスの method/path/status/duration を実際に出力するミドルウェアが未実装。

## ソース

ユーザー指示: cloudflare上でlogが見れるようにしたい（他プロジェクトの ops ドキュメントを参考に）

## 実装計画

### Wave 1（並列実行）

#### Step 1: リクエストログ出力ミドルウェア実装
- `src/worker/app.ts` の `*` ミドルウェアを拡張
- request 受付時に `method / path` を info ログ
- `next()` 後に `status / durationMs` を info ログ

#### Step 2: docs/ops/logging.md 作成
- Cloudflare Dashboard でのログ閲覧手順
- `wrangler tail` コマンド例
- 代表的なクエリ例

## 技術的な判断メモ

- `wrangler.toml` の `[observability] enabled = true` + `nodejs_compat` は既設定済み
- `console.log` の JSON 出力は Workers Logs に自動転送される
- 他プロジェクトの logging ops ドキュメントを参考に同様の内容を作成

## 完了条件

- [ ] HTTP リクエストが method/path/status/durationMs 付きで Workers Logs に記録される
- [ ] `docs/ops/logging.md` にログ閲覧手順・クエリ例が記載される
- [ ] `make format && make lint && make typecheck && make build` が通る
