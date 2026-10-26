# D1 size report frequency

## 概要
`D1_SIZE_REPORT_ENABLED`（true/false）を廃止し、`D1_SIZE_REPORT_FREQUENCY` に置き換える。
D1 サイズの定期 info レポートを、毎日 / 毎週 / 毎月 / 通知なしから選べるようにする。
値が不正な場合は build 時の validation で失敗させる。

## ソース
ユーザー指示（/dev-start 引数）

| 値 | 通知タイミング（JST 基準） |
|----|---------------------------|
| `Month` | 毎月 1 日 |
| `Week` | 日曜 |
| `Day` | 毎日（従来の `ENABLED="true"` と同じ） |
| `None` | 通知しない |

## 実装計画

### Wave 1（並列実行）

#### Step 1: 判定ロジックの切り出し
- `src/worker/lib/d1SizeReport.ts` を新設
  - `D1_SIZE_REPORT_FREQUENCIES = ['Month', 'Week', 'Day', 'None'] as const`
  - `parseD1SizeReportFrequency(value: unknown)`: 完全一致のみ許可。不正値は `null`
  - `shouldSendD1SizeReport(frequency, now: Date)`: now を JST (UTC+9) に変換して Month=1日 / Week=日曜 / Day=常に true / None=false
- `src/worker/lib/d1SizeReport.test.ts`: JST 境界（UTC 15:00 前後、月初・日曜）を含むテスト

#### Step 2: build 時 validation
- `wrangler.toml` の `[vars]` を読んで `D1_SIZE_REPORT_FREQUENCY` を検証するスクリプトを追加（`scripts/validate-env.ts`）
- 未設定・不正値・大文字小文字違いは exit 1 + エラーメッセージ
- 判定は Step 1 の `parseD1SizeReportFrequency` を再利用
- `package.json` の `build` の先頭で実行（`tsc -b` より前）

### Wave 2（Wave 1 完了後）

#### Step 3: scheduled.ts への組み込み
- `D1_SIZE_REPORT_ENABLED === 'true'` 判定を `shouldSendD1SizeReport(parse(env.D1_SIZE_REPORT_FREQUENCY), now)` に置換
- runtime で不正値・未設定の場合は None 扱い + `logger.warn`
- `src/worker/worker.test.ts` を FREQUENCY ベースに書き換え（Day/Week/Month/None/不正値/未設定）

#### Step 4: 設定・型・ドキュメント
- `wrangler.toml`: `D1_SIZE_REPORT_ENABLED` 削除、`D1_SIZE_REPORT_FREQUENCY = "Month"`（毎月 1 日に通知）を追加
- `npx wrangler types` で `worker-configuration.d.ts` 再生成
- `docs/ops/alarms.md` / `docs/ops/env.md` を更新

## 技術的な判断メモ
- `wrangler.toml` の `[vars]` は deploy 時に本番へ反映される平文変数。本番値の source of truth なので validation 対象はこれだけ。`.dev.vars` はローカル上書きのため対象外
- 値は完全一致のみ（`month` 等は不可）。build で落とすので曖昧さを残さない
- runtime では throw せず None 扱い。cron 全体（同期・warn アラーム）を壊さないため
- JST 判定は `Date` を +9h して `getUTC*` で読む（Workers の TZ は UTC）。cron は UTC 17:00 = JST 翌 2:00 なので日付境界の影響はないが、テストでは境界を明示する
- 閾値超過の warn は frequency に関係なく毎日（従来どおり）
- milestones.md: メタ作業ではなく運用機能だが既存項目（Slack Webhook アラーム通知）の範囲内。実装時に追記要否を判断

## 完了条件
- [x] `D1_SIZE_REPORT_ENABLED` がコード・設定・ドキュメントから消えている
- [x] 4 値それぞれで通知有無が仕様どおり（JST 基準）
- [x] 不正値・未設定で `npm run build` が失敗する
- [x] `make format && make lint && make typecheck && make build` と test が通る
