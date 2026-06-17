# ユーザー管理UI

## 概要
`/management/user` ページでユーザーの追加・削除・ロール変更を行えるようにする。

## ソース
[issue #9](https://github.com/YuanzhongLi/slack-archive/issues/9)

## 実装計画

### Wave 1（並列実行）

#### Step 1: バックエンド API 追加
- `POST /api/users` — email + role でユーザー追加（admin 以上）
- `PATCH /api/users/:id` — admin/viewer のロール変更（root 変更は transfer-root のみ）
- 対象ファイル: `src/worker/routes/users.ts`

#### Step 2: フロントエンド型定義 + i18n キー追加
- `src/client/types/api.ts` に `User` 型・`UsersResponse` 型追加
- `src/client/i18n/locales/ja.ts` / `en.ts` に `userManagement` キー追加
- 対象ファイル: `src/client/types/api.ts`, `src/client/i18n/locales/ja.ts`, `src/client/i18n/locales/en.ts`

### Wave 2（Wave 1 完了後）

#### Step 3: UserManagementPage.tsx 実装
- ユーザー一覧表示（email, role, createdAt）
- ユーザー追加フォーム（email + role 指定）
- ユーザー削除ボタン（root は削除不可、自分自身も削除不可）
- ロール変更（admin ↔ viewer）
- root 譲渡専用ダイアログ（root のみ表示）
- 対象ファイル: `src/client/pages/UserManagementPage.tsx`（新規）

#### Step 4: ルーティング + 導線追加
- `App.tsx` に `/management/user` ルート追加
- `ManagementPage.tsx` にユーザー管理ページへのリンク追加
- 対象ファイル: `src/client/App.tsx`, `src/client/pages/ManagementPage.tsx`

## 技術的な判断メモ
- root 譲渡は `POST /api/users/transfer-root` で行い、通常のロール変更 (`PATCH`) とは分離
- root 削除は `DELETE /api/users/:id` でバックエンドが 403 を返す（既実装）
- ユーザー追加は事前登録型: admin が email + role を入力 → DB に登録 → CF Access でログイン可能

## 完了条件
- [ ] `POST /api/users` でユーザーを追加できる
- [ ] `PATCH /api/users/:id` でロール変更できる
- [ ] `/management/user` でユーザー一覧を表示できる
- [ ] ユーザー追加フォームが動作する
- [ ] 削除ボタンが動作する（root は削除不可）
- [ ] root 譲渡ダイアログが動作する
- [ ] format / lint / typecheck / build が通る
