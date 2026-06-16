# Logger 追加

## 概要

CF Workers ネイティブの薄いカスタムロガーを実装する。
`console.*` のラッパーとして JSON 構造化ログを出力し、`[observability]` 経由で Cloudflare ダッシュボードから閲覧できるようにする。

## ソース

ユーザー指示: カスタムロガーの追加（pino 等のライブラリ導入より CF Workers ネイティブなカスタム実装を選択）

## 実装計画

### Wave 1（並列実行）

#### Step 1: logger モジュール実装
- `src/worker/lib/logger.ts` を新規作成
- レベル付き JSON ログ（info / warn / error / debug）
- `child(bindings)` でリクエストスコープのコンテキストを付与できる設計
- TypeScript 型定義を含む

#### Step 2: authMiddleware へのロガー統合
- `src/worker/middleware/auth.ts` を修正
- リクエスト毎に `logger.child({ requestId, email })` を生成し `c.set('logger', ...)` へセット
- `Variables` 型に `logger` を追加

### Wave 2（Wave 1 完了後）

#### Step 3: 既存コードへのロガー適用
- `src/worker.ts`: `console.error` をロガーに置換
- `src/worker/services/sync/syncService.ts`: 同期処理の主要ステップに info/error ログを追加
- `src/worker/routes/sync.ts`: リクエスト受付・完了ログを追加

## 技術的な判断メモ

- pino は CF Workers で動作しない（stdout ストリーム非対応）、`pino/browser` も結局 console bridge でメリット薄
- `[observability] enabled = true` 済みなので `console.*` 出力は自動的に Cloudflare Logs に転送される
- `child()` パターンで request ID や user を自動付与し、各 route handler での煩雑な引き回しを不要にする
- Variables 型は `src/worker/app.ts` の `Hono<{ Variables: ... }>` で管理

## 完了条件

- [ ] `src/worker/lib/logger.ts` が実装され、型安全に使えること
- [ ] authMiddleware がリクエスト毎のロガーを context にセットすること
- [ ] syncService の主要処理（channels/messages/threads/users 同期）に info ログが入ること
- [ ] `make format && make lint && make typecheck && make build` が通ること
