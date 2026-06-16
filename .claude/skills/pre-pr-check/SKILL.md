---
name: pre-pr-check
description: PR作成前に format/lint/typecheck/build とコードレビュー・品質検証を一括実行
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Agent
---

# Pre-PR Quality Check

PR 作成前に format, lint, typecheck, build を一括実行し、問題があれば修正する。

## 手順

### 1. コードレビュー

`pr-code-reviewer` subagent を使用して変更内容をレビューする:

- 対象: `origin/main` との差分
- 観点: Astro 固有のミス（Notion 一時 URL / getStaticPaths / SSR）、設計・可読性、セキュリティ、変更スコープ
- 問題が見つかった場合は修正する

### 2. 品質検証

`quality-check-expert` subagent を使用して品質検証を行う:

- 対象: `origin/main` との差分
- 観点: テストの適切性、要件充足性、依存脆弱性
- **注意: format/lint/typecheck/build 実行は Step 3 で行うためスキップ**
- 問題が見つかった場合は修正する

### 3. マイルストーン更新の確認

```bash
git diff origin/main...HEAD -- docs/initial-plan/milestones.md
```

- 差分あり: そのまま次へ
- 差分なし: 今回の作業がマイルストーン項目を満たしているか確認する

### 4. 機械的チェック（最終ゲート）

以下を**順番に**実行する（前のステップが失敗したら修正してから次へ進む）:

```bash
make format
make lint
make test
make typecheck
make build
```

**エラー対応:**
- format: 自動修正されるので差分があればコミットに含める
- lint エラー: `make lint-fix` で自動修正を試み、修正できないものは手動対応
- typecheck エラー: 型エラーの原因を特定し修正
- build エラー: Astro ビルドエラーの原因を特定し修正（Notion API 呼び出しエラーの場合は環境変数を確認）

### 5. 結果報告

```
| チェック             | 結果    |
|---------------------|---------|
| Code Review         | OK/NG   |
| Quality Check       | OK/NG   |
| Milestone Update    | OK/NG   |
| Format              | OK/NG   |
| Lint                | OK/NG   |
| Test                | OK/NG   |
| Typecheck           | OK/NG   |
| Build               | OK/NG   |
```
