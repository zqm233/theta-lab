# ThetaLab Makefile - Minimal Essential Commands

.PHONY: help install dev test clean

##@ Commands

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

install: ## Install all dependencies
	@echo "📦 Installing dependencies..."
	@if ! command -v uv &> /dev/null; then \
		echo "Error: uv not found. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"; \
		exit 1; \
	fi
	@if ! command -v bun &> /dev/null; then \
		echo "Error: bun not found. Install: curl -fsSL https://bun.sh/install | bash"; \
		exit 1; \
	fi
	@uv sync
	@cd frontend && bun install
	@echo "✓ Done"

dev: ## Start development servers (Ctrl+C to stop)
	@echo "🚀 Starting ThetaLab..."
	@echo "   Backend:  http://localhost:8000"
	@echo "   Frontend: http://localhost:5173"
	@echo ""
	@set -m; \
	(cd frontend && bun run dev) & \
	FRONTEND_PID=$$!; \
	(uv run python -m backend.app) & \
	BACKEND_PID=$$!; \
	trap 'echo "\nStopping..."; kill -TERM $$FRONTEND_PID $$BACKEND_PID 2>/dev/null; wait 2>/dev/null; echo "✓ Stopped"; exit 0' INT TERM; \
	wait

test: ## Run all tests
	@echo "🧪 Running tests..."
	@uv run python -m pytest tests/ -v

clean: ## Remove all build artifacts and dependencies
	@echo "🧹 Cleaning..."
	@rm -rf .venv __pycache__ **/__pycache__ .pytest_cache
	@cd frontend && rm -rf .next node_modules
	@echo "✓ Done"
