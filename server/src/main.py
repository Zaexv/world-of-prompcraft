from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .agents.registry import AgentRegistry
from .agents.world_builder_agent import create_world_builder_agent
from .config import settings
from .llm.provider import get_llm
from .world.world_state import WorldState
from .ws import handler as _handler_module
from .ws.connection_manager import ConnectionManager
from .ws.handler import cleanup_player_equipment, cleanup_player_locks, handle_message, init_handler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialize world state and agent registry on startup."""
    logger.info("Initializing World of Promptcraft backend...")

    llm = get_llm(settings)
    world_state = WorldState()
    registry = AgentRegistry(llm=llm, world_state=world_state)

    pending_world_actions: list[Any] = []
    # The world builder needs a much larger generation budget than NPC dialogue:
    # its create_custom_mesh tool calls carry multi-part JSON specs.
    builder_llm = get_llm(
        settings.model_copy(update={"response_max_tokens": settings.world_builder_max_tokens})
    )
    world_builder_agent = create_world_builder_agent(builder_llm, pending_world_actions)

    init_handler(
        registry,
        world_state,
        manager,
        world_builder_agent=world_builder_agent,
        pending_world_actions=pending_world_actions,
    )
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


def _manifest_path() -> str:
    """Resolve the shared world manifest path (mirrors the save handler)."""
    import os

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base_dir, "shared", "data", "world_manifest.json")


@app.get("/world/manifest")
async def get_world_manifest() -> dict[str, Any]:
    """Serve the latest saved world manifest so the editor/game load live edits."""
    import json
    import os

    path = _manifest_path()
    if not os.path.exists(path):
        return {"error": "manifest not found"}
    with open(path) as f:
        manifest: dict[str, Any] = json.load(f)
    return manifest


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    # Each message is handled in its own task so a slow message (e.g. an
    # interaction waiting tens of seconds on the LLM) does not block the receive
    # loop. If the loop blocked, frequent client frames (player_move) would fill
    # the websockets receive buffer, trigger TCP backpressure, and starve the
    # keepalive pong handling — closing the connection with a "keepalive ping
    # timeout". Per-player locks + the agent semaphore inside handle_message keep
    # concurrent handling correct.
    pending: set[asyncio.Task[None]] = set()

    async def _process(data: dict[str, Any]) -> None:
        try:
            response = await handle_message(data, websocket, manager)
            if response is not None:
                await websocket.send_json(response)
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception("Failed handling message type=%s", data.get("type"))

    try:
        while True:
            try:
                data: dict[str, Any] = await websocket.receive_json()
            except ValueError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            task = asyncio.create_task(_process(data))
            pending.add(task)
            task.add_done_callback(pending.discard)
    except WebSocketDisconnect:
        for task in pending:
            task.cancel()
        player_id = manager.disconnect(websocket)
        if player_id is not None:
            # Remove player from the shared world state
            world_state = _handler_module._world_state
            if world_state is not None:
                world_state.players.pop(player_id, None)
            # Bug 16: Clean up equipment dict on disconnect
            cleanup_player_equipment(player_id)
            cleanup_player_locks(player_id)
            # Broadcast player_left
            await manager.broadcast(
                {"type": "player_left", "playerId": player_id},
            )
