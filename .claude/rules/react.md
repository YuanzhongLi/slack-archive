# React Best Practices

## データ取得は useEffect を使わない

**useEffect でのデータ取得は原則禁止**（race condition、cleanup 漏れ、重複リクエスト）。

データ取得には fetch + state の組み合わせではなく、将来的に SWR 等のライブラリ導入を検討する。Phase 3 UI 実装時に判断する。

## useEffect を使う場面

外部システムとの同期のみ:
- DOM 要素への非 React 的な処理（チャートライブラリの init 等）
- `window` / `document` イベントの subscribe

## 避けるべき典型的 anti-pattern

1. **props から state を導出する** → NG: `useEffect(() => setState(derived), [x])` → OK: レンダー時に計算するだけ
2. **イベントハンドラの処理を useEffect に入れる** → NG: `useEffect(() => { if (submitted) action() }, [submitted])` → OK: イベントハンドラ内で実行
3. **list の key に index を使う** → OK: stable で unique な ID を使う

## API 呼び出しのパターン

- レスポンスは必ず `response.ok` をチェックしてからパースする
- 型は `as Promise<T>` でキャストする（`r.json<T>()` は Workers 専用 API）

```ts
const data = await fetch('/api/xxx')
  .then(r => {
    if (!r.ok) throw new Error('Request failed');
    return r.json() as Promise<MyType>;
  });
```

## カスタム hook の置き場

| ケース | 置き場 |
|-------|--------|
| 特定コンポーネント専用 | そのコンポーネントと同ディレクトリ（co-location） |
| 複数箇所で共有 | `src/client/hooks/` |
| React import なし純関数 | `src/client/lib/` |

## その他

- `useMemo` / `useCallback` は実測で遅くなった時だけ使う
- コンポーネントは同じ props / state で同じ JSX を返す純粋関数として書く
