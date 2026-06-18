# D1 Backup & Time Travel

D1 の Time Travel（ポイントインタイムリストア）の概要と運用手順。

---

## Time Travel とは

D1 はデータの変更履歴を自動的に保持しており、一定期間内の任意の時点に DB を復元できる。
追加費用なし・追加設定なし（デフォルトで有効）。

| プラン | 保持期間 |
|-------|---------|
| Free | 7 日 |
| Paid | 30 日 |

---

## リストア手順

### 1. 利用可能なブックマーク（タイムスタンプ）を確認

```bash
npx wrangler d1 time-travel info slack-archive-db
```

### 2. 特定の時点にリストア（dry-run で確認してから実行）

```bash
# dry-run（実際には変更しない）
npx wrangler d1 time-travel restore slack-archive-db \
  --timestamp="2025-01-01T00:00:00Z" \
  --json

# 実際にリストア
npx wrangler d1 time-travel restore slack-archive-db \
  --timestamp="2025-01-01T00:00:00Z"
```

> **注意**: リストアはその時点の状態に**上書き**する。現在のデータは失われるため、必ず dry-run で確認してから実行する。

### 3. ブックマーク ID でリストア（特定のタイムスタンプがわかっている場合）

```bash
npx wrangler d1 time-travel restore slack-archive-db \
  --bookmark="<bookmark-id>"
```

---

## よくある用途

| シナリオ | 手順 |
|---------|------|
| 誤って大量データを削除した | `time-travel restore` で削除前の時点に戻す |
| migration が失敗して DB が壊れた | migration 実行前の timestamp でリストア |
| テストデータを誤って本番に投入した | 投入前の timestamp でリストア |

---

## 参考

- [公式ドキュメント — D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- D1 の容量・制限については `docs/ops/cost.md` を参照
