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

    # Bug 8: Validate API keys before starting
    if settings.llm_provider == "openai" and not settings.openai_api_key:
        logger.error("OPENAI_API_KEY is missing but openai provider is selected.")
        raise RuntimeError("Missing OPENAI_API_KEY")
    if settings.llm_provider == "claude" and not settings.anthropic_api_key:
        logger.error("ANTHROPIC_API_KEY is missing but claude provider is selected.")
        raise RuntimeError("Missing ANTHROPIC_API_KEY")

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

    # Bug 5: Per-connection rate limiting
    # Limit to 30 messages per 2 seconds to allow for bursts of player movement
    # while preventing massive spamming.
    msg_timestamps: list[float] = []
    rate_limit_count = 30
    rate_limit_window = 2.0

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
        import time

        while True:
            try:
                data: dict[str, Any] = await websocket.receive_json()
            except ValueError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            # Apply rate limiting
            now = time.time()
            msg_timestamps = [t for t in msg_timestamps if now - t < rate_limit_window]
            if len(msg_timestamps) >= rate_limit_count:
                await websocket.send_json({"type": "error", "message": "Rate limit exceeded"})
                await asyncio.sleep(0.1)  # small backoff
                continue
            msg_timestamps.append(now)

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
