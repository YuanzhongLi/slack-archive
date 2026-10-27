# Slack レスポンスの任意フィールドが null のとき要素が黙って捨てられる問題の修正

## 概要
`src/worker/services/slack/client.ts` の zod schema は任意フィールドを `.optional()` で定義しており、`null` を許容しない。Slack のレスポンスに任意フィールドとして明示的な `null` が含まれると、要素全体が `safeParse` に失敗して**ログも出さずに捨てられ**、アーカイブからメッセージ・チャンネル・ユーザーが欠落しても気付けない。

1. 任意フィールドの `null` を `undefined` 相当として受け入れる（公開型は変えない）
2. それでも schema 不一致で捨てた要素は、件数と id/ts・不一致フィールド名を `logger.warn` に出す（本文・ユーザー名などの内容は出さない）

## ソース
https://github.com/YuanzhongLi/slack-archive/issues/37

方針: 案 C（null 許容 + warn ログ）、ログ内容は「関数名・件数・id/ts・不一致フィールド名」（ユーザー承認済み）。

## 実装計画

### Wave 1

#### Step 1: 任意フィールドの null を受け入れる
- 対象: `src/worker/services/slack/client.ts` の 3 schema、`client.test.ts`
- helper を追加:
  - 任意フィールド: `schema.nullish().transform((v) => v ?? undefined)`（出力型は `T | undefined` で現状の `.optional()` と同じ）
  - 既定値つき: `schema.nullish().transform((v) => v ?? defaultValue)`（出力型は `T` で現状の `.optional().default()` と同じ）
  - zod 4 では `.nullish().default(x)` は `null` に既定値を適用しない（`.default()` は `undefined` にしか効かない）ため `.default()` は使わない
- 対象フィールド: channel `is_private` / message `type` `subtype` `user` `text` `thread_ts` / user `deleted` `is_bot` `is_app_user` `profile` と配下 `display_name` `real_name` `image_72`
- 必須フィールド（`id` / `name` / `ts`）は `null` を許容しない（変えない）
- `SlackChannel` / `SlackMessage` / `SlackUser` の公開型が変わらないこと（`syncService.ts` に変更が要らないこと）を typecheck で確認
- テスト更新: 「null で要素ごと落ちる（characterization）」を「null は undefined 扱いで要素が残り、既定値が適用される」に書き換え。`deleted: null` / `is_bot: null` / `is_app_user: null` のユーザーは false 扱いで残り、フィルタは false 時の挙動どおりになること、必須フィールドの `null` は引き続き捨てられること

### Wave 2（Wave 1 完了後）

#### Step 2: 捨てた要素の warn ログ
- 対象: `client.ts`（`createSlackClient(token, logger?)`）、`client.test.ts`
- `logger` は任意の第 2 引数（省略時はログなしで従来どおり）
- `fetchChannels` / `fetchMessages` / `fetchThreadReplies` / `fetchUsers` で `safeParse` 失敗の要素を集計し、各 fetch の最後に 1 回だけ `logger.warn` を出す:
  - 内容: 関数名、捨てた件数、要素ごとの `id` または `ts`（取れなければ undefined）と不一致フィールド名（zod issue の path）。最大 20 件で打ち切り（`truncated` フラグ）
  - **本文（text）・ユーザー名・profile の値などの内容は一切出さない**（Workers Logs に会話内容を残さない）
  - 意図的なフィルタ（type/subtype/bot/deleted 除外、親メッセージ skip）は schema 不一致ではないのでカウントしない
- テスト: 件数・id・フィールド名が出ること、内容が出ないこと、1 件も無ければ warn が出ないこと、logger 省略でも動くこと、20 件超で打ち切られること

### Wave 3（Wave 2 完了後）

#### Step 3: 呼び出し元の配線とドキュメント
- 対象: `src/worker/services/sync/syncService.ts`（`createSlackClient` の 2 箇所に `log` を渡す）
- 既存テスト `syncService.test.ts:358` は `expect(createSlackClientMock).toHaveBeenCalledWith('xoxb-test')` で引数 1 つを厳密に検証しているため、第 2 引数（child logger）を渡すと落ちる。logger が渡されることを含めて更新する
- `.claude/rules/slack-api.md` に追記: 任意フィールドの `null` は `undefined` として扱う / schema 不一致で捨てた要素は warn ログに出る（内容は出さない）
- `docs/ops/sync-logic.md` に warn ログの見方（Workers Logs で検索する文言）を追記
- 最終: `make format && make lint && make test && make typecheck && make build`

## 技術的な判断メモ
- 実際に Slack API が任意フィールドに `null` を返すかは**未確認**（実ワークスペースのデータに触れないため調査していない）。案 A（null 許容）は防御的な対応で、案 B（ログ）が実在の有無を観測可能にする。デプロイ後に Workers Logs で warn が出るかを確認し、出なければ A は無害な保険として残す
- `.nullish().transform()` を使うのは公開型を変えないため。`.nullish()` だけだと型が `T | null | undefined` になり、`syncService.ts` などの利用側に波及する
- 必須フィールド（`id` / `name` / `ts`）の `null` は意味を持たないので許容しない
- ログに内容を含めない理由: Workers Logs は運用者全員が閲覧でき、保持される。件数・id・フィールド名だけで原因調査には十分
- `createSlackClient` の logger は任意引数にして後方互換を保つ（`syncService.test.ts` は `createSlackClient` を mock しているが、358 行目の引数検証は Step 3 で更新が必要）

