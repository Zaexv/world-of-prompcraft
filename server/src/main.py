from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager, suppress
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
    world_builder_agent = create_world_builder_agent(llm, pending_world_actions)

    init_handler(
        registry,
        world_state,
        manager,
        world_builder_agent=world_builder_agent,
        pending_world_actions=pending_world_actions,
    )

    # Periodic reaper task to prevent NPC accumulation
    async def reaper_loop() -> None:
        while True:
            try:
                await asyncio.sleep(60)
                reaped = world_state.reap_procedural_npcs()
                if reaped > 0:
                    logger.info(f"Reaper: Removed {reaped} distant procedural NPCs.")
            except Exception as e:
                logger.error(f"Reaper task error: {e}")

    async def persistence_loop() -> None:
        while True:
            try:
                await asyncio.sleep(max(1.0, float(settings.state_flush_interval_seconds)))
                await world_state.flush_dirty_state()
            except Exception as e:
                logger.error(f"Persistence task error: {e}")

    reaper_task = asyncio.create_task(reaper_loop())
    persistence_task = asyncio.create_task(persistence_loop())

    logger.info(
        "Backend ready: %d NPCs registered, LLM provider=%s",
        len(world_state.npcs),
        settings.llm_provider,
    )

    try:
        yield  # app runs
    finally:
        reaper_task.cancel()
        persistence_task.cancel()
        with suppress(asyncio.CancelledError):
            await reaper_task
        with suppress(asyncio.CancelledError):
            await persistence_task
        await world_state.persist_all_state()
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
            try:
                data: dict[str, Any] = await websocket.receive_json()
            except ValueError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue
            response = await handle_message(data, websocket, manager)
            if response is not None:
                await websocket.send_json(response)
    except WebSocketDisconnect:
        player_id = manager.disconnect(websocket)
        if player_id is not None:
            # Remove player from the shared world state
            world_state = _handler_module._world_state
            if world_state is not None:
                await world_state.persist_player(player_id)
                world_state.players.pop(player_id, None)
            # Bug 16: Clean up equipment dict on disconnect
            cleanup_player_equipment(player_id)
            cleanup_player_locks(player_id)
            # Broadcast player_left
            await manager.broadcast(
                {"type": "player_left", "playerId": player_id},
            )
