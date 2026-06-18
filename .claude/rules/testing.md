# テストルール

## テストファイルの配置

**テストファイルは必ず `src/worker/` 配下に置く。**

本プロジェクトの tsconfig は project references 構成になっており、`@cloudflare/workers-types`（`Env`、`D1Database`、`ExecutionContext` 等）は `tsconfig.worker.json` でのみ参照される。

```
tsconfig.json        → references: [app, node, worker]
tsconfig.worker.json → include: ["src/worker.ts", "src/worker/**/*.ts", ...]
tsconfig.app.json    → exclude: ["src/worker.ts", "src/worker/**"]
```

`src/worker/` 配下に置けば `@cloudflare/workers-types` の型が自動で解決される。

### NG パターン

```
src/worker.test.ts   ← src/ 直下に置くと tsconfig.app.json に拾われ Env 等が解決できない
```

### OK パターン

```
src/worker/worker.test.ts      ← scheduled.ts 等 src/worker.ts 経由のロジックのテスト
src/worker/routes/sync.test.ts ← 既存パターン
```

## `src/worker.ts` のロジックをテストする場合

`src/worker.ts` と `src/worker/` ディレクトリが同名のため、`src/worker/` 配下のテストから `../../worker` でインポートすると TypeScript の module resolution が `src/worker/` ディレクトリと衝突する。

**解決策: ロジックを `src/worker/` 配下のモジュールに切り出す。**

- `src/worker.ts` はエントリーポイント（`fetch` / `scheduled` のバインディング）のみに留める
- テスト対象のロジックは `src/worker/scheduled.ts` 等に切り出して export する
- テストはその切り出したモジュールを直接 import する

```ts
// src/worker.ts（エントリーポイントのみ）
import { runScheduled } from './worker/scheduled';
export default {
  fetch: app.fetch.bind(app),
  async scheduled(_event, env, ctx) { ctx.waitUntil(runScheduled(env)); },
};

// src/worker/scheduled.ts（テスト可能なロジック）
export async function runScheduled(env: Env): Promise<void> { ... }

// src/worker/worker.test.ts（テスト）
import { runScheduled } from './scheduled';
```

## カバレッジ設定

`vitest.config.ts` の `coverage.include` は `src/worker/**/*.ts` のみを対象としている。`src/worker.ts` 本体はエントリーポイントのみに留めることでカバレッジ対象外でも問題ない。
