# =============================================================================
# Megaweave — 根目錄 Makefile
# 使用方式：make <指令>
# =============================================================================

.PHONY: help dev build build-dev test lint typecheck install \
        redis redis-stop logs clean \
        benchmark-up benchmark-down benchmark-reset

# 預設：顯示說明
help:
	@echo ""
	@echo "Megaweave 開發指令"
	@echo "──────────────────────────────────────────"
	@echo "  make install      安裝所有依賴（client + server）"
	@echo "  make dev          同時啟動前後端開發伺服器（需要兩個 terminal）"
	@echo "  make redis        啟動開發用 3-Instance Redis（Cache:6379, Queue:6380, Vector:6381）"
	@echo "  make redis-stop   停止開發用 Redis 容器群"
	@echo "  make benchmark-up    啟動 benchmark 隔離環境（MySQL:13306, Redis:16379-16381）"
	@echo "  make benchmark-down  停止 benchmark 環境（保留 MySQL 資料）"
	@echo "  make benchmark-reset 刪除 benchmark MySQL 資料並重新初始化"
	@echo "  make build        Production build（client + server）"
	@echo "  make build-dev    Dev build（client + server）"
	@echo "  make test         執行所有測試"
	@echo "  make lint         執行所有 linter"
	@echo "  make typecheck    TypeScript 型別檢查"
	@echo "  make logs         追蹤 Docker Compose 生產容器 log"
	@echo "  make clean        清除 build 產出"
	@echo ""

# -----------------------------------------------------------------------------
# 依賴安裝
# -----------------------------------------------------------------------------
install:
	@echo "📦 安裝 client 依賴..."
	cd client && npm install
	@echo "📦 安裝 server 依賴..."
	cd server && npm install
	@echo "✅ 安裝完成"

# -----------------------------------------------------------------------------
# 開發（請在不同 terminal 分別執行）
# -----------------------------------------------------------------------------
dev:
	@echo "⚡ 請在兩個 terminal 分別執行："
	@echo "   cd client && npm run dev"
	@echo "   cd server && npm run dev"
	@echo ""
	@echo "或使用 tmux / 並行工具（如 concurrently）一次啟動："
	@echo "   npx concurrently \"cd client && npm run dev\" \"cd server && npm run dev\""

dev-client:
	cd client && npm run dev

dev-server:
	cd server && npm run dev

# -----------------------------------------------------------------------------
# Redis（開發用）
# -----------------------------------------------------------------------------
redis:
	@echo "🔴 啟動開發用 3-Instance Redis (Cache, Queue, Vector)..."
	docker compose -f docker-compose.dev.yml up -d
	@echo "✅ 3-Instance Redis 已啟動："
	@echo "   [Cache]  redis://localhost:6379 (Session, Socket.IO, Cooldowns, Trending)"
	@echo "   [Queue]  redis://localhost:6380 (BullMQ, AOF enabled)"
	@echo "   [Vector] redis://localhost:6381 (HNSW Index, Embeddings)"
	@echo "   [Insight] UI：http://localhost:8001"

redis-stop:
	docker compose -f docker-compose.dev.yml down

# -----------------------------------------------------------------------------
# Benchmark 隔離環境（詳見 docs/benchmark-runner.md）
# -----------------------------------------------------------------------------
benchmark-up:
	docker compose -f docker-compose.benchmark.yml up -d --wait mysql redis-cache redis-queue redis-vector
	docker compose -f docker-compose.benchmark.yml run --rm benchmark-marker

benchmark-down:
	docker compose -f docker-compose.benchmark.yml down

benchmark-reset:
	docker compose -f docker-compose.benchmark.yml down -v
	$(MAKE) benchmark-up

# -----------------------------------------------------------------------------
# Build
# -----------------------------------------------------------------------------
build:
	@echo "🔨 Building client..."
	cd client && npm run build
	@echo "🔨 Building server..."
	cd server && npm run build
	@echo "✅ Build 完成"

build-dev:
	@echo "🔨 Building client (dev env)..."
	cd client && npm run build:dev
	@echo "🔨 Building server (dev env)..."
	cd server && npm run build:dev
	@echo "✅ Dev build 完成"

# -----------------------------------------------------------------------------
# 測試
# -----------------------------------------------------------------------------
test:
	@echo "🧪 執行 server 測試..."
	cd server && npm test -- --forceExit
	@echo "✅ 測試完成"

# -----------------------------------------------------------------------------
# 程式碼品質
# -----------------------------------------------------------------------------
lint:
	@echo "🔍 Lint client..."
	cd client && npm run lint
	@echo "🔍 Lint server..."
	cd server && npm run lint
	@echo "✅ Lint 完成"

lint-fix:
	@echo "🔧 Lint fix client..."
	cd client && npm run lint:fix
	@echo "🔧 Lint fix server..."
	cd server && npm run lint:fix

typecheck:
	@echo "🔎 TypeScript 型別檢查 client..."
	cd client && npm run typecheck
	@echo "🔎 TypeScript 型別檢查 server..."
	cd server && npm run typecheck
	@echo "✅ Typecheck 完成"

# -----------------------------------------------------------------------------
# Docker Compose（生產）
# -----------------------------------------------------------------------------
up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

logs-backend:
	docker compose logs -f backend-api backend-worker

logs-api:
	docker compose logs -f backend-api

logs-worker:
	docker compose logs -f backend-worker

logs-frontend:
	docker compose logs -f frontend

# -----------------------------------------------------------------------------
# 清理
# -----------------------------------------------------------------------------
clean:
	rm -rf client/.next client/tsconfig.tsbuildinfo
	rm -rf server/dist server/tsconfig.tsbuildinfo
	@echo "🧹 Build 產出已清除"
