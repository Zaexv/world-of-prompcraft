# World of Promptcraft — Multi-Stage CI/CD Pipeline

## Pipeline Architecture

The CI/CD pipeline is organized into **6 logical stages**, each with a specific purpose. Each stage is designed to fail fast and provide clear feedback.

```
┌─────────────────────────────────────────────────────────────────┐
│ STAGE 1: CODE QUALITY (Lint & Format)                           │
│ ├─ client-lint (ESLint + Prettier)                              │
│ └─ server-lint (Ruff: check + format)                           │
│    └─ Fail fast: Formatting issues caught immediately           │
├─────────────────────────────────────────────────────────────────┤
│ STAGE 2: TYPE SAFETY (TypeCheck)                                │
│ ├─ client-typecheck (TypeScript compiler) [needs: client-lint]  │
│ └─ server-typecheck (mypy strict) [needs: server-lint]          │
│    └─ Ensures type correctness before runtime                   │
├─────────────────────────────────────────────────────────────────┤
│ STAGE 3: UNIT & INTEGRATION TESTS                               │
│ ├─ client-test (Vitest) [needs: client-typecheck]               │
│ ├─ server-test (pytest + integration) [needs: server-typecheck] │
│ └─ Tests run only after quality gates pass                      │
├─────────────────────────────────────────────────────────────────┤
│ STAGE 4: ADVANCED TESTING (Optional)                            │
│ ├─ server-llm-mock-tests (100% mocked, no API calls)            │
│ └─ server-load-test (concurrent player simulation)              │
│    └─ Skipped in PRs, runs on main branch only                  │
├─────────────────────────────────────────────────────────────────┤
│ STAGE 5: BUILD & ARTIFACTS (Release Only)                       │
│ ├─ build-client-docker (Multi-stage Node.js build)              │
│ └─ build-server-docker (Multi-stage Python build)               │
│    └─ Only on main branch, builds cached Docker images          │
├─────────────────────────────────────────────────────────────────┤
│ STAGE 6: PIPELINE STATUS (Final Check)                          │
│ └─ pipeline-status: Aggregates all critical job results         │
│    └─ Single ✅ or ❌ to indicate overall success                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Stage Details

### Stage 1: Code Quality (Lint & Format)
**Purpose:** Catch formatting, style, and linting issues before deeper checks.

**Jobs:**
- **client-lint**: ESLint + Prettier for TypeScript
  - Runs: `npx eslint src/ --max-warnings 0`
  - Ensures: No unused variables, consistent imports, proper formatting
  - Fails on: Any lint violation or formatting issue

- **server-lint**: Ruff (Python linter & formatter)
  - Runs: `ruff check src tests` + `ruff format --check src tests`
  - Ensures: PEP 8 compliance, no unused imports, consistent style
  - Fails on: Any formatting issue

**Rationale:** Lint/format issues are the cheapest to fix early. These jobs run in parallel and typically complete in 30-60 seconds. Failing fast here saves time in downstream stages.

---

### Stage 2: Type Safety (TypeCheck)
**Purpose:** Ensure type correctness before any runtime execution.

**Depends on:** Stage 1 (both lint jobs must pass)

**Jobs:**
- **client-typecheck**: TypeScript `tsc --noEmit --incremental`
  - Ensures: All TypeScript types are correct
  - Fails on: Type mismatches, missing imports, incompatible assignments

- **server-typecheck**: mypy with `--strict` mode
  - Ensures: All Python code is fully type-annotated and correct
  - Fails on: Type errors, missing annotations (in strict mode)

**Rationale:** Catching type errors before tests saves debugging time. Both jobs run in parallel and typically take 30-90 seconds. Type checking is deterministic and reproducible.

---

### Stage 3: Unit & Integration Tests
**Purpose:** Verify that code works correctly at the unit and integration level.

**Depends on:** Stage 2 (all typecheck jobs must pass)

**Jobs:**
- **client-test**: Vitest (TypeScript unit tests)
  - Runs: `npx vitest run --coverage`
  - Tests: Components, utilities, state management, rendering
  - Reports: Coverage to Codecov
  - Typical time: 30-60 seconds

- **server-test**: pytest (Python unit + integration tests)
  - Runs: `pytest tests/ -v --cov=src --cov-report=xml`
  - Services: Redis (for cache testing)
  - Tests: Agents, tools, world state, protocol handlers
  - Reports: Coverage to Codecov
  - Typical time: 60-120 seconds

**Rationale:** Tests run in parallel after type safety passes. Redis service ensures integration tests for caching work correctly. Coverage reports help track code quality over time.

---

### Stage 4: Advanced Testing (Optional)
**Purpose:** Specialized testing that's expensive or optional.

**Depends on:** Stage 2 & Stage 3 (all prior tests must pass)

**Jobs:**
- **server-llm-mock-tests**: 100% Mocked LLM Testing
  - Runs: `pytest tests/domains/agents/ -k "llm or mock"`
  - Tests: Agent reasoning, tool calling, edge cases
  - **Zero API calls** — entirely mocked with deterministic responses
  - Benefits:
    - $0 cost (vs $0.01-0.10 per real LLM call)
    - <1ms latency (vs 2-5 seconds with real API)
    - Deterministic (same input = same output)
  - Typical time: 20-40 seconds
  - **Rationale:** Validates that agent logic works without paying for API calls

- **server-load-test**: Concurrent Player Simulation
  - Runs: Locust framework (50 concurrent players, 5m duration)
  - Tests: Backpressure limits, timeout behavior, semaphore scaling
  - Triggers: Only on `main` branch (not in PRs, not on feature branches)
  - Benefits:
    - Capacity planning data
    - Real-world concurrency validation
    - Cache hit rate measurement under load
  - Typical time: 5-10 minutes
  - **Rationale:** Expensive test, run only on main to validate production readiness

**Why Optional?** These jobs are conditional — load tests run only on main branch. LLM mock tests run after core tests, so if earlier stages fail, we skip these expensive checks.

---

### Stage 5: Build & Artifacts (Release Only)
**Purpose:** Create production-ready Docker images.

**Depends on:** Stage 3 & Stage 4 (all tests must pass)

**Triggers:** Only on `main` branch pushes (not on PRs, not on feature branches)

**Jobs:**
- **build-client-docker**: Multi-stage Node.js 20 build
  - Builds: Lean, production-ready image
  - Caches: Buildkit layer cache for faster rebuilds
  - Tags: `wop-client:latest`, `wop-client:<commit-sha>`
  - Size: ~100-150 MB (optimized multi-stage)

- **build-server-docker**: Multi-stage Python 3.13 build
  - Builds: Lean, production-ready image
  - Caches: Buildkit layer cache for faster rebuilds
  - Tags: `wop-server:latest`, `wop-server:<commit-sha>`
  - Size: ~300-400 MB (Python + dependencies)

**Rationale:** Docker builds are triggered only on main branch to avoid CI clutter. Multi-stage builds minimize image size. Buildkit caching makes rebuilds fast.

---

### Stage 6: Pipeline Status (Final Check)
**Purpose:** Aggregate all critical job results into a single pass/fail indicator.

**Depends on:** All critical jobs from Stages 1-4

**Logic:**
- Checks all lint, typecheck, and test jobs
- Fails if ANY critical job failed
- Provides clear ✅ or ❌ indicator

**Why Separate?** GitHub's default "all jobs passed" check includes optional/conditional jobs. This explicit check gives a clearer signal for critical vs. optional work.

---

## Execution Flow

### On Pull Request
```
1. Stages 1-2: Code quality + type safety (both in parallel) → ~60s
   └─ Fail fast if lint/format issues
   
