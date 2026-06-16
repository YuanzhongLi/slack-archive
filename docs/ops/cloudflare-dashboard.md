# Cloudflare ダッシュボード操作ガイド

本番環境の管理・確認で使う Cloudflare ダッシュボードの操作手順。

---

## Workers の確認

`dash.cloudflare.com` → **Workers & Pages** → `slack-archive`

| 確認項目 | 場所 |
|---|---|
| デプロイ状況 | Deployments タブ |
| Cron Triggers の設定 | Triggers タブ → Cron Triggers |
| Secrets の確認 | Settings タブ → Variables and Secrets |
| ログ（リアルタイム） | Logs タブ → Begin log stream |

---

## D1 の確認

`dash.cloudflare.com` → **Workers & Pages** → **D1** → `slack-archive-db`

| 操作 | 方法 |
|---|---|
| テーブル一覧・レコード確認 | Console タブで SQL を実行 |
| migration 履歴の確認 | `SELECT * FROM d1_migrations;` |
| ストレージ使用量 | Overview タブ |

### よく使う確認クエリ

```sql
-- 同期済みチャンネル数
SELECT count(*) FROM channels;

-- 最後に同期したチャンネルと時刻
SELECT name, last_synced_at FROM channels ORDER BY last_synced_at DESC LIMIT 5;

-- メッセージ総数
SELECT count(*) FROM messages;

-- 登録ユーザー一覧
SELECT email, role FROM users;
```

---

## CF Access の確認

`dash.cloudflare.com` → **Zero Trust** → **Access** → **Applications**

| 確認項目 | 場所 |
|---|---|
| アクセスログ | Access > Logs |
| AUD Tag | アプリ選択 → Additional settings |
| ポリシーの確認 | アプリ選択 → Policies タブ |

---

## Cron Triggers の確認

Workers の Triggers タブで Cron Triggers に `0 17 * * *`（UTC）= JST 02:00 が設定されていることを確認。

手動でCronを実行したい場合（テスト用）:

```bash
curl -X POST https://<worker-url>/api/sync \
  -H "CF-Access-Jwt-Assertion: <jwt>"  # CF Access JWT が必要
```

または管理画面の `/management` から手動同期ボタンを使う（Phase 3実装後）。
