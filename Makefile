# ============================================================
# Development Commands
# ============================================================

# ------------------------------------------------------------
# Development
# ------------------------------------------------------------

## initial setup（初回 clone 後に実行）
setup:
	npm install
	$(MAKE) db-migrate-local
	npx wrangler types

## 開発サーバー起動
dev:
	npm run dev

## プロダクションビルド
build:
	npm run build

## ビルド結果をローカルプレビュー
preview:
	npm run preview

# ------------------------------------------------------------
# Code Quality
# ------------------------------------------------------------

## コードフォーマット
format:
	npm run format

## Lint実行
lint:
	npm run lint

## Lint自動修正
lint-fix:
	npm run lint:fix

## 型チェック
typecheck:
	npm run typecheck

## テスト実行
test:
	npm run test

## テスト実行（coverageレポート付き）
test-coverage:
	npm run test:coverage

## PR前チェック（format + lint + typecheck + test + build）
check: format lint typecheck test build

# ------------------------------------------------------------
# Cloudflare
# ------------------------------------------------------------

## Cloudflare Workers へデプロイ
deploy:
	npx wrangler deploy

## D1マイグレーション実行（ローカル）
db-migrate-local:
	CI=true npx wrangler d1 migrations apply slack-archive-db --local

## D1マイグレーション実行（リモート）
db-migrate-remote:
	npx wrangler d1 migrations apply slack-archive-db --remote

## ローカル D1 を破棄して再構築
db-reset-local:
	rm -rf .wrangler/state/v3/d1
	$(MAKE) db-migrate-local

## ローカル開発環境の初期化（db-reset-local + migration + root user 投入）
## DEV_USER_EMAIL が .dev.vars に設定されている場合のみ root user を投入する
db-setup-local:
	$(MAKE) db-reset-local
	@EMAIL=$$(grep '^DEV_USER_EMAIL=' .dev.vars 2>/dev/null | cut -d'=' -f2); \
	if [ -z "$$EMAIL" ]; then \
		echo "Warning: DEV_USER_EMAIL is not set in .dev.vars — skipping root user insertion."; \
		echo "  To insert a root user, set DEV_USER_EMAIL in .dev.vars and re-run 'make db-setup-local'."; \
	else \
		echo "Inserting root user: $$EMAIL"; \
		CI=true npx wrangler d1 execute slack-archive-db --local \
			--command "INSERT INTO users (id, email, role, created_at, updated_at) VALUES (lower(hex(randomblob(16))), '$$EMAIL', 'root', datetime('now'), datetime('now'));"; \
	fi
	@echo "Local DB setup complete. Run 'make dev' to start."

## Drizzle マイグレーションファイル生成
db-generate:
	npx drizzle-kit generate

## wrangler 型定義生成
wrangler-types:
	npx wrangler types

# ------------------------------------------------------------
# Cleanup
# ------------------------------------------------------------

## Playwright MCP の残滓を削除
clean-screenshots:
	@find . -maxdepth 1 -type f -name '*.png' -delete
	@rm -rf .playwright-mcp
	@echo "Cleaned Playwright artifacts"

# ------------------------------------------------------------
# Help
# ------------------------------------------------------------

## コマンド一覧表示
help:
	@echo "Usage: make <target>"
	@echo ""
	@grep -B1 -E '^[a-zA-Z0-9_%.-]+:' $(MAKEFILE_LIST) | \
		awk '/^## /{desc=substr($$0,4)} /^[a-zA-Z0-9_%.-]+:/ && !/^\.PHONY/{split($$0,a,":"); printf "  \033[36m%-25s\033[0m %s\n", a[1], desc; desc=""}'

.PHONY: setup dev build preview format lint lint-fix typecheck test test-coverage check deploy db-migrate-local db-migrate-remote db-reset-local db-setup-local db-generate wrangler-types clean-screenshots help
