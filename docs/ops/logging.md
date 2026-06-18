# Logging 運用

Cloudflare Workers 上の本プロジェクトにおける log の閲覧・tail・クエリ・トラブルシュート手順。

## 基盤

- **Workers Logs**: invocation logs + `console.log`（custom logs）を収集・保存
- 本プロジェクトは `src/worker/lib/logger.ts` で構造化 JSON を `console.log` に出力
- JSON は Workers Logs 側でフィールド抽出されるため、`msg` / `level` などで絞り込み可能

## 有効化（現設定）

`wrangler.toml`:

```toml
compatibility_flags = ["nodejs_compat"]

[observability]
enabled = true
```

`nodejs_compat` フラグは Workers 環境の Node.js 互換 API の利用に必要。  
必要に応じて `head_sampling_rate` を追加する（0〜1）。未指定時は 1（100%）。

## Retention

本プロジェクトは **Free プラン** を使用しており、retention は **3 日**（変更不可）。

参考: https://developers.cloudflare.com/workers/observability/logs/workers-logs/

## 閲覧方法

### 1. 保存ログ（Workers Logs）

1. <https://dash.cloudflare.com> にログイン
2. Workers & Pages → `slack-archive`
3. **Observability** を開く

### 2. リアルタイムログ（Dashboard Live）

1. Workers & Pages → `slack-archive`
2. **Logs** を開く
3. 右側ナビの **Live** を選択

### 3. リアルタイム tail（CLI）

```bash
npx wrangler tail
```

補助コマンド:

```bash
# JSON 出力を jq で確認
npx wrangler tail --format json | jq '.'

# エラー系のみ絞る
npx wrangler tail --status error

# 文字列検索
npx wrangler tail --search "sync failed"
```

主なオプション（`wrangler tail --help` で確認）:
- `--format json|pretty`
- `--status ok|error|canceled`
- `--method`
- `--search`
- `--sampling-rate`

### 4. local dev

`make dev` では `console.log` がローカル端末に直接出る。Workers Logs への保存は行わない。

## 構造化フィールド

### payload 形式

`logger` が出力する top-level フィールド:

| Key | 型 | 内容 |
|---|---|---|
| `level` | `'debug' \| 'info' \| 'warn' \| 'error'` | ログレベル |
| `msg` | string | メッセージ |
| `requestId` | string (UUID) | リクエスト単位の ID |
| `email` | string | 認証済みユーザーのメール（auth 後のログのみ） |
| `role` | string | ユーザー role（auth 後のログのみ） |

### リクエスト/レスポンスログ（全リクエストに自動付与）

```json
{ "level": "info", "msg": "POST /api/sync", "requestId": "..." }
{ "level": "info", "msg": "POST /api/sync 200", "requestId": "...", "durationMs": 142 }
```

### sync 系フィールド

| Level | 主な keys |
|---|---|
| info | `service`, `channel`, `channelCount`, `messageCount`, `newThreadParents` |
| error | `error`（message 文字列） |

## 代表的なクエリ

- 特定 request の流れ: `requestId = "..."`
- エラー一覧: `level = "error"`
- sync 処理のみ: `msg CONTAINS "sync"`
- 遅いリクエスト: `durationMs > 3000`
- 特定 path のみ: `msg CONTAINS "/api/sync"`

## コスト（Workers Logs）

| プラン | 無料枠 | 超過時 | デフォルト Retention |
|---|---|---|---|
| Free | 200,000 events / 日 | 超過分 drop | 3 日 |
| Paid | 20M events / 月 | $0.60 / 追加 1M | 7 日 |

注意:
- 1 request で invocation log 1 本 + request/response ログ 2 本 = 計 3 本が出る
- Free プランは retention 3 日・超過分は drop（変更不可）

参考: https://developers.cloudflare.com/workers/observability/logs/workers-logs/

## トラブルシュート

### production でログが見えない

1. `wrangler.toml` の `observability.enabled` が `true` か確認
2. 最新コードが deploy 済みか確認
3. `head_sampling_rate` が低すぎないか確認（必要なら 1）

### `wrangler tail` に何も出ない

1. プロジェクトルートで実行しているか確認
2. 別端末から対象 Worker に実トラフィックを流して確認

### コスト急増

1. invocation logs + request/response logs の合計本数を確認
2. `head_sampling_rate` を下げて調整（例: `0.1` で 10% サンプリング）
