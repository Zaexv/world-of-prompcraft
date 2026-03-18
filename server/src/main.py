import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from .agents.registry import AgentRegistry
from .config import settings
from .llm.provider import get_llm
from .world.world_state import WorldState
from .ws.connection_manager import ConnectionManager
from .ws.handler import handle_message, init_handler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize world state and agent registry on startup."""
    logger.info("Initializing World of Promptcraft backend...")

    llm = get_llm(settings)
    world_state = WorldState()
    registry = AgentRegistry(llm=llm, world_state=world_state)

    init_handler(registry, world_state)
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
async def health():
    return {"status": "ok", "llm_provider": settings.llm_provider}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            response = await handle_message(data)
            await websocket.send_json(response)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
