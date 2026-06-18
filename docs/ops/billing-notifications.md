# Billing & Notifications

Cloudflare ダッシュボードで設定する課金・通知の手順。

---

## Spending Limits（Paid プラン移行後に設定）

Workers Paid（$5/月〜）に移行すると、上限を超えた分が従量課金される。
Spending Limits を設定することで想定外の費用増加を防げる。

> Free プランでは Spending Limits は設定不可（課金が発生しないため）。

### 設定手順

1. [Cloudflare Dashboard](https://dash.cloudflare.com) にログイン
2. 左メニュー → **Workers & Pages** → **Overview**
3. 右上の **Manage** → **Billing** → **Spending Limits**
4. Workers / D1 それぞれの月次上限を設定

推奨値（本プロジェクトの目安）:

| サービス | 推奨上限 | 備考 |
|---------|---------|------|
| Workers | $5 / 月 | 社内ツール用途。100万 req/月超えなければ $0.30 未満 |
| D1 | $1 / 月 | 通常の差分 Sync では超過しない |

> 上限到達時: Workers / D1 へのリクエストが停止し 503 が返る（データは消えない）。
> 上限を上げるか、月次リセットを待てば復旧する。

### 参考

- [公式ドキュメント — Spending Limits](https://developers.cloudflare.com/workers/platform/pricing/#spending-limits)
- コスト詳細は `docs/ops/cost.md` を参照

---

## Cloudflare Notifications（ダッシュボードからのメール通知）

コード側の Slack アラーム（`docs/ops/alarms.md`）とは別に、Cloudflare ダッシュボード自体の通知を設定できる。

> **Free プランでは設定可能な通知タイプが限られており、現時点では設定不要。**
> Paid 移行後に以下を設定することを推奨。

### Paid 移行後に設定する通知タイプ

| 通知タイプ | 用途 |
|-----------|------|
| **Workers Usage Report** | 週次でリクエスト数・CPU 時間をメール通知 |
| **Billing Usage Alert** | 設定した使用量に達したらアラート |

### 設定手順（Paid 移行後）

1. [Cloudflare Dashboard](https://dash.cloudflare.com) にログイン
2. 左メニュー → **Notifications**（アカウント直下）
3. **Add** → 通知タイプを選択

> **注意**: Cloudflare Dashboard の UI は変更されることがある。見つからない場合は [公式ドキュメント](https://developers.cloudflare.com/notifications/) を参照。
