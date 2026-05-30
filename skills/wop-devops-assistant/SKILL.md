---
name: wop-devops-assistant
description: |
  DevOps and pipeline optimization for World of Promptcraft. Helps optimize CI/CD pipelines, 
  implement LLM testing strategies without API costs, improve backpressure and monitoring, 
  add response caching, create Docker builds, and run load tests. Use this skill whenever 
  working on World of Promptcraft deployment, testing infrastructure, performance optimization, 
  LangGraph agent monitoring, API rate limiting, or game server scalability. Also helpful for 
  documenting DevOps practices, troubleshooting production issues, or setting up distributed 
  systems for the game server.
compatibility: |
  - Requires: Python 3.11+, Docker, Redis (for caching)
  - Optional: Locust (for load testing), Prometheus (for metrics)
  - Git repository access recommended
---

# World of Promptcraft DevOps Assistant

This skill provides deep expertise in optimizing the DevOps infrastructure for World of Promptcraft — a 3D multiplayer RPG powered by LangGraph NPC agents and LLM prompts.

## Core Domains

### 1. **Pipeline Quality & CI/CD Optimization**

The project uses GitHub Actions with 6 parallel jobs (client/server lint, typecheck, test). Key improvements:

- **Parallel execution** — All jobs run independently to minimize build time
- **Smart caching** — npm cache for client, pip cache for server
- **Concurrency control** — `cancel-in-progress: true` prevents duplicate runs
- **Pre-commit hooks** — ESLint, Ruff, TypeCheck run locally before push
- **Target build time** — < 5 minutes total

**When to help:**
- User wants to speed up pipelines or reduce build time
- Adding new linting/testing tools
- Optimizing caching strategies
- Troubleshooting CI failures

### 2. **LLM Testing Without API Costs**

A major bottleneck: testing LangGraph agents repeatedly costs money ($0.01-0.10 per test with real LLMs). Solution: **100% mocked LLMs with deterministic responses**.

**Key pattern: MockChatModel**
```python
# Mock LLM that never calls real API
model = MockChatModel(
    model_name="mock-gpt-4",
    response_template="Mock response: {input}",
)
result = await model._agenerate([HumanMessage(content="test")])
# Returns: LLMResult with deterministic text
```

**Benefits:**
- Test latency: < 1ms (vs 2-5 seconds with real LLMs)
- Cost: $0 (vs $0.01-0.10 per test)
- Determinism: Same input = same output (great for regression testing)
- Speed: 100+ test iterations per minute

**When to help:**
- User wants to write agent tests without calling real LLMs
- Mocking Claude/OpenAI for integration tests
- Setting up test fixtures and pytest parametrization
- Adding mock tool calls to test agent reasoning

### 3. **Backpressure & Rate Limiting**

The game server handles 50-100 concurrent players but has only 10-50 concurrent LLM API slots. Solution: **2-level backpressure + adaptive scaling**.

**Two-level strategy:**
1. **Per-player lock** — Serializes interactions per player (prevents double-click damage exploits)
2. **Global semaphore** — Limits concurrent LLM calls (respects API rate limits)

**Adaptive backpressure:**
```python
# Auto-scales semaphore based on metrics
- Error rate > 5% → reduce concurrency by 20%
- Timeout rate > 2% → reduce concurrency by 20%
- Latency < 500ms & errors < 1% → increase by 10%
```

**Metrics collected:**
- Total invocations, errors, timeouts
- Cache hits/miss rates
- Latency: average + P99
- Per-NPC and per-player statistics
- Semaphore queue depth

**When to help:**
- Server is timing out under load
- Need real-time visibility into LLM saturation
- Tuning semaphore size for expected concurrent players
- Implementing adaptive scaling based on error rates
- Adding monitoring dashboards

### 4. **Response Caching (Redis-backed)**

Repeated prompts (same NPC, same player, same question) can be cached to reduce API calls by 40-60%.

**Cache strategy:**
- **Key**: SHA256(npc_id, player_id, prompt, temperature)
- **TTL**: Configurable (default 1 hour)
- **Fallback**: Gracefully disabled if Redis unavailable

**Expected performance:**
- Cache hit rate: 40-60% in production
- API call reduction: 40-60%
- Cost savings: $2-5/day at typical game scale

**When to help:**
- User wants to reduce LLM API costs
- Setting up Redis backend
- Tuning cache TTL per NPC type
- Monitoring cache efficiency
- Clearing stale entries

### 5. **Docker & Reproducible Builds**

Multi-stage Dockerfiles for deterministic, minimal images.

**Client:**
```dockerfile
# Builder stage: npm ci + npm run build
# Production: lightweight serve on port 5173
```

