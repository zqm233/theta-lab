.PHONY: dev backend frontend stop

dev: ## Start backend + frontend together
	@echo "Starting ThetaLab..."
	@trap 'kill 0' EXIT; \
	(cd frontend && bun run dev) & \
	(uv run python -m backend.app) & \
	wait

backend: ## Start backend only
	uv run python -m backend.app

frontend: ## Start frontend only
	cd frontend && bun run dev

stop: ## Kill any running ThetaLab processes
	@-lsof -ti :8000 | xargs kill 2>/dev/null; echo "Backend stopped"
	@-lsof -ti :5173 | xargs kill 2>/dev/null; echo "Frontend stopped"