## 完了条件
- [x] 任意フィールドの `null` で要素が捨てられない（既定値・正規化つき）
- [x] 公開型（`SlackChannel` / `SlackMessage` / `SlackUser`）が変わらない
- [x] schema 不一致で捨てた要素が warn ログに出る（内容は出ない）
- [x] `make format && make lint && make test && make typecheck && make build` が通る
- [x] 変更後も `client.ts` のカバレッジ 100% とミューテーション確認（null 許容・ログ・既定値）
- [ ] issue #37 が PR 経由でクローズされる（`Closes #37`）

## 実装結果
- `client.ts`: `nullishAsUndefined` / `nullishWithDefault` で任意フィールドの `null` を受け入れ。`createSlackClient(token, logger?)` と drop reporter（`fetch*` ごとに 1 回 warn）を追加
- `syncService.ts`: `createSlackClient` に child logger（`syncAll` / `fullResyncAll`）を渡す（child の生成を client 生成の前に移動）
- テスト: `client.test.ts` 70 件（`null` 受け入れ、必須フィールド `null` の拒否、ログ内容・件数・打ち切り・内容非漏洩、公開型の固定）、`syncService.test.ts` の引数検証を更新・追加。全体 315 件
- カバレッジ: `client.ts` 100%（行 82/82、分岐 56/56）
- ミューテーション確認: 39 パターン（各フィールドの null 許容を元に戻す・既定値の変更・必須フィールドの null 許容・drop の記録/flush の削除・打ち切り・id 長さ・フィールド重複排除・内容の漏洩・level 変更・意図的フィルタを数える・logger の配線）をすべて検出。`syncService.ts` / `client.ts` は元に戻し済み
- `docs/ops/sync-logic.md` に warn ログの見方、`.claude/rules/slack-api.md` に null の扱いとログ方針を追記

## 実装中に見つけたこと
- `.transform()` を挟むと zod 4 の出力型でキーが任意（`type?:`）から必須（`type: string | undefined`）に変わり、`syncService.test.ts` の fixture が型エラーになった。末尾に `.optional()` を付けてキーを任意に戻した。回帰を防ぐため `expectTypeOf` で公開型を固定するテストを追加
- `docs/ops/sync-logic.md` の「レート制限対応」が「最大 3 回リトライ」と書かれていたが、`client.ts` は `@slack/web-api` の既定リトライ（`tenRetriesInAboutThirtyMinutes`: 最大 10 回・約 30 分、429 は `Retry-After` を待って再試行）に任せている。ソース（7.17.0）で確認し、実装を正としてドキュメントを修正した（同じ PR に含める）

## pre-pr-check で反映した指摘
- warn に取得場所を追加: `fetchMessages` / `fetchThreadReplies` は `channel`、`fetchThreadReplies` は `thread_ts` も出す（ts は channel ごとにしか一意でないため、無いと Slack 上で特定できない）
- `createSlackClient(token, logger)` の `logger` を必須に変更（任意だと呼び出し側が黙って捨てる状態に戻れる）
- `identify()` を fetcher ごとの key（channels/users: `id`、messages: `ts`）で呼ぶ（schema 外の stray な `id` / `text` / `name` を拾わない）
- drop reporter の `flush()` を `try/finally` にして、API エラーで中断してもそれまでに捨てた分を出す
- テストを 4 fetcher 共通の表に再構成: 1 回の warn・ページまたぎの集約・同じ client の連続呼び出しで前回分が混ざらない・20/21 件の打ち切り境界・API 失敗時の flush・内容（text/name/profile）の非漏洩（id/ts を持たず内容だけ持つ要素を使用）・stray id の無視
- ミューテーション確認を 39 → 再検証 22 パターン追加で全て検出（flush をページごとに / finally 外 / `>=` 境界 / `identify` の fallback / channel・thread_ts の欠落 / id key の取り違え など）。独立した確認（88 パターン）で生き残った 8 件の穴はこれで解消
- docs: `sync-logic.md` のログ例を実際の JSON 形式に、`fullResyncAll` の窓内で捨てた要素は D1 の既存行の削除につながることを明記、リトライ説明を正確化（Retry-After 後にバックオフも挟む / Retry-After 不正は即中断 / 429 以外にも適用）。`.claude/README.md` の `slack-api.md` の説明を更新。古い sleep コメントを修正
- 実装後の `client.ts` カバレッジ 100%（行 86/86、分岐 53/53）、全体 332 件

## 未対応（スコープ外・要判断）
- `type !== 'message'` のメッセージ（`type: null` を含む）は schema 不一致ではなくフィルタ除外のため warn に出ず、`fullResyncAll` の窓内では D1 の既存行が削除される。`fetchThreadReplies` には type/subtype フィルタが無く非対称（既存の挙動）。記録するかは別途判断
- Cron Trigger の実行時間上限（未確認）が約 30 分のリトライより短いと、リトライを使い切る前に実行が打ち切られ `sync_logs` にエラーが残らない可能性がある
- `docs/ops/sync-logic.md` の既知の制限「削除の反映なし」は `fullResyncAll` の削除処理と矛盾している（既存）
