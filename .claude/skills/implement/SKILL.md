---
name: implement
description: current-phase.md の計画に基づき実装を進める。
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# 実装

## 前提

- `.claude/current-phase.md` に実装計画が存在すること
- 計画がない場合は `/dev-start` を先に実行するよう案内して終了

## Step 1: 計画の確認

1. `.claude/current-phase.md` を読む
2. 計画ドキュメント（`docs/tasks/{filename}.md`）を読む
3. 次に着手すべきステップを特定する
4. ユーザーに「以下のステップから着手します。よろしいですか？」と確認する

## Step 2: エージェント選定 + 実行計画（DAG / wave）策定（必須・GATE あり）

計画の各ステップに対して、最適な専門エージェントを選定し、**依存関係を踏まえて並列実行できる wave にまとめる**。

### エージェント対応表

| ステップの種類 | 推奨エージェント | 用途 |
|---|---|---|
| Astro ページ・レイアウト・コンポーネント | `astro-page-expert` | `src/pages/`・`src/layouts/`・`src/components/`・`src/i18n/` |
| Notion API クライアント・画像同期スクリプト | `notion-integration-expert` | `src/lib/notion/`・`scripts/`・管理画面ロジック |
| デザインシステム・palette・layout 骨組み | `design-expert` | `src/styles/`・Tailwind config・design 判断 |
| メタ作業（rules, skills, docs 変更のみ） | agent 不要 | 直接実装 |

> agent 名はリポジトリ実体（`.claude/agents/*.md` の `name` フィールド）と一致させる。

### DAG / wave の考え方

- ステップ間の依存関係を DAG として捉える
- **お互いに依存しないステップ群は 1 つの wave にまとめ、同一メッセージ内で agent を並列起動する**

### 並列判定クライテリア

あるステップ群を同一 wave に入れてよい条件:
- 編集対象ファイルが重ならない
- 依存関係（import / 参照）が一方向のみ、または無い
- 同一レイヤでも担当 feature が異なれば並列可

並列不可の典型（= 別 wave）:
- 同一ファイルを複数 step が編集する
- `src/lib/notion/client.ts` の型変更 → それを import するページ実装
- `src/lib/config.ts` の Country 型変更 → 全コンポーネントへの波及

### 提示フォーマット（wave あり）

```
【エージェント選定 + 実行計画】

Wave 1（並列実行）:
  - Step 1: Notion クライアント（複数 DB 対応） → notion-integration-expert
  - Step 2: i18n resources 骨格作成 → astro-page-expert

Wave 2（Wave 1 完了後）:
  - Step 3: 各国ページ実装 → astro-page-expert
    （Step 1 の client と Step 2 の i18n に依存）

この選定・実行計画で進めてよいですか？
```

> **⛔ GATE: ユーザーの明示的な承認を得るまで Step 3 に進んではならない。**

## Step 3: 実装サイクル（wave 単位）

**ユーザー承認済みの**計画に基づき、**wave 単位**で以下のサイクルを回す。

### 3a. wave の実装

1. 今回実行する wave の内容をユーザーに簡潔に報告する
2. wave 内のステップを**同一メッセージ内で並列に起動する**
3. 判断に迷った場合は**必ず**ユーザーに確認する

### 3b. 判断・スコープ変更の記録

- 重要な設計判断が生まれた場合: `docs/tasks/{filename}.md` の「技術的な判断メモ」に記録する
- マイルストーンに未掲載の作業が必要と判明した場合: `docs/initial-plan/milestones.md` の該当 Phase への追加をユーザーに提案する

### 3c. 品質チェック（wave 境界で柔軟に）

各 wave 完了時点で以下を推奨する:

```bash
make format
make lint
make typecheck
```

**最終 wave 完了時と `/pre-pr-check` 前には必ず全体を回す**（`make build` も含む）。

### 3c-2. UI 検証（FE 変更を含む場合）

ページ・コンポーネントを追加・変更した場合は `make dev` 起動後に Playwright MCP でブラウザ確認する:

```
mcp__playwright__browser_navigate → mcp__playwright__browser_take_screenshot
→ mobile (375x667) + PC (1280x800) の両方を確認
→ mcp__playwright__browser_close
```

### 3d. 進捗更新

`.claude/current-phase.md` の進捗チェックボックスを wave 単位で更新する。

### 3e. 次 wave へ

全 wave が完了するか、ユーザーが中断を指示するまで 3a〜3d を繰り返す。

## Step 4: 完了報告

### 全ステップ完了の場合

1. `docs/initial-plan/milestones.md` を開き、完了した項目を `[x]` に更新する
2. 実施内容のサマリーを報告
3. 「`/pre-pr-check` で PR 前の品質検証を行いましょう」と案内

### 中断の場合

- 完了したステップと残ステップを報告
- current-phase.md が最新であることを確認
- 「次回 `/implement` で続きから再開できます」と案内

## 実装中の原則

- **迷ったらユーザーに聞く**: 推測で進めない
- **客観的な意見を述べる**: ユーザーの方針に問題がある場合は代替案を提示
- **記録を残す**: 重要な判断は必ずドキュメントに書く

## 実装時に参照すべき規約

| 規約 | 参照タイミング |
|------|---------------|
| `.claude/rules/astro.md` | ページ・コンポーネント実装時 |
| `.claude/rules/notion.md` | Notion API・画像処理実装時 |
| `.claude/rules/i18n.md` | テキストを追加・変更する時 |
| `.claude/rules/lint.md` | 型定義・Biome 規約 |
