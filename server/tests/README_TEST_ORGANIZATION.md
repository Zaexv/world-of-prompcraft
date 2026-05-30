# Test Organization by Domain

Tests are organized by domain to improve maintainability, discoverability, and clarity. Each domain corresponds to a major system in World of Promptcraft.

## Directory Structure

```
tests/
├── README_TEST_ORGANIZATION.md   # This file
├── conftest.py                   # Shared fixtures (players, NPCs, world state)
├── llm_fixtures.py              # Mock LLM providers (Claude, OpenAI, with tools)
├── load_test_locust.py          # Load testing framework
│
└── domains/
    ├── agents/                  # NPC agent tests
    │   ├── test_agent_integration.py           # Mock LLM behavior tests
    │   ├── test_ai_integration_formal_flow.py # ws -> service -> registry flow tests
    │   ├── test_interaction_service.py         # Caching, fingerprinting, provider errors
    │   └── test_personalities.py               # NPC personality templates
    │
    ├── world/                   # World state & game world tests
    │   ├── test_player_state.py       # Player data, inventory, quests
    │   ├── test_world_state_persistence.py # SQLite persistence roundtrips
    │   ├── test_world_state.py        # World state, damage, items, NPCs
    │   └── test_zones.py              # Zone definitions, terrain, spawn logic
    │
    ├── tools/                   # Agent tools & utilities
    │   ├── test_combat_tools.py       # Damage calculations, combat scoring
    │   └── test_retriever.py          # RAG knowledge base, keyword search
    │
    ├── protocol/                # WebSocket & network protocol tests
    │   └── test_protocol.py           # Message serialization, schemas
    │
    └── ui/                      # (Future) Client-side UI tests
        └── (to be added)
```

## Domain Descriptions

### `agents/` - NPC Agent System
Tests for LangGraph agents, LLM integration, and NPC behaviors.

**Key Files:**
- `test_agent_integration.py` — Mock LLM functionality (no API calls)
- `test_ai_integration_formal_flow.py` — Formal interaction pipeline tests (`handle_message -> InteractionService -> AgentRegistry`)
- `test_interaction_service.py` — Cache correctness, fingerprints, timeout/provider wrapping
- `test_personalities.py` — NPC archetype system prompts

**Sample Test:**
```python
@pytest.mark.asyncio
async def test_mock_llm_generation(mock_llm_openai: MockChatModel) -> None:
    """Test mock LLM generates responses without API calls."""
    messages = [HumanMessage(content="Hello!")]
    result = await mock_llm_openai._agenerate(messages)
    assert result is not None
```

**Coverage:**
- ✅ Mock LLM invocation
- ✅ Tool binding
- ✅ Formal websocket interaction flow (direct commands, social, normal reasoning, fallback)
- ✅ Local runtime guardrail for core use-cases (<3s in-test assertion)

---

### `world/` - Game World & State
Tests for world state, player data, NPCs, zones, and game logic.

**Key Files:**
- `test_player_state.py` — Player attributes, inventory isolation
- `test_world_state_persistence.py` — SQLite-backed persistence for players/NPC personalities/world snapshot
- `test_world_state.py` — Damage, healing, items, NPC management
- `test_zones.py` — Zone definitions, descriptions, terrain

**Sample Test:**
```python
def test_apply_damage_player(world_state: WorldState, player_data: PlayerData) -> None:
    """Test player damage application."""
    world_state.apply_damage("player_1", 25)
    assert world_state.players["player_1"].hp == 75
```

**Coverage:**
- ✅ State mutations (damage, heal, items, weather)
- ✅ SQLite persistence roundtrips (players, NPC personalities, world snapshot)
- ✅ Zone system (village, peaks, lake, wilderness)
- ✅ NPC/player data integrity
- ✅ Singleton world state

---

### `tools/` - Agent Tools & Utilities
Tests for LLM agent tools (combat, dialogue, trade) and RAG retrieval.

**Key Files:**
- `test_combat_tools.py` — Damage calculations, attack scoring
- `test_retriever.py` — Knowledge base retrieval, keyword matching

**Sample Test:**
```python
def test_retrieve_returns_results() -> None:
    """Test RAG retriever returns lore snippets."""
    results = retriever.retrieve("sword")
    assert len(results) > 0
    assert "sword" in results[0].lower()
```

**Coverage:**
- ✅ Combat scoring (damage, armor, weakness)
- ✅ RAG retrieval (top-k, query expansion, topic boosting)
- ✅ Tool argument validation

---

### `protocol/` - WebSocket & Network
Tests for message serialization, protocol validation.

**Key Files:**
- `test_protocol.py` — Message schemas, aliases, serialization

**Sample Test:**
```python
def test_player_interaction_alias() -> None:
    """Test PlayerInteraction message alias."""
    msg = PlayerInteraction(...)
    assert isinstance(msg, PlayerInteraction)
```

**Coverage:**
- ✅ Message shape validation
- ✅ Serialization/deserialization
- ✅ Type aliases and defaults

---

## Running Tests

### By Domain

```bash
# Run only agent tests
pytest tests/domains/agents/ -v

# Run formal AI integration flow tests
pytest tests/domains/agents/test_ai_integration_formal_flow.py -v

# Run only world tests
pytest tests/domains/world/ -v

# Run only tool tests
pytest tests/domains/tools/ -v

# Run entire suite
pytest tests/ -v
```

### By Coverage

```bash
# Generate coverage report
pytest tests/ --cov=src --cov-report=html

# Run specific test
pytest tests/domains/world/test_player_state.py::test_player_defaults -v
```

### Continuous Integration

```bash
# Run in CI (same as GitHub Actions)
make test-server
```

---

## Adding New Tests

### 1. Identify the Domain
- Agent logic → `tests/domains/agents/`
- Player/world data → `tests/domains/world/`
- Combat/tools → `tests/domains/tools/`
- Messages → `tests/domains/protocol/`
- UI (future) → `tests/domains/ui/`

### 2. Use Shared Fixtures

From `conftest.py`:
```python
def test_my_feature(world_state: WorldState, player_data: PlayerData):
    """My test."""
    pass
```

From `llm_fixtures.py`:
```python
@pytest.mark.asyncio
async def test_llm_call(mock_llm_openai: MockChatModel):
    """Test with mock LLM."""
    result = await mock_llm_openai._agenerate([...])
```

### 3. Write Focused Tests

```python
# Good: Single behavior per test
def test_player_takes_damage():
    player.hp = 100
    world_state.apply_damage("player_1", 25)
    assert player.hp == 75

# Bad: Multiple behaviors
def test_player_interactions():  # Too broad
    player.hp = 100
    world_state.apply_damage(...)
    world_state.give_item(...)
    assert player.hp == 75
    assert "sword" in player.inventory
```

---

## Metrics

**Current Test Suite:**
- Total tests: 50
- Domains: 5 (agents, world, tools, protocol, ui)
- Average latency: < 30 seconds
- Coverage target: 85%+
- Mock LLM tests: 8 (0 API calls)

**By Domain:**
- `agents/`: 9 tests (LLM mocks)
- `world/`: 23 tests (state management)
- `tools/`: 6 tests (combat, RAG)
- `protocol/`: 12 tests (messages)

---

## Maintenance Notes

- **Mock LLM Fixtures**: Update in `llm_fixtures.py` for all agent tests
- **Shared State**: Use `conftest.py` for common setup (world, player, NPC)
- **Domain Isolation**: Keep domain tests independent; avoid circular imports
- **Naming**: Use `test_<behavior>.py` (e.g., `test_combat_tools.py`)
