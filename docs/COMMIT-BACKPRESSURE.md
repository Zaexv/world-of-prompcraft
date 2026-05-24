# Pipeline Backpressure: Keep Pipelines Green

## Overview

**Backpressure constraint:** Commits are blocked if `make check` fails locally. This ensures pipelines stay green on GitHub by catching issues before they're pushed.

## How It Works

The `.git/hooks/pre-commit` hook runs `make check` (lint + typecheck + test) before every commit:

```bash
$ git commit -m "feat: add new feature"
🔍 Running pre-commit checks (make check)...
✅ All checks passed! Proceeding with commit.
```

If any check fails, the commit is **rejected**:

```bash
$ git commit -m "feat: broken code"
🔍 Running pre-commit checks (make check)...
❌ Pre-commit check failed. Fix errors above and try again.

💡 Quick fixes:
  - ESLint:   npm run lint:fix --prefix client
  - Ruff:     python -m ruff check --fix src tests --prefix server
  - TypeScript: npm run typecheck --prefix client
  - mypy:     python -m mypy src --prefix server
```

## Why This Matters

1. **Zero broken builds:** Pipeline is always green (status badge is ✅)
2. **Fast feedback:** Developers know about issues in seconds, not minutes
3. **Fewer CI/CD retries:** No wasted GitHub Actions minutes
4. **Team confidence:** Code quality is guaranteed at commit time

## Quick Fixes

Most issues auto-fix:

```bash
# Client linting (ESLint)
npm run lint:fix --prefix client

# Server formatting (Ruff)
cd server && python -m ruff check --fix src tests

# Then re-commit
git commit -m "fix: resolved linting issues"
```

## Overriding (Emergency Only)

If you **absolutely must** commit without checks (rare):

```bash
git commit --no-verify -m "emergency: hotfix"
```

⚠️ **Warning:** This bypasses backpressure and may break the pipeline.

## Understanding the Hook

The hook lives at `.git/hooks/pre-commit` and:
1. Runs `make check` (all linters, type checkers, tests)
2. Blocks commit if exit code ≠ 0
3. Provides helpful error messages

It runs **every time you commit**, not just before push.

## Ensuring the Hook Is Set Up

After cloning:

```bash
chmod +x .git/hooks/pre-commit
```

The repo includes the hook in `.git/hooks/pre-commit`, so it should be ready.

## Pipeline Status Summary

| Stage | Time | What It Checks |
|-------|------|----------------|
| **Client Lint** | ~45s | ESLint + formatting |
| **Server Lint** | ~6s | Ruff linting + formatting |
| **Client Typecheck** | ~15s | TypeScript strict mode |
| **Server Typecheck** | ~43s | mypy strict mode |
| **Client Tests** | ~20s | Vitest unit tests + coverage |
| **Server Tests** | ~50s | pytest + coverage |
| **LLM Mock Tests** | ~27s | 100% mocked, $0 cost |
| **Total local** | ~3 min | `make check` |

## See Also

- [PIPELINE-STAGES.md](./PIPELINE-STAGES.md) — Full pipeline architecture
- [DEVOPS-INTEGRATION.md](./DEVOPS-INTEGRATION.md) — DevOps setup & integration
- [Makefile](../Makefile) — Available make targets
