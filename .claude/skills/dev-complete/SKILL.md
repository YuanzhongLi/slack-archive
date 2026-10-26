---
name: dev-complete
description: PR マージ前の最終 gate（milestones 監査を含む）+ squash merge + ローカル / worktree クリーンアップ + 次タスク準備。
---

**ultrathink**

PR マージの最終 gate として以下を実行する:

- マージ**前**に milestones 更新の監査を強制
- feature branch / worktree / remote ref のクリーンアップ

> **注意**: feature worktree 内から実行した場合、最後の cleanup で worktree を削除する時点で bash cwd が invalid になる。以降は bash tool が使えなくなるため、「破壊を含む bash を最後の 1 回に集約」という設計で統制している。次タスクは**新セッションで開始する**こと。

## 手順

### 1. PR state 確認

```bash
gh pr view --json state,number,title,mergeable,url
```

- `state: MERGED`: 既にマージ済み → Step 4.0 へ
- `state: OPEN` かつ `mergeable: MERGEABLE`: Step 2 へ
- それ以外: ユーザーに報告して中断

### 2. マイルストーン監査（マージ前、必須 gate）

```bash
git diff origin/main...HEAD -- docs/initial-plan/milestones.md
```

差分なしの場合は 3 ケースでユーザーに確認:
- (a) 既存項目の `[x]` 更新のみ
- (b) 既存 Phase への新規項目追加
- (c) 新 Phase 追加 または マイルストーン対象外（`.claude/` / docs メタ作業等）

詳細は `.claude/rules/milestones.md` を参照。

### 3.0. Merge 承認 gate（必須・単独質問）

```
PR #N "title" を squash merge します。承認しますか？
1. はい（merge する）
2. いいえ（中断）
```

**汎用承認（`ok` / `進めて`）は承認と認めない**。merge 対象が明示された動詞 or 番号選択のみ承認。

### 3. PR マージ（user が手動実行）

`.claude/settings.json` の `deny` に `Bash(gh pr merge:*)` を登録済みのため、Claude は実行できない。ユーザーに依頼する:

```
以下のコマンドをプロンプトに `!` プレフィックス付きで実行してください:

!gh pr merge <number> --squash
```

### 4.0. Cleanup 承認 gate

```
cleanup chain を実行します。
- main working tree を main に切り替えて pull
- worktree 運用の場合は feature worktree を削除（未コミットの変更も破棄）
- feature branch の local / remote ref を削除
- fetch --prune
1. 実行
2. 中断（手動 cleanup）
```

### 4. 破壊を含む unified cleanup（skill 内で最後の bash 呼び出し）

```bash
current_path=$(git rev-parse --show-toplevel)
current_path=${current_path:+$(cd "$current_path" 2>/dev/null && pwd -P)}
# Prefer the worktree that has main checked out; otherwise fall back to the first entry, which is
# always the main working tree (a clone with a single worktree on a feature branch resolves there).
# `${var:+...}` keeps an empty value empty: in zsh `cd ""` succeeds and would return the cwd.
main_path=$(git worktree list --porcelain | awk '
  /^worktree / {wt = substr($0, 10); if (first == "") first = wt}
  /^branch refs\/heads\/main$/ {m = wt}
  END {print (m != "" ? m : first)}')
main_path=${main_path:+$(cd "$main_path" 2>/dev/null && pwd -P)}
feature_branch=$(git branch --show-current)
main_branch=${main_path:+$(git -C "$main_path" branch --show-current)}

# All guards run before any destructive command.
if [ -z "$main_path" ]; then
  echo "ERROR: main working tree not found; aborting without changes"; false
elif [ -z "$feature_branch" ] || [ "$feature_branch" = main ]; then
  echo "ERROR: not on a feature branch (got '$feature_branch'); aborting without changes"; false
elif [ "$current_path" != "$main_path" ] && [ "$main_branch" != main ]; then
  echo "ERROR: main working tree is on '$main_branch', not main; aborting without changes"; false
else
  cd "$main_path" && \
  git checkout main && \
  { git pull origin main || echo "WARN: local main pull skipped"; } && \
  { [ "$current_path" = "$main_path" ] || git worktree remove --force "$current_path"; } && \
  git branch -D "$feature_branch" && \
  { git push origin --delete "$feature_branch" 2>/dev/null || true; } && \
  git fetch --prune && \
  if [ "$current_path" = "$main_path" ]; then echo "mode=clone"; else echo "mode=worktree"; fi && \
  echo "cleanup done"
fi
```

### 5. 次セッション案内（text only）

- マージ済み PR の番号 + URL
- `mode=clone` の場合: そのまま `/dev-start` で次タスクを開始してよい
- `mode=worktree` の場合: 新セッションを main clone から起動して `/dev-start` を実行
