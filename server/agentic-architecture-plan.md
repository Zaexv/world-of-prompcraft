# Agentic Architecture Plan: World of Promptcraft

## 1. Goal
Improve back-end agentic workflows to be token-efficient (faster/cheaper) and ensure NPC communication reliability through stateful graphs and grounded tool-calling.

## 2. Clean Code: Stateful NPC Architecture (LangGraph)
To ensure NPCs remain consistent, we define them as a stateful graph rather than a single prompt.

### Sample Pattern: `NPCLiveGraph`
```python
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END

class NPCState(TypedDict):
    messages: Annotated[list, add_messages]
    player_id: str
    npc_id: str
    current_quest: str
    reputation: int

def npc_logic(state: NPCState):
    # 1. Retrieve personality & lore
    # 2. Invoke LLM with current state
    # 3. Return updated messages
    pass

# Initialize the graph
workflow = StateGraph(NPCState)
workflow.add_node("agent", npc_logic)
workflow.set_entry_point("agent")
workflow.add_edge("agent", END)
app = workflow.compile()
```

## 3. Token Efficiency & Speed Optimization
*   **Semantic & Exact Caching (Redis):** Implement SHA256 hashing for `(npc_id, player_id, prompt_text)`. 
    *   *Logic*: Check cache -> If hit, return immediately (~50ms) -> If miss, call LLM (~2000ms).
*   **Context Pruning (Summarizer Agent):**
    ```python
    def summarize_conversation(history):
        # Triggered when history > 20 messages
        # Summarizes key facts (e.g., "Player found the Lost Key")
        # Returns a 1-paragraph summary to replace the old history
    ```
*   **Model Routing:**
    *   **GPT-4o-mini:** 90% of banter (Fast, $0.15/1M tokens).
    *   **Claude 3.5 Sonnet:** 10% for quest resolution/boss logic (Complex, $3.00/1M tokens).

## 4. Testing Strategy: "Zero-Cost" Integration
We will use deterministic mocks to test agent reasoning without spending money or waiting for slow APIs.

### Sample Test: `test_npc_quest_logic.py`
```python
import pytest
from tests.llm_fixtures import MockChatModel

@pytest.mark.asyncio
async def test_npc_gives_quest_on_reputation_5():
    # Setup mock with a deterministic response
    mock_llm = MockChatModel(
        responses={"Give me a quest": "Take this sword, hero!"}
    )
    
    # Run agent logic with mock
    state = {"reputation": 5, "messages": [HumanMessage("Give me a quest")]}
    result = await app.ainvoke(state, config={"configurable": {"llm": mock_llm}})
    
    # Assertions
    assert "Take this sword" in result["messages"][-1].content
    assert result["current_quest"] == "starter_sword"
```

## 5. Reliable NPC Communication
*   **Grounded Tool Calling:** Give agents tools like `get_inventory()`, `set_quest_flag()`, and `query_lore_db()` to prevent hallucinations.
*   **Overseer/Critic Pattern:** A lightweight check to ensure NPC responses align with their defined persona and game state.
*   **Few-Shot Persona Buffers:** Maintain a library of high-quality "gold" examples for each NPC type to guide the LLM.

## 6. Infrastructure & Scalability
*   **Adaptive Backpressure:** Use a Global Semaphore (e.g., limit to 50 concurrent LLM calls) to respect API rate limits.
*   **Async-First Backend:** Use FastAPI for non-blocking I/O to support 100+ concurrent player-NPC interactions.

## 7. Observability & Metrics
To maintain performance, we will track real-time telemetry:
*   **Token Usage Tracking:** Log `input_tokens` and `output_tokens` per player/NPC to monitor costs.
*   **Cache Efficiency:** Track `cache_hit_rate` (Target: >50%) and `cache_latency` vs `api_latency`.
*   **Error & Timeout Rates:** Monitor for 429 (Rate Limit) and 5xx errors to trigger adaptive scaling of the global semaphore.

## 8. Execution Roadmap
1. **Foundation:** Initialize `server/` with FastAPI + LangGraph.
2. **Persistence:** Implement Redis caching and PostgreSQL for graph state persistence.
3. **NPC Prototype:** Build the first stateful NPC with a dedicated toolset.
4. **Validation:** Run load tests with Locust to verify semaphore limits and cache efficiency.
