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
| D1 database size report | info | `D1_SIZE_REPORT_ENABLED = "true"` かつ閾値未満（毎 cron で定期レポート） |
| D1 database size alert | warn | DB サイズが `D1_ALARM_SIZE_THRESHOLD_MB`（デフォルト 400 MB）以上 |

### D1 サイズ定期レポート（監視用）

`wrangler.toml` の `D1_SIZE_REPORT_ENABLED = "true"` を設定すると、毎 cron 実行時に現在の DB サイズを Slack に通知する。データ量の増加傾向を監視したい期間に有効にする。

```toml
[vars]
D1_SIZE_REPORT_ENABLED = "true"   # "true" で有効 / "false" または削除で無効
```

監視が不要になったら `"false"` に変更するか行ごと削除して `npx wrangler deploy` を実行する。

### D1 サイズアラームの繰り返し動作

閾値を超えた状態が続く限り、**毎日 cron のたびに warn 通知が届く**。これは意図的な設計で、対応を促し続けるためのもの。通知を止めるには以下のいずれかを行う:

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

## セットアップ例

| 項目 | 値 |
|------|---|
| Slack App | 任意の名前（例: `slack-archive`）|
| 通知チャンネル | 任意の通知用チャンネル（プライベートチャンネル推奨）|
| `SLACK_ALARM_WEBHOOK_URL` | `wrangler secret put SLACK_ALARM_WEBHOOK_URL` で登録する |

Webhook URL 自体はセキュリティのためここには記載しない。再確認・再登録が必要な場合は [Slack API: Your Apps](https://api.slack.com/apps) → 対象アプリ → Incoming Webhooks から確認する。

## D1 サイズの取得方法

D1 のデータベースサイズは、任意のクエリ結果に含まれる **`meta.size_after`** フィールドから取得する。

> 出典: [Cloudflare D1 — Return object](https://developers.cloudflare.com/d1/worker-api/return-object/)
> `size_after: number` — the size of the database after the query is successfully applied

`PRAGMA page_count` や `dbstat` 仮想テーブルは D1 では許可されていない（`SQLITE_AUTH`）。`meta.size_after` を使うことで PRAGMA なしに正確な DB サイズを取得できる。

## D1 アラーム閾値の調整

`wrangler.toml` の `[vars]` セクションで変更できる:

```toml
[vars]
D1_ALARM_SIZE_THRESHOLD_MB = 400   # デフォルト: 400 MB（D1 free tier 上限 500 MB の 80%）
```

変更後は `npx wrangler deploy` で反映する。D1 free tier の上限は **1 DB あたり 500 MB**。Free tier の詳細は `docs/ops/cost.md` を参照。

## ローカル開発でのアラーム動作確認

`.dev.vars` に以下を設定することで、ローカルから手動 sync を実行してアラームが届くか確認できる:

```
SLACK_ALARM_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
# 閾値を 0 にすると DB サイズに関わらず常にアラームが発火する
D1_ALARM_SIZE_THRESHOLD_MB=0
```

確認手順:
1. `.dev.vars` に上記を設定して `npm run dev` を起動
2. 別ターミナルで cron を手動トリガーする:
   ```bash
   curl "http://localhost:5173/__scheduled?cron=0+17+*+*+*"
   ```
3. Slack の通知チャンネルにアラームが届くことを確認
4. 確認後は `.dev.vars` の `D1_ALARM_SIZE_THRESHOLD_MB=0` の行を削除する

> アラームは cron handler 内でのみ発火する。`/management` の Sync ボタン（`POST /api/sync`）では発火しない。
