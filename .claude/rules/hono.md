# Hono ルール

本プロジェクトは Cloudflare Workers with Static Assets 上で [Hono](https://hono.dev) を使用する。
`src/worker.ts` をエントリーポイントとし、`src/worker/app.ts` でルーティングを集約する。

## route ファイル分割規約

**1 エンドポイント群 = 1 ファイル** に分割し、`src/worker/app.ts` で集約する。

```ts
// src/worker/routes/channels.ts
const router = new Hono<{ Bindings: Env; Variables: { user: User } }>();
router.get('/', handler);
router.get('/:id/messages', handler);
export default router;

// src/worker/app.ts
app.route('/api/channels', channelsRouter);
```

- path の共通 prefix は `app.route('/api/xxx', router)` で一括適用
- `Env` 型は `wrangler types` で自動生成（`worker-configuration.d.ts`）。**手動で書かない**
- Secrets（`CF_ACCESS_TEAM_DOMAIN` 等）は `src/worker/env.d.ts` で interface merging で拡張する

## 入力バリデーション

Zod の `safeParse` で検証し、失敗時は 400 を返す。

```ts
const parsed = schema.safeParse(await c.req.json<unknown>());
if (!parsed.success) {
  return c.json({ status: 'error', message: parsed.error.issues.map(i => i.message).join(', ') }, 400);
}
```

リクエストボディは必ず `c.req.json<unknown>()` で取得し、Zod で検証してから使う（型アサーションで直接キャストしない）。

## エラーハンドリング

route 内で try/catch を書く場合は以下のパターンに統一する:

```ts
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  return c.json({ status: 'error', message: msg }, 500);
}
```

## Cron handler

`src/worker.ts` の `scheduled()` メソッドで定義し、`ctx.waitUntil()` で非同期処理を完了まで待機する:

```ts
async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  ctx.waitUntil(handleCron(env));
}
```

## アンチパターン

- ❌ `src/worker/app.ts` に全 route を直書きする → 肥大化
- ❌ `Env` 型を手書きする（`worker-configuration.d.ts` 外に定義する）→ `wrangler types` と同期ずれ
- ❌ `c.req.json<ConcreteType>()` で直接型付けして Zod を省く → unsafe
- ❌ `new Hono()`（Bindings 型なし）で初期化 → `c.env` が `any` になる
