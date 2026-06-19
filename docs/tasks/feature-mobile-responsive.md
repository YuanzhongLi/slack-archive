# Mobile Responsive Design

## 概要
デスクトップ専用だった3カラム固定レイアウトをモバイル対応にする。
md (768px) 未満をモバイル、md 以上をデスクトップとして扱い、デスクトップの見た目は変更しない。

## ソース
ユーザー指示: モバイルデザインを作成する（モバイル対応にする）

## 実装計画

### Wave 1（並列実行）

#### Step 1: App.tsx — サイドバードロワー + モバイルヘッダー
- モバイル: サイドバーを `fixed + translate-x` でオーバーレイドロワー化 (w-72)
- ハンバーガーボタン (Menu アイコン) でドロワー開閉
- ドロワー外タップ（半透明オーバーレイ）で閉じる
- チャンネル選択時にドロワーを自動で閉じる
- モバイルヘッダー: ハンバーガー + チャンネル名表示 (`md:hidden`)
- デスクトップ: 現状維持 (`md:static md:translate-x-0`)
- 対象: `src/client/App.tsx`

#### Step 2: ThreadPanel + SearchResultPanel — フルスクリーン化
- モバイル: `absolute inset-0 z-20` でメインコンテンツを覆うフルスクリーン表示
- デスクトップ: `md:w-80 md:border-l md:relative` で現状の右パネルを維持
- 対象: `src/client/components/ThreadPanel.tsx`, `src/client/components/SearchResultPanel.tsx`

### Wave 2（Wave 1 完了後）

#### Step 3: i18n キー追加
- `app.openSidebar` / `app.closeSidebar` を en.ts / ja.ts に追加
- 対象: `src/client/i18n/locales/en.ts`, `src/client/i18n/locales/ja.ts`

## 技術的な判断メモ
- `main` を `relative` にすることで Thread/Search パネルの `absolute inset-0` が正しく機能する
- `useChannels` を App.tsx でも呼ぶことでモバイルヘッダーのチャンネル名を解決（SWR キャッシュで重複リクエストは発生しない）
- タップターゲットの細部調整 (ChannelList 等) は別タスクとして扱う

## 完了条件
- [x] モバイルでサイドバーがドロワー表示になる
- [x] モバイルヘッダー（ハンバーガー + チャンネル名）が表示される
- [x] スレッド/検索パネルがモバイルでフルスクリーン表示になる
- [x] デスクトップレイアウトが変わらない
- [x] lint / typecheck パス
