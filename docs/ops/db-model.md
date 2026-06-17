# DB Model

## SQLite バージョン

D1 の実行基盤 [cloudflare/workerd](https://github.com/cloudflare/workerd) は **SQLite 3.47.0** を使用する。

- ソース: `workerd/MODULE.bazel` の `url = "https://sqlite.org/2024/sqlite-src-3470000.zip"`
- ビルドフラグ: `build/BUILD.sqlite3` に `SQLITE_ENABLE_FTS5` が明示されている

## テーブル一覧

| テーブル | 概要 |
|---------|------|
| `users` | アプリ認可ユーザー（role: root / admin / viewer） |
| `channels` | 同期済み Slack チャンネル |
| `slack_users` | 同期済み Slack ユーザー |
| `messages` | チャンネルのトップレベルメッセージ |
| `threads` | スレッド返信 |
| `sync_logs` | 同期実行履歴 |

## インデックス

| テーブル | インデックス | カラム | 用途 |
|---------|------------|--------|------|
| `channels` | `idx_channels_slack_id` | `slack_channel_id` | Slack ID → DB ID 変換 |
| `slack_users` | `idx_slack_users_slack_id` | `slack_user_id` | Slack ID → DB ID 変換 |
| `messages` | `uniq_messages_channel_ts` (unique) | `(channel_id, slack_ts)` | 重複挿入防止・ページング |
| `messages` | `idx_messages_thread_ts` | `thread_ts` | スレッド親メッセージ検索 |
| `threads` | `uniq_threads_channel_ts` (unique) | `(channel_id, slack_ts)` | 重複挿入防止 |
| `threads` | `idx_threads_parent_ts` | `(channel_id, parent_ts)` | スレッド返信一覧取得 |

---

## メッセージ検索の実装方針

### 現在の実装: LIKE クエリ

```sql
SELECT ... FROM messages
LEFT JOIN channels ON messages.channel_id = channels.id
LEFT JOIN slack_users ON messages.user_slack_id = slack_users.slack_user_id
WHERE messages.text LIKE '%keyword%'
ORDER BY messages.slack_ts DESC
LIMIT 20 OFFSET 0;
```

**特性:**
- `LIKE '%keyword%'` は先頭ワイルドカードのためインデックスが使えない → フルスキャン
- データ量が少ない間（〜10万件）は数十 ms で実用的
- 日本語・英語ともに動作する

**限界の目安:**

| メッセージ数 | 想定レスポンス |
|---|---|
| ~10 万件 | 数十 ms（実用的） |
| ~100 万件 | 数百 ms〜1 秒 |
| ~1,000 万件 | タイムアウトの可能性 |

---

## FTS5 への移行（将来）

### FTS5 を選ぶ理由

SQLite FTS5 は転置インデックスにより O(log n) 検索が可能。LIKE フルスキャンと異なり、データ量が増えても検索速度が劣化しない。

D1 は FTS5 を公式サポートしている（[Cloudflare D1 — SQL statements](https://developers.cloudflare.com/d1/sql-api/sql-statements/)）。

### trigram トークナイザーを使う理由

FTS5 のデフォルトトークナイザー（unicode61）はスペース区切りを前提とするため、日本語が 1 トークンになり検索が機能しない。

`trigram` トークナイザーは連続する 3 文字を 1 トークンとして扱うため、日本語・英語ともに部分一致検索が可能。

**トレードオフ:**
- インデックスサイズが unicode61 の 3〜5 倍になる
- 3 文字未満のクエリはヒットしない

**D1 での動作確認（公式ソースより）:**

- trigram は SQLite 3.34.0（2020-12-01）で追加
  - ソース: [SQLite 3.34.0 リリースノート](https://www.sqlite.org/releaselog/3_34_0.html) — "Enhanced FTS5 to support trigram indexes"
- D1 は SQLite 3.47.0 を使用（3.47.0 > 3.34.0）→ trigram 利用可能
  - ソース: [cloudflare/workerd — MODULE.bazel](https://github.com/cloudflare/workerd/blob/main/MODULE.bazel)
- `SQLITE_ENABLE_FTS5` がビルドフラグに明示
  - ソース: [cloudflare/workerd — build/BUILD.sqlite3](https://github.com/cloudflare/workerd/blob/main/build/BUILD.sqlite3)

### ストレージ試算

| 規模 | messages.text | FTS5 追加分 | D1 Free tier（5GB）内 |
|------|-------------|------------|----------------------|
| 10 万件 | ~10 MB | ~20 MB | ✅ |
| 100 万件 | ~100 MB | ~200 MB | ✅ |
| 1,000 万件 | ~1 GB | ~2 GB | ✅ |

金銭的なコスト増はほぼゼロ。

### 移行手順

#### Step 1: マイグレーションファイルを追加

```sql
-- FTS5 仮想テーブル（trigram トークナイザー）
CREATE VIRTUAL TABLE messages_fts USING fts5(
  text,
  content=messages,
  content_rowid=rowid,
  tokenize='trigram'
);

-- 既存データを一括インデックス化
INSERT INTO messages_fts(rowid, text) SELECT rowid, text FROM messages;

-- INSERT トリガー
CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;

-- DELETE トリガー
CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

-- UPDATE トリガー
CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
  INSERT INTO messages_fts(messages_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO messages_fts(rowid, text) VALUES (new.rowid, new.text);
END;
```

#### Step 2: API クエリを書き換える（`src/worker/routes/search.ts` の1箇所のみ）

LIKE クエリ:
```ts
// before
.where(like(messages.text, `%${q}%`))
```

FTS5 クエリ:
```ts
// after — Drizzle は FTS5 をネイティブサポートしないため sql`` タグを使う
import { sql } from 'drizzle-orm';

const rows = await db
  .select({ ... })
  .from(sql`messages_fts`)
  .innerJoin(messages, sql`messages.rowid = messages_fts.rowid`)
  .leftJoin(...)
  .where(sql`messages_fts MATCH ${q}`)
  .orderBy(desc(messages.slackTs))
  .limit(limit)
  .offset(offset);
```

#### Step 3: ローカル確認

```bash
make db-reset   # FTS5 テーブル・トリガー込みで再構築
make build
```

#### Step 4: リモート反映

```bash
make db-migrate-remote
```

> pre-release 期間中は `make db-reset` で全て再構築できる。
> post-release 後は既存データの一括インデックス化（Step 1 の `INSERT INTO messages_fts SELECT ...`）の実行時間を考慮すること（100 万件で数十秒程度）。

### 参考ドキュメント

- [Cloudflare D1 — SQL statements (FTS5)](https://developers.cloudflare.com/d1/sql-api/sql-statements/)
- [Cloudflare D1 — Import / Export (virtual table の記載)](https://developers.cloudflare.com/d1/build-with-d1/import-export-data/)
- [cloudflare/workerd — build/BUILD.sqlite3](https://github.com/cloudflare/workerd/blob/main/build/BUILD.sqlite3)
- [cloudflare/workerd — MODULE.bazel](https://github.com/cloudflare/workerd/blob/main/MODULE.bazel)
- [SQLite 3.34.0 リリースノート](https://www.sqlite.org/releaselog/3_34_0.html)
- [SQLite FTS5 — trigram tokenizer](https://www.sqlite.org/fts5.html#the_trigram_tokenizer)
