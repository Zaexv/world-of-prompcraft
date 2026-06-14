from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .agents.npc_designer_agent import create_npc_designer_agent
from .agents.registry import AgentRegistry
from .agents.world_builder_agent import create_world_builder_agent
from .config import settings
from .llm.provider import get_llm
from .persistence import GameStore
from .world.npc_wander import npc_wander_loop
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

    # Embedded Django ORM: configure + migrate the persistence schema before any
    # store/world access. Migration runs in a thread (sync ORM, blocking I/O).
    from .persistence.django_setup import run_migrations, setup_django

    setup_django()
    await asyncio.to_thread(run_migrations)

    llm = get_llm(settings)
    world_state = WorldState()

    # Persistence: open the store + the persistent NPC-memory checkpointer before
    # building agents, so every agent is wired to durable memory from the start.
    global _store
    save_task: asyncio.Task[None] | None = None
    checkpointer = None
    checkpointer_cm = None
    if settings.persistence_db_path:
        from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

        _store = GameStore()
        checkpointer_cm = AsyncSqliteSaver.from_conn_string(settings.persistence_db_path)
        checkpointer = await checkpointer_cm.__aenter__()
        await checkpointer.setup()

    registry = AgentRegistry(
        llm=llm, world_state=world_state, checkpointer=checkpointer, store=_store
    )

    pending_world_actions: list[Any] = []
    # The world builder needs a much larger generation budget than NPC dialogue:
    # its create_custom_mesh tool calls carry multi-part JSON specs.
    builder_llm = get_llm(
        settings.model_copy(update={"response_max_tokens": settings.world_builder_max_tokens})
    )
    world_builder_agent = create_world_builder_agent(builder_llm, pending_world_actions)

    # NPC Designer ("Architect") — chat-driven NPC creation.
    pending_npc_actions: list[Any] = []
    npc_designer_agent = create_npc_designer_agent(llm, pending_npc_actions)

    # Restore the previous session's world, then save periodically.
    if _store is not None:
        # One-shot migration of any pre-ORM blob data / world_objects.json.
        from .persistence.importer import import_legacy_data

        migrated = await asyncio.to_thread(import_legacy_data, settings.persistence_db_path, _store)
        if migrated:
            logger.info("Migrated %d legacy rows into the ORM schema", migrated)

        world_state.refresh_npcs()  # build manifest NPCs first so overrides apply
        restored = await asyncio.to_thread(_store.restore_world, world_state)
        # Restore player-built world objects into the in-memory world.
        world_state.world_objects.update(await asyncio.to_thread(_store.load_world_objects))
        logger.info(
            "Restored %d persisted NPC rows and %d world objects",
            restored,
            len(world_state.world_objects),
        )
        save_task = asyncio.create_task(_periodic_save(_store, world_state))

    init_handler(
        registry,
        world_state,
        manager,
        world_builder_agent=world_builder_agent,
        pending_world_actions=pending_world_actions,
        store=_store,
        npc_designer_agent=npc_designer_agent,
        pending_npc_actions=pending_npc_actions,
    )
    logger.info(
        "Backend ready: %d NPCs registered, LLM provider=%s",
        len(world_state.npcs),
        settings.llm_provider,
    )

    # Server-authoritative NPC wandering — every player sees NPCs in the same place.
    wander_task = asyncio.create_task(npc_wander_loop(world_state, manager))

    yield  # app runs

    wander_task.cancel()
    if save_task is not None:
        save_task.cancel()
    if _store is not None:
        await asyncio.to_thread(_store.save_world, world_state)
        _store.close()
        _store = None
    if checkpointer_cm is not None:
        await checkpointer_cm.__aexit__(None, None, None)
    logger.info("Shutting down World of Promptcraft backend.")


app = FastAPI(title="World of Promptcraft", lifespan=lifespan)
manager = ConnectionManager()

# SQLite game-state store; None when persistence is disabled.
_store: GameStore | None = None


async def _periodic_save(store: GameStore, world_state: WorldState) -> None:
    """Snapshot the world on an interval so a crash loses at most one window."""
    while True:
        await asyncio.sleep(settings.persistence_save_interval_seconds)
        try:
            await asyncio.to_thread(store.save_world, world_state)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Periodic world save failed")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "llm_provider": settings.llm_provider}


def _manifest_path() -> str:
    """Resolve the shared world manifest path (mirrors the save handler)."""
    import os

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(base_dir, "shared", "data", "world_manifest.json")


@app.get("/npc/archetypes")
async def get_npc_archetypes() -> dict[str, Any]:
    """Expose archetypes + their tool budgets so the NPC Designer can populate
    dropdowns and show each role's allowed tools (the UI face of the tool limit)."""
    from .agents.personalities.archetypes import ARCHETYPES

    return {
        "archetypes": [
            {
                "key": a.key,
                "allowed_tools": list(a.allowed_tools),
                "default_hp": a.default_hp,
                "hostile": a.hostile,
            }
            for a in ARCHETYPES.values()
        ]
    }


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
    except Exception as e:
        logger.info(f"WebSocket closed: {e}")
    finally:
        for task in pending:
            task.cancel()
        player_id = manager.disconnect(websocket)
        if player_id is not None:
            # Persist, then remove the player from the shared world state.
            world_state = _handler_module._world_state
            if world_state is not None:
                player = world_state.players.get(player_id)
                if player is not None and _store is not None:
                    try:
                        await asyncio.to_thread(_store.save_player, player_id, player)
                    except Exception:
                        logger.exception("Failed persisting %s on disconnect", player_id)
                world_state.players.pop(player_id, None)

            # Broadcast disconnect to other clients
            t = asyncio.create_task(
                manager.broadcast({"type": "player_left", "playerId": player_id})
            )
            # The pending set tracks active tasks to avoid them being garbage collected
            pending.add(t)
            t.add_done_callback(pending.discard)
            # Bug 16: Clean up equipment dict on disconnect
            cleanup_player_equipment(player_id)
            cleanup_player_locks(player_id)
            # Broadcast player_left
            await manager.broadcast(
                {"type": "player_left", "playerId": player_id},
            )
