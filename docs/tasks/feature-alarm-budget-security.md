# Alarm / Budget / Security 追加

## 概要
本番運用に必要なアラーム通知・予算管理・セキュリティ強化を追加する。

## ソース
ユーザー指示（alarm設定, budget上限, security対策）

## 実装計画

### Wave 1（並列）

#### Step 1: Slack Webhook 通知サービス
- `src/worker/services/alarm/slackWebhook.ts` を新規作成
- `SLACK_ALARM_WEBHOOK_URL` へ POST するシンプルな関数
- メッセージフォーマット: error レベルは `:red_circle:` 付き

#### Step 2: セキュリティヘッダー middleware
- `src/worker/middleware/securityHeaders.ts` を新規作成
- X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy, CSP (最小限) を付与

### Wave 2（Wave 1 完了後）

#### Step 3: cron 失敗アラーム + D1 サイズチェック統合
- `src/worker.ts` の scheduled handler に Webhook 通知を追加
- sync 失敗時に Slack へアラーム送信
- D1 サイズチェック: `PRAGMA page_count * page_size` で DB サイズを取得し `D1_ALARM_SIZE_THRESHOLD_MB`（デフォルト 400 MB）超過でアラーム
- 依存: Step 1 の slackWebhook.ts

#### Step 4: securityHeaders middleware 適用
- `src/worker/app.ts` に securityHeaders middleware を追加
- 依存: Step 2 の securityHeaders.ts

#### Step 5: 環境変数追加
- `src/worker/env.d.ts` に `SLACK_ALARM_WEBHOOK_URL?: string` 追加
- `wrangler.toml` の `[vars]` に `D1_ALARM_SIZE_THRESHOLD_MB = 400` 追加

### Wave 3（Wave 2 完了後）

#### Step 6: alarms ドキュメント
- `docs/ops/alarms.md` を新規作成
- Slack Incoming Webhook 設定手順・閾値説明

#### Step 7: budget ドキュメント
- `docs/ops/cost.md` を新規作成（旧 budget.md → cost.md に改名）
- Cloudflare Spending Limits 設定手順・Free tier 制限詳細

## 技術的な判断メモ
- Budget はコードで制御せず Cloudflare Dashboard の Spending Limits に委ねる
- Webhook URL がない（未設定）場合はアラームをスキップ（ログのみ出力）
- セキュリティヘッダーはまず最小限で、CSP は self のみ
- D1 閾値は wrangler.toml vars で調整可能にする

## 完了条件
- [x] cron 失敗時に Slack Webhook へ通知が飛ぶ
- [x] D1 サイズ（PRAGMA）が閾値 400 MB 超過時に Slack Webhook へ通知が飛ぶ
- [x] セキュリティヘッダーが全 API レスポンスに付与される
- [x] SLACK_ALARM_WEBHOOK_URL の設定手順が docs に記載される
- [x] Cloudflare Spending Limits の設定手順・Free tier 制限詳細が docs/ops/cost.md に記載される
- [x] make format && make lint && make typecheck && make build が通る
