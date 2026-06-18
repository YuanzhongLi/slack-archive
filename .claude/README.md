# .claude/

Claude Code のプロジェクト設定ディレクトリ。

## ディレクトリ構成

```
.claude/
├── README.md           # このファイル
├── settings.json       # 権限設定（allow/deny リスト）
├── settings.local.json # ローカル専用設定（.gitignore 対象）
├── current-phase.md    # 現在の実装フェーズ（.gitignore 対象）
├── rules/              # 実装規約・ガイドライン
├── skills/             # スラッシュコマンド（/dev-start 等）
├── agents/             # 専門エージェント定義（未使用）
├── scripts/            # フック用スクリプト
├── tmp/                # 一時ファイル置き場（.gitignore 対象）
└── worktrees/          # git worktree 管理（.gitignore 対象）
```

## rules/

| ファイル | 内容 |
|---------|------|
| `general.md` | 言語・git ブランチ・開発ワークフロー全般 |
| `auth.md` | CF Access 認証・認可・role 設計 |
| `hono.md` | Hono ルーティング・エラーハンドリング規約 |
| `react.md` | React ベストプラクティス（useEffect 等） |
| `slack-api.md` | Slack API クライアント・レート制限・差分同期 |
| `db-migration.md` | Drizzle ORM + D1 マイグレーション管理 |
| `lint.md` | Biome lint/format・TypeScript 型ルール |
| `milestones.md` | マイルストーン管理・更新タイミング |
| `testing.md` | テストファイル配置・tsconfig project references の注意点 |

## skills/

| スキル | 用途 |
|--------|------|
| `/dev-start` | タスク受付・ブランチ作成・計画策定 |
| `/implement` | 計画に基づく実装 |
| `/pre-pr-check` | PR 前の品質検証（format/lint/typecheck/build） |
| `/squash-and-push` | スカッシュ + push + PR 作成 |
| `/dev-complete` | PR マージ + クリーンアップ |
| `/handover` | セッション引き継ぎ |
| `/project-init` | プロジェクト初期計画ヒアリング |
