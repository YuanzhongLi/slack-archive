# Lint・Format ルール

## Biome

本プロジェクトは **Biome** を lint / format ツールとして使用する。

## 基本方針

- lint error・warning は**コードを修正して解消**する。`// biome-ignore` 等の抑制コメントは使わない
- どうしても修正できない場合は理由を明記しユーザーに確認する
- format は Biome の設定に従い自動修正する

## コマンド

```bash
make format      # biome format --write（フォーマット適用）
make lint        # biome lint（エラー確認）
make lint-fix    # biome lint --write（自動修正可能なものを修正）
make typecheck   # tsc -b --noEmit
```

## TypeScript の型ルール

- `any` は使用禁止。`unknown` を使い、型ガードで絞り込む
- 型アサーション（`as`）は最小限にする
- 外部 API レスポンス（Slack API 等）の型は `src/worker/types/` に定義を集約する
- `noUnusedLocals` / `noUnusedParameters` が有効なので、使わない変数・引数は `_` prefix を付けるか削除する
