# Node 26 への更新と依存脆弱性（high 以上）の解消

## 概要
最近の脆弱性報告を受け、Node を最新（26）に上げ、`npm audit --audit-level=high` が 0 件になるよう依存を更新する。

## ソース
ユーザー指示（/implement 引数）

## 実装計画

### Step 1: Node 更新
- `.node-version` を 26、`@types/node` を ^26、`engines.node` を `>=26` に設定
- docs 内の Node バージョン記述を v26 に統一

### Step 2: 依存更新
- wrangler 4.152 / @cloudflare/vite-plugin 1.65 / @cloudflare/workers-types 5
- vitest・@vitest/coverage-v8 5（critical 解消）、vite 6.4.5、zod 4.6.7、その他 `npm audit fix`
- `worker-configuration.d.ts` を `wrangler types` で再生成
- better-sqlite3 は Node 変更後に `npm rebuild` が必要

### Step 3: 追従修正
- vitest 5 の型変更に合わせ `ReturnType<typeof vi.spyOn>` を `MockInstance` に変更
- zod 4 で deprecated の `z.string().email()` を `z.email()` に変更

## 技術的な判断メモ
- miniflare が `undici` 7.29.1 に exact pin しており high が残るため `overrides: { miniflare: { undici: "^7.30.1" } }` を追加。**miniflare が undici >=7.30.1 を要求したら削除する**
- workers-types 5 は wrangler 4.152 の peer 要求
- 残る moderate（drizzle-kit → @esbuild-kit → esbuild）は `audit fix` が drizzle-kit 0.18.1 へのダウングレードを要求するため対象外。devDependency の migration 生成 CLI のみで本番 Worker には影響しない
- zod 4 でエラーメッセージ文言が変わる（例: `Invalid email` → `Invalid email address`）。400 応答の `message` に反映されるが、文言に依存するテスト・フロントはない

## 完了条件
- [x] `npm audit --audit-level=high` が 0 件
- [x] format / lint / typecheck / test / build が通る
- [ ] CI（Node 26, ubuntu-latest）が通る
- [ ] PR がマージされている
