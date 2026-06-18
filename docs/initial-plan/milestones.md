# マイルストーン

## MVP（最小限の動くもの）
- 目標: Slack APIからデータを取得してD1に保存し、ブラウザで閲覧できる状態
- 含まれる機能:
  - パブリックチャンネル一覧の同期・表示
  - チャンネルメッセージ履歴の同期・表示
  - ユーザー情報（表示名）の表示
  - Google認証 + DB認可
  - 手動同期（`/management`）

## Phase 1: 基盤構築
- ゴール: プロジェクトセットアップ + DB + 認証基盤
- タスク:
  - [x] Cloudflare Workers + Hono + Vite + React プロジェクト初期化
  - [x] Drizzle ORM + D1 スキーマ定義・マイグレーション
  - [x] CF Access + Worker認可ミドルウェア実装
  - [x] wrangler.toml 設定（D1バインディング、Cron Triggers）

## Phase 2: Slack同期基盤
- ゴール: Slack APIからデータ取得・保存が動く
- タスク:
  - [x] Slack APIクライアント実装（レート制限対応）
  - [x] チャンネル・メッセージ・スレッド・ユーザー同期ロジック
  - [x] 差分同期（last_synced_at以降のみ取得）
  - [x] Cron Triggersによる自動同期
  - [x] 手動同期APIエンドポイント

## Phase 3: UI実装
- ゴール: Slackライクな閲覧UIが動く
- タスク:
  - [x] チャンネル一覧サイドバー
  - [x] メッセージ表示（ユーザーアイコン・表示名・タイムスタンプ）
  - [x] スレッド展開表示
  - [x] `/management` ページ（手動同期ボタン・同期履歴・Cronスケジュール設定）

## Phase 4: Should機能
- ゴール: 実用性向上
- タスク:
  - [x] メッセージ検索
  - [x] 同期ログ・履歴表示
  - [x] ユーザー管理UI（追加・削除）: [issue #9](https://github.com/YuanzhongLi/slack-archive/issues/9)
  - [x] i18n対応（日英切替）: [issue #10](https://github.com/YuanzhongLi/slack-archive/issues/10)

## Phase 5: 本番デプロイ
- ゴール: Cloudflare Workers 本番環境への初回デプロイ
- タスク:
  - [x] wrangler login + D1 データベース作成
  - [x] Cloudflare Access（Zero Trust）設定（Google IdP）
  - [x] Slack App セットアップ・Bot Token 登録
  - [x] 本番 D1 migration 適用・root ユーザー追加
  - [x] 本番デプロイ・動作確認
  - [x] Slack Webhook アラーム通知（cron 失敗 / D1 サイズ超過）
  - [x] セキュリティヘッダー middleware（CSP / X-Frame-Options 等）
  - [x] コスト・制限ドキュメント整備（Free tier 上限・Spending Limits）

## 将来（Phase 6以降）
- ファイル添付アーカイブ（R2連携）
- リアクション（絵文字）アーカイブ
- DM・プライベートチャンネル対応
- 編集・削除メッセージの同期（Events API `message_changed` / `message_deleted`）: [issue #2](https://github.com/YuanzhongLi/slack-archive/issues/2)
- スレッド返信の差分同期（`conversations.replies` の `oldest` 活用 + `threads.last_synced_at`）: [issue #3](https://github.com/YuanzhongLi/slack-archive/issues/3)
