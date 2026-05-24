.PHONY: check lint lint-client lint-server typecheck typecheck-client typecheck-server test test-client test-server format

# ── All checks ──────────────────────────────────────────
check: lint typecheck test
	@echo "✅ All checks passed"

# ── Linting ─────────────────────────────────────────────
lint: lint-client lint-server

lint-client:
	cd client && npx eslint src/

lint-server:
	cd server && python -m ruff check src tests
	cd server && python -m ruff format --check src tests

# ── Type checking ───────────────────────────────────────
typecheck: typecheck-client typecheck-server

typecheck-client:
	cd client && npx tsc --noEmit

typecheck-server:
	cd server && $(if $(filter Darwin,$(shell uname)),arch -arm64 python -m mypy src,python -m mypy src)

# ── Tests ───────────────────────────────────────────────
test: test-client test-server

test-client:
	cd client && npx vitest run

test-server:
	cd server && $(if $(filter Darwin,$(shell uname)),arch -arm64 python -m pytest tests,python -m pytest tests)/ -v

# ── Formatting (auto-fix) ──────────────────────────────
format:
	cd client && npx eslint src/ --fix || true
	cd server && python -m ruff format src tests
	cd server && python -m ruff check src tests --fix
