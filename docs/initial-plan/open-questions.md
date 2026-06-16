# 未決事項・要調査項目

## 未決事項

| # | 項目 | 背景 | 仮の判断 | 期限 |
|---|------|------|---------|------|
| 1 | Cron Triggersの最小実行間隔 | 無料枠での制約確認が必要 | 1時間ごとで設計 | Phase 1 |
| 2 | `/management`での自動同期スケジュール設定の範囲 | UIからCron式を変更できるか、それともWorker環境変数で制御するか | 環境変数（`CRON_INTERVAL`）で制御し、変更はwrangler経由と仮置き | Phase 3 |
| 3 | DM・プライベートチャンネルの扱い | 権限スコープ（`channels:history` vs `groups:history`）が異なる | 今回はスコープ外 | Phase 5以降 |
| 4 | Slack Bot Tokenのスコープ | 必要な最小スコープの確定 | `channels:read`, `channels:history`, `users:read`, `conversations:replies` を仮置き | Phase 2開始前 |

## 要調査項目

- [ ] Cloudflare Cron Triggers 無料枠の制約（実行回数・間隔の上限）
- [ ] Drizzle ORM の D1 upsert パターン（大量メッセージの効率的なバルクupsert）
- [ ] CF Access JWT検証ライブラリの最新対応状況（air-volleyballの実装を参照）
- [ ] Slack APIの`conversations.history`のページネーション上限（1回あたり最大1000件）

## 補足メモ

- 1プロジェクト = 1ワークスペース運用。新しいワークスペースが必要な場合はリポジトリをcloneしてSecrets（`SLACK_BOT_TOKEN`等）を差し替える
- CF Accessは"Everyone" policy（Googleアカウントで認証済みなら通過）。実際のアクセス制御はWorker側`users`テーブルで管理
- air-volleyball の `.claude/` 設定（rules/skills/agents）を参考にして本プロジェクトの `.claude/` を整備する
