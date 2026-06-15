# Phase 1: プロジェクト基盤構築

## 概要
ゼロからCloudflare Workers + Hono + Vite + React + Drizzle + D1の骨格を作り、CF Access認証・role認可ミドルウェアまで動く状態にする。

## ソース
ユーザー指示: Phase 1基盤構築（docs/initial-plan/milestones.md参照）

## 実装計画

### Wave 1（並列実行）

#### Step 1: プロジェクト初期化
- `package.json`, `tsconfig.json`, `vite.config.ts`, `wrangler.toml` 作成
- 依存: Hono, React 19, Vite, Drizzle ORM, Zod, Biome, Wrangler, `@cloudflare/workers-types`
- `Makefile` (format/lint/typecheck/build/dev)
- `src/worker/index.ts` エントリーポイント雛形
- `src/client/main.tsx` React SPA雛形
- `.dev.vars.example`, `.gitignore`

#### Step 2: Drizzle スキーマ + マイグレーション
- `src/worker/db/schema.ts`:
  - `users` (id, email, role: 'root'|'admin'|'viewer', created_at, updated_at)
  - `channels` (id, slack_channel_id, name, is_private, last_synced_at)
  - `messages` (id, slack_ts, channel_id, user_slack_id, text, thread_ts, created_at)
  - `threads` (id, parent_ts, channel_id, user_slack_id, text, created_at)
  - `slack_users` (id, slack_user_id, display_name, real_name, avatar_url)
- `src/worker/db/client.ts`
- `drizzle.config.ts`
- `migrations/` 初期マイグレーション生成

### Wave 2（Wave 1完了後）

#### Step 3: CF Access認証 + 認可ミドルウェア
- `src/worker/middleware/auth.ts`: air-volleyballの adminAuth.ts をベースにJWT検証実装
  - JWKS in-memory cache
  - DEV_USER_EMAIL ローカルバイパス（CF_ACCESS_TEAM_DOMAIN未設定時のみ有効）
  - usersテーブルのemail照合
- role判定ヘルパー: `hasRole(user, minRole)` (viewer < admin < root)
- `src/worker/env.d.ts`: Env型定義（CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, DEV_USER_EMAIL, DB）

#### Step 4: Hono app配線 + ユーザー管理API + React雛形
- `src/worker/app.ts`: ルーティング, auth ミドルウェア適用
- `src/worker/routes/users.ts`:
  - GET /api/users
  - DELETE /api/users/:id (root削除不可, 自己削除不可)
  - POST /api/users/transfer-root (rootのみ実行可)
- `src/client/App.tsx`: 認証後の基本レイアウト（サイドバー + メインエリア雛形）

## 技術的な判断メモ
- role設計: root > admin > viewer の3段階。rootは削除不可、transfer-rootでアトミックに譲渡
- 認証: CF Access Everyone policy + usersテーブルemail照合の2段構え
- DEV_USER_EMAIL: CF_ACCESS_TEAM_DOMAINが設定されている場合は強制無効（本番誤設定防止）
- air-volleyballのadminAuth.tsのJWT検証ロジックをベースに流用

## 完了条件
- [ ] `pnpm install` が成功する
- [ ] `make typecheck` がエラーなし
- [ ] `make build` が成功する
- [ ] `make dev` でローカル起動できる
