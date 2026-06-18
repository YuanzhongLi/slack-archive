# Cost & Limits

Cloudflare の無料枠（Workers Free）で運用する場合の制限と、本プロジェクトにおける影響をまとめる。

## Workers（リクエスト処理）

> 出典: [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

| 項目 | Free | Paid（Standard） |
|------|------|-----------------|
| リクエスト数 | **100,000 / 日** | 1,000万 / 月（超過: $0.30 / 100万） |
| CPU 時間 / 呼び出し | **10 ms** | 30 秒（デフォルト）/ 5 分（最大） |
| CPU 時間 / Cron | **10 ms** | スケジュール間隔 < 1 時間: 30 秒 / ≥ 1 時間: 15 分 |
| Workers Logs 書き込み | **200,000 件 / 日** | 2,000万 / 月 |
| Logs 保持期間 | **3 日** | 7 日 |

> **CPU 時間と実行時間（wall-clock）の違い:**
> CPU 時間は Worker がコードを実際に処理している時間のみをカウントする。`fetch()` や D1 クエリの**待ち時間はカウントされない**。
> 出典: [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)

**本プロジェクトへの影響:**
- 社内ツールの用途であれば 100,000 req/日 は十分。ピーク時（大人数が同時に検索など）は注意。
- Cron の CPU 時間 10 ms は「Slack API 待ち・D1 書き込み待ちの時間は含まない」ため、実際の同期処理でも想定より制約が緩い。ただし純粋な計算処理が多い場合は超過する可能性があり、その際は Paid プランへの移行を検討する。

## D1（データベース）

> 出典: [Cloudflare D1 Limits](https://developers.cloudflare.com/d1/platform/limits/) / [D1 Pricing](https://developers.cloudflare.com/d1/platform/pricing/)

| 項目 | Free | Paid |
|------|------|------|
| **DB サイズ（1 DB）** | **500 MB** | 10 GB |
| アカウント合計ストレージ | **5 GB** | 1 TB |
| 行読み取り | **500万行 / 日** | 250億行 / 月 |
| 行書き込み | **10万行 / 日** | 5,000万行 / 月 |
| 行数 | 無制限（サイズ上限のみ） | 無制限 |
| DB 数 | **10** | 50,000 |
| Time Travel 期間 | **7 日** | 30 日 |

**500 MB でどれくらい保存できるか（目安）:**

Slack メッセージ 1 件あたりのレコードサイズは約 500–800 bytes（テキスト・インデックス含む）を想定すると:

| 想定 | 件数 |
|------|------|
| 楽観（500 B / 件） | **約 100 万件** |
| 中央値（650 B / 件） | **約 77 万件** |
| 保守的（800 B / 件） | **約 62 万件** |

小〜中規模なワークスペースであれば Free プランの範囲内で数年分のアーカイブが可能。ただし、添付ファイルのメタデータや長文メッセージが多い場合は早めにサイズを確認すること。

**書き込み制限について:**
- 初回フルインポート時は 10 万行 / 日 の制限に注意。大量メッセージを一括インポートする場合は日をまたいで実施するか Paid プランに移行する。
- 通常の差分 Sync（毎日の増分）では問題になりにくい。

## D1 ストレージ監視とアラーム

`docs/ops/alarms.md` に記載の D1 サイズアラームが **DB が 400 MB（空き容量 20%）** に達した時点で Slack へ通知する。通知を受けたら以下を検討する:

1. 古いメッセージのアーカイブ・削除
2. Workers Paid プランへのアップグレード（10 GB まで拡張）

## Cloudflare Spending Limits（予算上限）

Paid プランに移行した場合、想定外の費用増加を防ぐために Spending Limits を設定する。

1. [Cloudflare Dashboard](https://dash.cloudflare.com) にログイン
2. 左メニュー → **Workers & Pages** → **Overview**
3. **Manage** → **Billing** → **Spending Limits** を開く
4. Workers Paid の月次上限を設定（目安: $5〜$10 / 月）

> 上限に達すると Workers / D1 へのリクエストが停止し 503 が返る（データは消えない）。

> Cloudflare ダッシュボードの UI は変更されることがある。見つからない場合は [公式ドキュメント](https://developers.cloudflare.com/workers/platform/pricing/#spending-limits) を参照。

## 現在の利用状況の確認

- **Workers リクエスト数・CPU 時間**: Dashboard → Workers & Pages → 対象 Worker → **Metrics** タブ
- **D1 ストレージ・クエリ数**: Dashboard → Storage → D1 → 対象 DB → **Overview**
- **Workers Logs**: Dashboard → Workers & Pages → 対象 Worker → **Logs** タブ（3 日分）
