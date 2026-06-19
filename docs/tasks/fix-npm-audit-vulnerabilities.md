# npm audit 脆弱性修正

## 概要
`npm install` で報告される脆弱性を安全な範囲で修正する。

## ソース
ユーザー指示（npm install で出る warn や audit を改善したい）

## 実装計画

### Step 1: wrangler・@cloudflare/vite-plugin の更新
- `wrangler` 4.100.0 → 4.102.0
- `@cloudflare/vite-plugin` 1.40.2 → 1.42.0
- これにより undici (high ×2) / ws (high ×3) / esbuild(wrangler経路, moderate ×1) を解消

## 技術的な判断メモ
- drizzle-kit 経由の esbuild (moderate ×4) は `npm audit fix --force` が drizzle-kit 0.18.1 へのダウングレードを要求するため今回は対応しない
  - `@esbuild-kit/esm-loader` は drizzle-kit の開発ツール内部（migration 生成時のみ使用）
  - 開発サーバーへの外部アクセス脆弱性だが、本番 Worker には影響しない

## 完了条件
- [x] high 脆弱性 (5件) が解消されている
- [x] wrangler・@cloudflare/vite-plugin 更新後もビルドが通る
- [ ] PR がマージされている