2. Stage 3: Unit tests (both in parallel) → ~90s
   └─ Fail fast if tests don't pass
   
3. Stage 4a: LLM mock tests → ~30s
   └─ Optional check
   
4. Stage 6: Pipeline status → ~5s
   └─ Report final result

TOTAL: ~3 minutes for PR
```

### On Push to Main
```
1-4. Same as PR (~3 minutes)

5. Stage 4b: Load test → ~5-10 minutes
   └─ Runs only on main

6. Stage 5: Docker builds (parallel) → ~2-3 minutes
   └─ Builds client + server images

7. Stage 6: Final status → ~5s

TOTAL: ~15-20 minutes for main push
```

---

## Configuration & Optimization

### Environment Variables
Defined in `env:` block for reuse:
```yaml
NODE_VERSION: "20"
PYTHON_VERSION: "3.13"
```

### Caching Strategy
- **npm cache**: `client/package-lock.json` — speeds up `npm ci`
- **pip cache**: `server/pyproject.toml` — speeds up `pip install`
- **Docker buildkit cache**: Layer caching for image builds
- **Incremental TypeScript**: `--incremental` flag for faster rebuilds

### Concurrency Control
```yaml
concurrency:
  group: pipeline-${{ github.ref }}
  cancel-in-progress: true
