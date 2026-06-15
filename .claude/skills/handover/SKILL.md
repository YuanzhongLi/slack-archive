---
name: handover
description: セッション終了時に作業内容を記録し、次セッションへの引き継ぎを行う
allowed-tools: Read, Write, Bash, Glob, Grep
---

# セッション引き継ぎ

## 1. セッションの変更内容を収集

```bash
git log --oneline -10
git diff --stat HEAD~10
git status --short
```

## 2. current-phase.md を更新

`.claude/current-phase.md` を最新状態に上書き更新する:

- 進捗チェックボックスを実態に合わせて更新
- 技術メモに今回のセッションで判明した重要事項を記録
- 残タスク・次のアクションを明確に記載
- ブロッカーや注意点があれば記載

## 3. タスク計画ドキュメントの更新

`docs/tasks/{branch-name}.md` が存在する場合:

- 「技術的な判断メモ」セクションに今回の判断を追記
- 「完了条件」のチェックボックスを更新
- 実装計画に変更があった場合はステップを修正

## 4. マイルストーン進捗差分の確認

```bash
git diff origin/main...HEAD -- docs/initial-plan/milestones.md
```

差分がある場合は引き継ぎ報告に含める。差分がなく完了作業がマイルストーン項目を満たしそうな場合は更新漏れの可能性を明記する。

## 5. ユーザーへの報告

- 今回の成果サマリー
- 残タスクと次にやるべきこと
- 次セッションでの注意点
- 次セッション開始時のコマンド案内:
  - 計画済みタスクの続き → `/implement`
  - 新規タスク → `/dev-start`

## 注意

- current-phase.md は最新状態に上書き更新する（履歴蓄積しない）
- docs/tasks/ のドキュメントは追記 OK（git tracked なので履歴は git に残る）
