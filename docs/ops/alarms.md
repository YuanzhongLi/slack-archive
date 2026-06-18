# Alarms

## 概要

cron 同期の失敗と D1 データ量超過を Slack Incoming Webhook で通知する。

## 通知タイミング

アラームは **cron 実行時（毎日 1 回、JST 翌 2:00）** にチェックされる。cron の処理順序は以下の通り:

```
1. Slack からメッセージを同期（syncAll / fullResyncAll）
2. 同期結果を syncLogs テーブルに記録
3. D1 サイズチェック → 閾値超過なら Slack 通知  ← ここ
```

D1 サイズチェックは同期完了後に実行されるため、その日の同期でデータが増えた後の最新サイズを計測できる。

## 通知条件

| アラーム | レベル | 条件 |
|---------|-------|------|
| Cron sync failed | error | `scheduled()` handler 内で例外が発生した場合 |
| D1 database size | warn | DB サイズが `D1_ALARM_SIZE_THRESHOLD_MB`（デフォルト 400 MB）以上 |

### D1 サイズアラームの繰り返し動作

閾値を超えた状態が続く限り、**毎日 cron のたびに通知が届く**。これは意図的な設計で、対応を促し続けるためのもの。通知を止めるには以下のいずれかを行う:

- 古いデータを削除して DB サイズを閾値以下に戻す
- `D1_ALARM_SIZE_THRESHOLD_MB` を引き上げる（Paid プランに移行済みの場合など）
- Paid プランへ移行して上限 10 GB に拡張する（`docs/ops/cost.md` 参照）

## Slack Incoming Webhook の設定

1. [Slack API: Your Apps](https://api.slack.com/apps) にアクセスし、対象アプリを開く（なければ新規作成）
2. **Incoming Webhooks** → **Activate Incoming Webhooks** をオン
3. **Add New Webhook to Workspace** → 通知先チャンネルを選択
4. 生成された Webhook URL（`https://hooks.slack.com/services/...`）をコピー
5. Workers の secret に登録:
   ```bash
   npx wrangler secret put SLACK_ALARM_WEBHOOK_URL
   # プロンプトに URL を貼り付けて Enter
   ```

`SLACK_ALARM_WEBHOOK_URL` が未設定の場合、アラームは送信されず Workers Logs にのみ記録される。

## D1 アラーム閾値の調整

`wrangler.toml` の `[vars]` セクションで変更できる:

```toml
[vars]
D1_ALARM_SIZE_THRESHOLD_MB = 400   # デフォルト: 400 MB（D1 free tier 上限 500 MB の 80%）
```

変更後は `npx wrangler deploy` で反映する。D1 free tier の上限は **1 DB あたり 500 MB**。Free tier の詳細は `docs/ops/cost.md` を参照。

## ローカル開発での確認

`.dev.vars` に Webhook URL を設定することで、ローカル cron 実行時にも通知を確認できる:

```
SLACK_ALARM_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
```
