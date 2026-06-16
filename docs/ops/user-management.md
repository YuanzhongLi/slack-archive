# ユーザー管理

`users` テーブルによる role-based アクセス制御の運用手順。

---

## Role 定義

| role | 閲覧 | 手動同期（/management） | ユーザー管理 | 備考 |
|---|---|---|---|---|
| `root` | ✅ | ✅ | ✅ | 削除不可。transfer-root でのみ譲渡可能 |
| `admin` | ✅ | ✅ | ✅（root 削除不可） | |
| `viewer` | ✅ | ❌ | ❌ | |

---

## 1. root ユーザーの初期作成

本番 D1 に直接 INSERT する（招待 API から root は作成できない）:

```bash
npx wrangler d1 execute slack-archive-db --remote \
  --command "INSERT INTO users (id, email, role, created_at, updated_at) \
  VALUES (lower(hex(randomblob(16))), 'your-email@example.com', 'root', datetime('now'), datetime('now'));"
```

メールアドレスは CF Access でログインする Google アカウントのものを使用する。

---

## 2. ユーザーの追加

現時点では D1 への直接 INSERT で追加する（Phase 4 で管理UI実装予定）:

```bash
npx wrangler d1 execute slack-archive-db --remote \
  --command "INSERT INTO users (id, email, role, created_at, updated_at) \
  VALUES (lower(hex(randomblob(16))), 'member@example.com', 'viewer', datetime('now'), datetime('now'));"
```

---

## 3. ユーザー一覧の確認

```bash
# 本番
npx wrangler d1 execute slack-archive-db --remote \
  --command "SELECT id, email, role, created_at FROM users ORDER BY created_at;"

# ローカル
npx wrangler d1 execute slack-archive-db --local \
  --command "SELECT id, email, role FROM users;"
```

---

## 4. ユーザーの削除

```bash
npx wrangler d1 execute slack-archive-db --remote \
  --command "DELETE FROM users WHERE email = 'member@example.com';"
```

> **注意**: root ユーザーは削除しないこと。root が0人になるとアプリ管理ができなくなる。

---

## 5. root の譲渡

**API経由**（root ユーザーとしてログインした状態で）:

```bash
# 譲渡先のユーザー ID を確認
curl -s https://<worker-url>/api/users | jq '.[] | {id, email, role}'

# root 譲渡
curl -X POST https://<worker-url>/api/users/transfer-root \
  -H "Content-Type: application/json" \
  -d '{"newRootId": "<譲渡先のid>"}'
```

実行後: 旧 root → `admin` に降格、指定ユーザー → `root` に昇格（D1 batch でアトミックに実行）。

---

## 6. ローカル開発での動作

`.dev.vars` の `DEV_USER_EMAIL` に設定したメールアドレスが `users` テーブルに存在すれば、CF Access JWT 検証をスキップする。

```bash
# ローカル D1 にユーザーを追加
npx wrangler d1 execute slack-archive-db --local \
  --command "INSERT INTO users (id, email, role, created_at, updated_at) \
  VALUES ('local-root', 'you@example.com', 'root', datetime('now'), datetime('now'));"
```

`.dev.vars` の `DEV_USER_EMAIL=you@example.com` と一致させること。

---

## トラブルシュート

| 症状 | 原因候補 | 対処 |
|---|---|---|
| ログイン後に 403 | `users` テーブルにメールが未登録 | D1 に INSERT |
| viewer が /management にアクセスできない | role が `viewer` | role を `admin` に UPDATE |
| root 譲渡後にアクセスできない | 自分が `admin` に降格した | 新 root に操作を依頼 |
