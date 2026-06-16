---
name: squash-and-push
description: git のコミットをスカッシュしてリモートにプッシュする。1 PR に対して 1 コミットの状態を保ち、レビューを簡潔にする。
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, AskUserQuestion
---

# Squash and Push

**ultrathink**

以下の手順を実行して、現在の作業ブランチのコミットをスカッシュしてリモートにプッシュする。
commit message は**必ず英語**で、変更内容を簡潔にまとめること。

例:
```
feat: add country-specific news pages with Notion CMS integration

- Add /jp/ and /au/ pages with getStaticPaths from COUNTRY_DB_MAP
- Implement news list and detail pages with notion-blocks rendering
- Add i18n resources for ja and en locales
```

## 手順

### 1. 未コミットの変更をコミット

現在ある追加、変更、削除を commit する（`.claude/`, `.github/`, `.gitignore` 等の dot ファイルも含める）。

### 2. origin/main を最新に取得

```bash
git fetch origin main
```

### 3. rebase（必要な場合）+ 自動判定

```bash
BEFORE=$(git rev-parse HEAD)
git rebase origin/main
AFTER=$(git rev-parse HEAD)
if [ "$BEFORE" != "$AFTER" ]; then
  echo "REBASE_HAPPENED=true"
else
  echo "REBASE_HAPPENED=false"
fi
```

conflict が発生した場合は解消してから再実行する。

### 3.5. Pre-PR チェック（GATE）

**⛔ GATE: 必ず `AskUserQuestion` ツールを呼び出してユーザーの回答を得てから Step 4 に進む。**

`REBASE_HAPPENED` の値に応じてコメントを添えた上で `AskUserQuestion` を呼び出す:

- `REBASE_HAPPENED=true`: 「rebase でコミット履歴が書き換わったため確認を推奨します。`/pre-pr-check を実行しますか？`」
- `REBASE_HAPPENED=false`: 「`/pre-pr-check を実行しますか？`」

### 4. スカッシュ

```bash
git reset --soft origin/main
git commit -m "feat: ..."
```

### 5. スコープ検証（push 前に必須）

```bash
git diff --name-only origin/main..HEAD
git diff --diff-filter=D --name-only origin/main..HEAD
```

### 6. push 直前の origin/main 再検証（必須）

```bash
git fetch origin main
git merge-base --is-ancestor origin/main HEAD && echo "OK" || echo "NG: re-rebase needed"
```

### 7.0. Force push 承認 gate（`REBASE_HAPPENED=true` の場合のみ）

**⛔ GATE: `AskUserQuestion` で承認を得てから push する。**

### 7. リモートリポジトリにプッシュ

- `REBASE_HAPPENED=true` で承認済みの場合のみ `--force-with-lease` で push
- `-f` / `--force` は `.claude/settings.json` の `deny` でブロック済み

### 8. PR を作成する（既にあるなら更新する）

- PR の base branch は `main`
- PR body は `docs/tasks/{branch-name}.md` を元に生成
- **PR body は必ず `--body-file` 経由で渡す**（一時ファイルは `.claude/tmp/pr-body.md` に固定）

```bash
gh pr create --title "..." --body-file .claude/tmp/pr-body.md
```