```
- Prevents duplicate pipeline runs (e.g., force-push cancels old runs)
- Saves CI minutes

### Service Dependencies
Redis is started for server-test:
```yaml
services:
  redis:
    image: redis:7-alpine
    options: >-
      --health-cmd "redis-cli ping"
      --health-interval 10s
```
- Enables integration tests for response caching
- Auto-waits for healthy startup

---

## Failure Scenarios & Recovery

### Lint Failure
```
❌ client-lint fails
→ Run locally: npm run lint:fix
→ Commit fix
→ Push again
```

### Type Error
```
❌ server-typecheck fails
→ Run locally: mypy src --strict
→ Fix type annotations
→ Commit & push
```

### Test Failure
```
❌ server-test fails
→ Run locally: pytest tests/ -v
→ Debug test output
→ Fix code or test
→ Push again
```

### Load Test Timeout (Main Only)
```
⚠️ server-load-test times out
→ Not blocking (later stages)
→ Review load test logs
→ Adjust semaphore/timeout
→ Re-push to main
```

---

## Best Practices

### Local Development
Before pushing, run locally:
```bash
make check    # Runs all 6 stages locally (except Docker build)
```

This runs:
1. Lint (client + server)
2. Typecheck (client + server)
3. Tests (client + server)
4. LLM mock tests

### Pre-commit Hooks
Install pre-commit hooks to catch issues early:
```bash
pre-commit install --hook-type pre-push
```

Hooks run before push:
- ESLint + auto-fix
- Ruff + auto-fix
- TypeScript check
- Python typecheck

### Code Coverage
Push coverage to Codecov:
- Client: `./client/coverage/coverage-final.json`
- Server: `./server/coverage.xml`

View coverage trends at [codecov.io](https://codecov.io)

### Branching Strategy
- **main**: Release-ready code. All tests + Docker builds run.
- **feature/\***: Feature branches. Stages 1-4 run, no Docker builds.
- **refactor/\***: Refactor branches. Stages 1-4 run, no Docker builds.

---

## Metrics & KPIs

### Target Times (GitHub Actions, Ubuntu Latest)
- **Stage 1 (Lint)**: < 1 minute (parallel)
- **Stage 2 (Typecheck)**: < 1.5 minutes (parallel)
- **Stage 3 (Tests)**: < 2 minutes (parallel)
- **Stage 4a (LLM Mock)**: < 1 minute
- **Stage 4b (Load)**: 5-10 minutes (main only)
- **Stage 5 (Docker)**: 2-3 minutes (main only)
- **Total (PR)**: < 5 minutes
- **Total (Main)**: < 20 minutes

### Success Rates
- **Lint/Type**: 100% (no warnings allowed)
- **Unit Tests**: 100% pass rate
- **Integration Tests**: 100% pass rate
- **Load Test**: Semaphore limit < 80% utilized

---

## Future Enhancements

1. **Security Scanning**
   - Add Snyk or Dependabot for vulnerability scanning
   - SAST (static analysis) for code vulnerabilities

2. **Performance Benchmarking**
   - Track build times over time
   - Alert on regressions

3. **Deployment Automation**
   - Auto-push Docker images to registry (on main)
   - Auto-deploy to staging/production

4. **Test Parallelization**
   - Shard tests across multiple runners
   - Reduce total execution time

5. **Metrics & Monitoring**
   - Export pipeline metrics (duration, pass rate) to dashboard
   - Trend analysis for performance

---

## References

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vitest Documentation](https://vitest.dev/)
- [pytest Documentation](https://docs.pytest.org/)
- [ESLint Documentation](https://eslint.org/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [mypy Documentation](https://mypy.readthedocs.io/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Locust Load Testing](https://locust.io/)

