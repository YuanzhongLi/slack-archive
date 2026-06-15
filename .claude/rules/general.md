# 言語について

## 日本語
- チャットでの質問に対して日本語で回答する
- ドキュメントでは「ですます（丁寧語）」を**使用しない**
- ロジックや機能を説明する長い文章は日本語で記述する
- UTF-8エンコーディングを使用する

## English
- Use English for coding and coding comments
- Use English for diagrams
- Use English for short sentences

# 参考プロジェクト

-

# git branch について

## ブランチ戦略
```
feature/xxx  -->  main
```

## Pull Request ルール
- feature ブランチは `main` にマージする
- `main` への直接コミットは禁止（feature ブランチ経由）

## ブランチ命名規則
- 機能追加: `feature/xxx` または `feature/add-xxx`
- バグ修正: `fix/xxx` または `bugfix/xxx`
- 緊急修正: `hotfix/xxx`

## コミットルール
- commit message は**必ず英語**で、変更内容を簡潔に説明する

## rebase ルール
- feature ブランチで main の最新を取り込む際は `git merge main` ではなく `git rebase main` を使用する
- `git fetch origin main && git rebase origin/main` を使用する（ローカル main が古い場合の事故防止）
- rebase / squash 後、push 前に `git diff --name-only origin/main..HEAD` でスコープ外の変更が混入していないか確認する

# 情報が不足している場合

必要な情報が不足している場合は**推測せずユーザーに確認**する。特に UI デザインの意図・要件の解釈に複数の可能性がある場合・API 仕様が不明確な場合は必ず確認する。

# Makefile について

よく使うコマンドは `Makefile` にまとめる。

# 一時ファイルの保存先

Claude が作成する一時ファイルは **`.claude/tmp/`** 配下に置く（`/tmp/` は他のセッションと衝突するため使用禁止）。

# .claude/ ディレクトリの管理

`.claude/` 配下のファイルを追加・変更・削除した場合は、`.claude/README.md` も合わせて更新する。

# 開発ワークフロー

## フェーズ

1. `/dev-start` — タスク受付・計画策定・ブランチ作成
2. `/implement` — 計画に基づく実装
3. `/pre-pr-check` — 品質検証
4. `/squash-and-push` — スカッシュ + push + PR 作成
5. `/dev-complete` — PR マージ + クリーンアップ

セッション終了時は `/handover` で引き継ぎを行う。

## タスク計画ドキュメント

- 各タスクの計画は `docs/tasks/{branch-name-sanitized}.md` に保存する
- セッション間の引き継ぎは `.claude/current-phase.md` を使用する（.gitignore 対象）

## 品質チェック

- コード変更後は `make format && make lint && make typecheck && make build` を実行する
- `/pre-pr-check` は PR 前に必ず実行する

## 客観的な意見

ユーザーの方針に問題がある場合、代替案を理由とともに提示する。最終判断はユーザーに委ねる。
