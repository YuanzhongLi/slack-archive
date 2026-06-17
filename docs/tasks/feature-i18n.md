# i18n対応（日英切替）

## 概要

UIの国際化対応（日本語 / 英語切替）を実装する。デフォルト言語は日本語。言語設定はlocalStorageに保存する。

## ソース

[issue #10](https://github.com/YuanzhongLi/slack-archive/issues/10)

## 実装計画

### Wave 1: ライブラリ導入 + i18n基盤

#### Step 1: react-i18next + i18next インストール
- `npm install react-i18next i18next`
- 対象: package.json

#### Step 2: i18n設定ファイル・ロケールファイル作成
- `src/client/i18n/index.ts` — i18n初期化（デフォルト言語: ja、localStorage保存）
- `src/client/i18n/locales/en.ts` — 英語リソース
- `src/client/i18n/locales/ja.ts` — 日本語リソース
- `src/client/main.tsx` に i18n import 追加

### Wave 2（並列）: 全コンポーネントのテキスト置換

#### Step 3: App.tsx
- ヘッダー・サイドバー・エラー文字列を `t()` キーに置換
- ヘッダーに EN / JA 切替ボタン追加

#### Step 4: ChannelList.tsx / MessageList.tsx / MessageItem.tsx / ThreadPanel.tsx
- 各コンポーネントのローディング・エラー・空状態テキストを `t()` に置換

#### Step 5: ManagementPage.tsx
- テーブルヘッダー・セクション見出し・説明文・ボタンラベルを `t()` に置換

### Wave 3: 品質確認

#### Step 6: format / lint / typecheck / build
- `make format && make lint && make typecheck && make build`

## 技術的な判断メモ

- ライブラリ: react-i18next + i18next
- デフォルト言語: ja
- 言語設定永続化: localStorage（`i18nextLng` キー）
- 言語切替UI: App.tsx ヘッダーに EN / JA トグルボタン

## 完了条件

- [ ] react-i18next + i18next 導入済み
- [ ] ja / en ロケールファイル作成済み
- [ ] 全コンポーネントのハードコード文字列が t() キーに置換済み
- [ ] ヘッダーに言語切替ボタンがある
- [ ] デフォルト言語が日本語
- [ ] 言語設定がlocalStorageに保存される
- [ ] make build が通る
