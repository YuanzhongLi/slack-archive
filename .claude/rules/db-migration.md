# DB Migration ルール

## 開発フェーズ

本プロジェクトは **pre-release 段階**。production D1 への migration 互換性を考慮する必要はない。

**リリース開始時**: 本ドキュメント「開発フェーズ」欄に `Released on YYYY-MM-DD` と記載されたタイミングでポリシーが切り替わる。

現在の状態: **Pre-release**（未リリース）

## Pre-release 期間中（現在）

- `migrations/` の既存ファイルを自由に編集・削除・統合してよい
- ローカル D1 は `make db-reset` で破棄して再構築
- production D1 も作り直し可（まだ誰も使っていない前提）
- ALTER TABLE 互換性、段階的リリース、既存データ保全の考慮不要

## schema 変更時の推奨ワークフロー

1. `src/worker/db/schema.ts` を編集
2. `make db-generate` で migration ファイルを生成（`npx drizzle-kit generate`）
3. `make db-reset` でローカル D1 を再構築
4. `npx wrangler types` で `worker-configuration.d.ts` を再生成（binding 変更時のみ）

## Post-release 期間のポリシー（将来）

リリース開始後は以下に切り替わる:

- 既存 migration ファイルは編集不可（append-only）
- breaking change（DROP COLUMN、型変更等）は段階移行が必要
- migration 番号は連番で追加

## D1 初期セットアップ（新規デプロイ時）

```bash
# D1 database を作成してから wrangler.toml の database_id を更新する
npx wrangler d1 create slack-archive-db

# リモートにマイグレーション適用
make db-migrate-remote
```

`wrangler.toml` の `database_id` は `placeholder-replace-after-wrangler-d1-create` になっている。実際の ID に必ず差し替える。
