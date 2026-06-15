# Auth ルール

本プロジェクトの認証・認可に関する規約。

## 方針

- **認証基盤**: Cloudflare Access（CF Zero Trust）+ Google IdP（Everyone policy）
- **Worker 側の責務**: `CF-Access-Jwt-Assertion` header または `CF_Authorization` cookie の JWT を検証（defense-in-depth）
- **認可**: `users` テーブルの role で判定（`root` / `admin` / `viewer`）
- JWKS はモジュールレベルでキャッシュ（TTL: 5分）。kid が見つからない場合は1回だけ強制リフレッシュ

## Role 定義

| role | 閲覧 | 同期管理（/management） | ユーザー管理 | 備考 |
|------|------|------------------------|-------------|------|
| `root` | ✅ | ✅ | ✅ | 削除不可、transfer-root で譲渡可能 |
| `admin` | ✅ | ✅ | ✅（root 削除不可） | |
| `viewer` | ✅ | ❌ | ❌ | |

- role の強さ: `viewer < admin < root`
- `hasRole(user, minRole)` ヘルパーで判定する（`src/worker/middleware/auth.ts`）

## 保護対象

| path | 保護 | 実装 |
|------|------|------|
| `/api/*` | 必須 | `authMiddleware`（app.ts で一括適用） |
| `/api/health` | 不要 | 明示的に auth より前に登録 |
| `/management*` | CF edge で enforce | CF Access の path 設定。Worker code では enforce しない |

## Middleware 適用

`app.use('/api/*', authMiddleware)` で一括適用する。個別 route ファイルでは再適用しない。route handler は `c.get('user')` で認証済み identity を取得する。

## 環境変数

| 変数 | 用途 | 管理方法 |
|------|------|---------|
| `CF_ACCESS_TEAM_DOMAIN` | JWKS fetch URL の base | `wrangler secret put` |
| `CF_ACCESS_AUD` | CF Access application の audience tag | `wrangler secret put` |
| `DEV_USER_EMAIL` | local dev 専用。JWT 検証をスキップ | `.dev.vars`（production では必ず `""`） |
| `SLACK_BOT_TOKEN` | Slack API Bot Token | `wrangler secret put` |

## Root ユーザーの特別ルール

- `DELETE /api/users/:id` で root を削除しようとすると 403 を返す
- root の譲渡は `POST /api/users/transfer-root` のみ（root 本人だけが呼べる）
- transfer-root は `d1.batch()` でアトミックに実行（現 root を admin 降格 + 対象を root 昇格）
- `WHERE id = ? AND role = 'root'` で現在のユーザー ID を明示指定（role のみの WHERE は使わない）

## Local dev bypass

`DEV_USER_EMAIL` が非空かつ `CF_ACCESS_TEAM_DOMAIN` が未設定のとき JWT 検証をスキップし、その email で `users` テーブルを照合する。**production で `DEV_USER_EMAIL` を設定すると JWT 検証が完全にスキップされる。**

## アンチパターン

- ❌ 個別 route 内で `authMiddleware` を都度適用する → 抜け漏れの元
- ❌ production で `DEV_USER_EMAIL` を設定する → auth bypass
- ❌ role チェックを exclusion list で書く → 新 role 追加時に漏れる。`hasRole` を使う
- ❌ transfer-root の WHERE に `role = 'root'` のみを使う → ID 指定で意図を明確にする