**Server:**
```dockerfile
# Builder stage: venv + pip install
# Production: runtime only (slim base, no build tools)
# Port 8000
```

**Benefits:**
- Reproducible across machines
- Minimal image size
- Health checks enabled
- Ready for Kubernetes/orchestration

**When to help:**
- User wants to containerize the app
- Setting up Docker Compose for local dev
- Optimizing image sizes
- Adding health checks
- Debugging image build failures

### 6. **Load Testing with Locust**

Simulate 50-100 concurrent players with realistic interaction patterns (combat, dialogue, trade, quests).

**Workflow:**
```bash
locust -f load_test.py -u 100 -r 20 -t 10m --headless
```

**What it tests:**
- Semaphore limit validation (should queue at 50+ players)
- Timeout behavior (should gracefully degrade)
- Cache hit rates under load
- Response times at different concurrency levels

**When to help:**
- Capacity planning before scaling
- Validating semaphore sizing
- Stress testing before release
- Profiling bottlenecks
- Verifying cache efficiency

---

## Key Files & Architecture

### Monitoring & Metrics
- **`src/monitoring/metrics.py`** — MetricsCollector + AdaptiveBackpressure
  - Real-time telemetry
  - Dynamic concurrency scaling
  - Per-NPC/per-player statistics

### Caching
- **`src/caching/response_cache.py`** — Redis-backed LLM response cache
  - Hash-based keys
  - Configurable TTL
  - Graceful fallback

### Testing
- **`tests/llm_fixtures.py`** — 8 pytest fixtures (MockChatModel, mock settings, patches)
- **`tests/domains/agents/test_agent_integration.py`** — 8 LLM integration tests
- **`tests/load_test_locust.py`** — Load testing framework

### Docker
- **`client/Dockerfile`** — Node.js multi-stage build
- **`server/Dockerfile`** — Python multi-stage build

### Documentation
- **`docs/AI-DEVOPS.md`** — Comprehensive 600+ line guide (pipelines, LLM testing, backpressure, caching, deployment, troubleshooting)
- **`server/tests/README_TEST_ORGANIZATION.md`** — Test organization by domain

---

## Common Tasks

### Add a New Mock LLM Test
```python
from tests.llm_fixtures import mock_llm_openai

@pytest.mark.asyncio
async def test_agent_reasoning(mock_llm_openai: MockChatModel) -> None:
    messages = [HumanMessage(content="Fight!")]
    result = await mock_llm_openai._agenerate(messages)
    assert result is not None
```

### Check Semaphore & Metrics
```python
metrics = get_metrics()
print(metrics.get_summary())
# Output: error_rate, timeout_rate, cache_hit_rate, avg_latency_ms, p99_latency_ms, etc.
```

### Configure Response Caching
```python
# In .env
RESPONSE_CACHE_ENABLED=true
REDIS_URL=redis://localhost:6379/0
RESPONSE_CACHE_TTL=3600
```

### Run Load Test
```bash
locust -f server/tests/load_test_locust.py -u 100 -r 20 -t 10m
```

### Build & Deploy with Docker
```bash
docker build -t wop-client:latest ./client
docker build -t wop-server:latest ./server
docker-compose up -d
```

---

## Decision Flowchart

**User mentions:**
- ✅ "Tests are slow" / "Testing costs too much" → LLM testing (mocks)
- ✅ "Server times out under load" / "Need rate limiting" → Backpressure & monitoring
- ✅ "Reduce API costs" / "Cache responses" → Response caching
- ✅ "Containerize the app" / "Deploy to prod" → Docker builds
- ✅ "How many players can we support?" / "Validate limits" → Load testing
- ✅ "CI/CD is slow" / "Optimize pipeline" → Pipeline quality
- ✅ "Agent behavior is hard to test" / "Mock LLMs" → LLM testing

---

## References

See `docs/AI-DEVOPS.md` in the World of Promptcraft repository for detailed guides on:
- Pipeline architecture (6 parallel GitHub Actions jobs)
- LLM testing strategies (mocked vs. live)
- Backpressure & rate limiting (2-level strategy)
- Response caching (Redis-backed)
- Monitoring & metrics
- Deployment checklist
- Troubleshooting

---

## Tips

1. **LLM testing is the bottleneck** — Always use mocks for iteration; reserve real LLM tests for pre-release validation
2. **Backpressure scales dynamically** — Semaphore size adjusts every 10 seconds based on error/timeout rates
3. **Cache keys include temperature** — Different temperature → different cache bucket (important for variety)
4. **Load tests are cheap** — Run before scaling; they reveal bottlenecks early
5. **Docker is deterministic** — If it builds locally, it builds everywhere

