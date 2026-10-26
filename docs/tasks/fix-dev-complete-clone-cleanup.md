# dev-complete cleanup が clone 運用で止まる問題の修正

## 概要
`/dev-complete` の Step 4（unified cleanup）は、clone 運用（worktree が 1 つだけで feature ブランチをチェックアウト中）だと `main_path` が空になり、`git worktree remove` が失敗して chain が止まる。clone / worktree の両運用で最後まで完了するようにする。

## ソース
https://github.com/YuanzhongLi/slack-archive/issues/32

## 原因
`main_path` を「`main|master` をチェックアウトしている worktree」として求めているが、clone 運用では唯一の worktree が feature ブランチなので一致せず空になる。空のまま `cd ""`（cwd 据え置き）→ `[ "$current_path" = "" ]` が偽 → `git worktree remove` が main working tree を消そうとして失敗する。

## 実装計画

### Wave 1（単一ステップ）

#### Step 1: `main_path` の求め方とパス比較の修正
- 対象: `.claude/skills/dev-complete/SKILL.md` の Step 4 コードブロック
- `main_path` は `git worktree list --porcelain` の **先頭エントリ**（= main working tree。ブランチに依存しない）から取得する
- `current_path` / `main_path` は `pwd -P` で正規化してから比較する（symlink・末尾差異による誤判定を防ぐ）
- `main_path` が空・存在しない場合は何も破壊せず中断する guard を入れる
- `mode=clone` / `mode=worktree` の判定は正規化後のパスで行う
- Step 5 の案内文は変更なし

#### Step 2: `.claude/README.md` の確認・更新
- skill の挙動説明に変更があれば更新する（`.claude/` 管理ルール）

## 技術的な判断メモ
- `git worktree list` の先頭エントリは常に main working tree であることが git の仕様で保証されている。ブランチ名による検索は main が別 worktree にある場合しか動かない
- 検証は一時 repo（`.claude/tmp/`）で clone 運用・worktree 運用の両方を再現して行う（実リポジトリの branch は壊さない）
- Claude Code の Bash tool は zsh で動く。zsh（と /bin/sh）では `cd ""` が成功してカレントディレクトリを返すため、空値の正規化は `${var:+$(cd "$var" ...)}` で行う（bash だけで検証すると見逃す）
- `main_path` は「main をチェックアウトしている worktree」を優先し、なければ先頭エントリ（常に main working tree）にフォールバックする。clone 運用では先頭エントリに解決され、main が先頭以外の linked worktree にある配置（旧版で動いていた）も維持される
- 破壊的操作の前に 3 つの guard を置く: `main_path` が空 / feature ブランチ上にいない（detached HEAD・main 上）/ worktree 運用で main working tree が main 以外のブランチ（別作業を黙って切り替えない）。detached HEAD の worktree が `worktree remove --force` で消える経路を塞ぐ
- Step 4.0 の承認文に main への checkout と worktree 削除（未コミットの変更も破棄）を明記した
- `.claude/README.md` の `/dev-complete` 説明に「clone / worktree 両運用に対応」を追記した

## 完了条件
- [x] clone 運用（worktree 1 つ・feature チェックアウト中）で cleanup が最後まで完了し `mode=clone` が出る
- [x] worktree 運用で feature worktree が削除され `mode=worktree` が出る
- [x] `main_path` が取れない場合は破壊的操作の前に中断する
- [ ] issue #32 が PR 経由でクローズされる（PR 本文に `Closes #32`）

## 検証結果
一時 repo（bare origin + clone）で SKILL.md から抽出した実スクリプトを **bash と zsh の両方**で実行した。
- A. clone 運用（サブディレクトリ + symlink 経由 + パスに空白）: `mode=clone`、feature ブランチの local / remote 削除まで完了
- B. worktree 運用（サブディレクトリから実行）: feature worktree 削除、`mode=worktree`
- C. detached HEAD + 未コミットファイルありの worktree: 中断し、worktree と未コミットファイルは保持
- D. main 上で実行: 中断
- E. main working tree が別ブランチ（main はどこにもなし）: 中断し、feature worktree は保持
- F. main が先頭以外の linked worktree にある配置: 完了（`mode=worktree`）
- G. `git worktree list` が空を返す shim: bash / zsh ともに `main working tree not found` で中断（変更なし）
