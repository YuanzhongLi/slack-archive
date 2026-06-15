---
name: dev-start
description: タスク受付・計画策定・ブランチ作成を行う。セッション開始時に使う。
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
---

# タスク開始

## Step 0: 開発環境セットアップ確認

`node_modules/` が存在するか確認する:

```bash
test -d node_modules || echo "MISSING"
```

存在しない場合は `npm install` を実行してから次の Step に進む。

## Step 1: 状態確認

現在の状態を把握する:

```bash
git branch --show-current
git log --oneline -5
git status --short
```

`.claude/current-phase.md` が存在する場合は読み、前回の中断タスクを把握する。

- 中断タスクがある場合: 再開するか新規タスクかをユーザーに確認
- 再開する場合: current-phase.md の計画ドキュメントパスを確認し、`/implement` を案内して終了

## Step 2: タスク受付

ユーザーに「今回のタスクは何ですか？」と質問する。

受付方法（いずれか）:
1. **GitHub issue** → `gh issue view` で内容を取得して理解する
2. **ユーザーの口頭説明** → 要件を整理して確認
3. **Claude からの提案** → `docs/initial-plan/milestones.md` や `docs/initial-plan/requirements.md` を参照し、未着手のタスクを提案する

タスクの粒度を確認:
- 1つの PR で完結する大きさか
- 大きすぎる場合は分割を提案

### マイルストーンとの照合

タスクが決まったら `docs/initial-plan/milestones.md` を参照し、対応する `- [ ]` 項目を特定する。詳細は `.claude/rules/milestones.md` を参照。

## Step 3: ブランチ作成

```bash
git fetch origin main
git checkout -b feature/xxx origin/main
```

- ブランチ名はユーザーに確認する
- 命名規則: `feature/xxx`, `fix/xxx`, `hotfix/xxx`

## Step 4: 実装計画の策定

ユーザーと対話しながら計画を策定する:

1. タスクに関連するコードベースを Explore agent で探索
2. `docs/initial-plan/` の設計ドキュメントを参照
3. 既存コードのパターン・ユーティリティを確認
4. 実装ステップを分解
5. **依存関係を意識し、並列実行可能な塊を識別する**（`/implement` が wave として扱う単位）
6. ユーザーと合意が取れるまで対話を繰り返す

計画策定時の原則:
- 不明点は推測せずユーザーに確認する
- 客観的・批判的な意見を述べる
- 既存パターンの再利用を優先する
- **ステップ間の依存関係を明示する**

### wave（並列実行塊）の識別方針

- 編集対象ファイルが重ならない
- 依存関係（import / 参照）が一方向のみ、または無い

典型的なシナリオ:
- **wave 化しやすい**: Notion クライアント実装 ∥ Astro ページコンポーネント実装（Notion client が固まるまでモックで進められるケース）、独立した複数コンポーネントの実装
- **wave 化しづらい**: `src/lib/notion/client.ts` の型変更 → それを参照する全ページ、同一 `.astro` ファイルへの複数ステップによる書き換え

## Step 5: 計画の保存（必須）

合意した計画を **2箇所** に保存する。

### 5a. タスク計画ドキュメント

`docs/tasks/{branch-name-sanitized}.md` に保存する（スラッシュは `-` に置換）。

**テンプレート（wave あり）:**

```markdown
# {タスクタイトル}

## 概要
{タスクの目的と背景}

## ソース
{GitHub issue URL / ユーザー指示の要約}

## 実装計画

### Wave 1（並列実行）

#### Step 1: {ステップ名}
- {実装内容}
- {対象ファイル}

#### Step 2: {ステップ名}
- {実装内容}

### Wave 2（Wave 1 完了後）

#### Step 3: {ステップ名}
- {実装内容}
- 依存: Step 1 の {xxx}

## 技術的な判断メモ
- {設計判断とその理由}

## 完了条件
- [ ] {条件1}
- [ ] {条件2}
```

### 5b. current-phase.md

`.claude/current-phase.md` に保存する（セッション間引き継ぎ用）。

```markdown
# Current Phase

## タスク
- **ソース**: {GitHub issue URL / ユーザー指示}
- **概要**: {1行サマリー}
- **ブランチ**: {ブランチ名}
- **計画ドキュメント**: docs/tasks/{filename}.md

## 実装計画
- Wave 1: Step 1, Step 2（並列）
- Wave 2: Step 3

## 進捗
### Wave 1
- [ ] Step 1: {ステップ名}
- [ ] Step 2: {ステップ名}
### Wave 2
- [ ] Step 3: {ステップ名}

## 技術メモ
{次のセッションで必要な情報のみ}
```

## Step 6: 次のアクション案内

ユーザーに以下を報告:
- タスクと計画のサマリー
- ブランチ名
- 計画ドキュメントのパス
- 「`/implement` で実装を開始できます」と案内
