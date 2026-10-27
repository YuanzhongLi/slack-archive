# GitHub Actions を最新 major に更新

## 概要
`actions/checkout@v4` / `actions/setup-node@v4` は Node 20 runtime の action で、GitHub が Node 20 の action runtime を廃止する方向のため、最新 major に更新する。issue #33 の項目 2。

## ソース
https://github.com/YuanzhongLi/slack-archive/issues/33（項目 2）

issue には「v5 以降」と書いたが、調査時点の最新は `actions/checkout` v7.0.1 / `actions/setup-node` v7.1.0。v5 は更新直後に再更新が必要になるため、最新 major（v7）を採用する（ユーザー承認済み）。

## 実装計画

### Wave 1（単一ステップ）

#### Step 1: action のバージョン更新
- `.github/workflows/ci.yml`: `actions/checkout@v4` → `@v7`、`actions/setup-node@v4` → `@v7`
- `.github/workflows/deploy.yml`: 同上
- 使い方（`node-version-file: '.node-version'` / `cache: 'npm'`）は変更しない
- 対象は計 4 行

#### Step 2: `.claude/README.md` の確認
- workflows を説明している箇所があれば更新する（`.claude/` 配下は変更しない見込み）

## 技術的な判断メモ
- v4 → v7 で飛ばす major の変更点（release notes 確認済み）と、本 repo への影響:
  - setup-node v5: node24 runtime（runner v2.327.1 以上が必要）、`package.json` の `packageManager` から cache を自動有効化 → GitHub-hosted runner 利用、`packageManager` 未設定、`cache: 'npm'` は明示済みで影響なし
  - setup-node v6: 自動 cache の対象を npm に限定 → 影響なし
  - setup-node v7: ESM 化、ダミー `NODE_AUTH_TOKEN` の export 削除、cache 出力追加。v7.1.0 で mise.toml 対応、`node-version-file` の絶対パス対応、Node バージョン検証とマニフェスト取得のリトライ追加 → `registry-url` 未使用で影響なし
  - checkout v6: 認証情報を別ファイルに保存 → git push をしないので影響なし。v7: `pull_request_target` / `workflow_run` での fork PR checkout をブロック → どちらのトリガーも未使用で影響なし
  - 両 action とも `runs.using: node24`（Node 20 runtime を脱する）。`v7` タグは v7.0.1 / v7.1.0 と同一 SHA を指す
- `ci.yml` の `paths` に `.github/workflows/**` が含まれるため、この PR で CI が起動し、checkout / setup-node / `npm ci` の v7 動作を実際に確認できる
- `deploy.yml` は `workflow_dispatch` のみで、実行すると本番へ D1 migration と deploy が走る。PR の検証目的では実行しない。deploy の checkout / setup-node / `npm ci` ブロックは `ci.yml` と同一なので、CI の成功で代替確認とする
- `@v7` の major タグでパッチ更新に追従する。SHA ピン留めは今回のスコープ外
- 同じ issue の項目 1（zod schema テスト）は別 PR（次タスク）。この PR では issue を close しない（`Refs #33`）

## 完了条件
- [x] `ci.yml` / `deploy.yml` の checkout・setup-node が `@v7`
- [ ] PR の CI（Node 26, ubuntu-latest）が通る
- [ ] issue #33 に進捗コメントを残す（項目 1 は未完了のため close しない）。コメントには「Deploy workflow は実行しておらず、次回の本番 deploy で初めて v7 で動く」ことを明記する

## 実装結果
- `ci.yml` / `deploy.yml` の 4 行を `@v7` に更新（`uses:` は他に存在しない）
- `.claude/README.md` は workflows に言及していないため変更不要
- ローカルの `make ci` は通過。action の v7 動作確認は PR の CI で行う

## 参考（スコープ外・別途検討）
- CI が落ちた場合、action 更新ではなく runner image 側の可能性もある（`ubuntu-latest` は 2026-10-19 から Ubuntu 26 へ順次移行中の notice が直近の CI に出ている）
- `@v7` は書き換え可能な major タグ。`deploy.yml` は `CLOUDFLARE_API_TOKEN` を扱うので、commit SHA 固定（`@<sha> # v7.0.1`）+ Dependabot / Renovate による更新が将来の hardening 候補
- 既存の hardening 候補（今回の変更とは無関係）: 両 workflow に `permissions:` が無い / `deploy.yml` の checkout が `persist-credentials` 既定（true）/ deploy の setup-node cache（cache poisoning 対策として docs は無効化を推奨）
