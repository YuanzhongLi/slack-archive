# favicon設定

## 概要
ルートに配置された favicon.svg を Web サイトの favicon として設定する。

## ソース
ユーザー指示: favicon.svg をfaviconとして設定して

## 実装計画

### Step 1: index.html に favicon リンクを追加
- `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` を `<head>` 内に追加
- 対象ファイル: `index.html`

## 完了条件
- [ ] index.html に favicon link タグが追加されている
- [ ] favicon.svg がコミットに含まれている
