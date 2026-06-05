.PHONY: check lint lint-client lint-server typecheck typecheck-client typecheck-server test test-client test-server format

# ── All checks ──────────────────────────────────────────
check: lint typecheck test
	@echo "✅ All checks passed"

# ── Run ───────────────────────────────────────────────
run-cli:
	@echo "🚀 Starting client..."
	cd client && pnpm run dev &
	@echo "✅ Server and client started"
run-server:
	cd server && pip install -e ".[dev]"
	@echo "✅ All dependencies installed"
	@echo "🚀 Starting server..."
	python -m uvicorn src.main:app --reload --port 8000

# ── Linting ─────────────────────────────────────────────
lint: lint-client lint-server

lint-client:
	cd client && pnpm exec eslint src/

lint-server:
	cd server && python -m ruff check src tests
	cd server && python -m ruff format --check src tests

# ── Type checking ───────────────────────────────────────
typecheck: typecheck-client typecheck-server

typecheck-client:
	cd client && pnpm exec tsc --noEmit

typecheck-server:
	cd server && $(if $(filter Darwin,$(shell uname)),arch -arm64 python -m mypy src,python -m mypy src)

# ── Tests ───────────────────────────────────────────────
test: test-client test-server

test-client:
	cd client && pnpm exec vitest run

test-server:
	cd server && $(if $(filter Darwin,$(shell uname)),arch -arm64 python -m pytest tests,python -m pytest tests)/ -v

# ── Formatting (auto-fix) ──────────────────────────────
format:
	cd client && pnpm exec eslint src/ --fix || true
	cd server && python -m ruff format src tests
	cd server && python -m ruff check src tests --fix
