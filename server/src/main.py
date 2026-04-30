from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .agents.registry import AgentRegistry
from .config import settings
from .llm.provider import get_llm
from .world.world_state import WorldState
from .ws import handler as _handler_module
from .ws.connection_manager import ConnectionManager
from .ws.handler import cleanup_player_equipment, handle_message, init_handler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialize world state and agent registry on startup."""
    logger.info("Initializing World of Promptcraft backend...")

    llm = get_llm(settings)
    world_state = WorldState()
    registry = AgentRegistry(llm=llm, world_state=world_state)

    init_handler(registry, world_state, manager)
    logger.info(
        "Backend ready: %d NPCs registered, LLM provider=%s",
        len(world_state.npcs),
        settings.llm_provider,
    )

    yield  # app runs

    logger.info("Shutting down World of Promptcraft backend.")


app = FastAPI(title="World of Promptcraft", lifespan=lifespan)
manager = ConnectionManager()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "llm_provider": settings.llm_provider}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            data: dict[str, Any] = await websocket.receive_json()
            response = await handle_message(data, websocket, manager)
            if response is not None:
                await websocket.send_json(response)
    except WebSocketDisconnect:
        player_id = manager.disconnect(websocket)
        if player_id is not None:
            # Remove player from the shared world state
            world_state = _handler_module._world_state
            if world_state is not None:
                world_state.players.pop(player_id, None)
            # Bug 16: Clean up equipment dict on disconnect
            cleanup_player_equipment(player_id)
            # Broadcast player_left
            await manager.broadcast(
                {"type": "player_left", "playerId": player_id},
            )
