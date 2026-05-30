from fastapi import APIRouter, HTTPException
from langchain_core.messages import HumanMessage
from pydantic import BaseModel
from server.agents.npc_graph import npc_graph
from server.core.cache import response_cache

router = APIRouter()


class ChatRequest(BaseModel):
    npc_id: str
    player_id: str
    message: str


class ChatResponse(BaseModel):
    response: str
    npc_id: str
    cached: bool = False


@router.post("/", response_model=ChatResponse)
async def chat_with_npc(request: ChatRequest):
    # 1. Check Cache
    cached_response = await response_cache.get_response(
        request.npc_id, request.player_id, request.message
    )
    if cached_response:
        return ChatResponse(response=cached_response, npc_id=request.npc_id, cached=True)

    # 4. Invoke the graph
    try:
        # Use player_id and npc_id to create a unique thread_id for LangGraph persistence
        thread_id = f"{request.player_id}:{request.npc_id}"
        config = {"configurable": {"thread_id": thread_id}}

        # We only need to pass the new message, LangGraph handles history via checkpointer
        input_data = {
            "messages": [HumanMessage(content=request.message)],
            "player_id": request.player_id,
            "npc_id": request.npc_id,
            "current_quest": None,
            "reputation": 0,
        }

        new_state = await npc_graph.ainvoke(input_data, config=config)

        # Get the last AI message
        response_text = new_state["messages"][-1].content

        # 5. Save to Cache
        await response_cache.set_response(
            request.npc_id, request.player_id, request.message, response_text
        )

        return ChatResponse(response=response_text, npc_id=request.npc_id, cached=False)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
