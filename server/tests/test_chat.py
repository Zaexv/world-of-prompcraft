from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from server.main import app


@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


@pytest.mark.asyncio
async def test_chat_endpoint():
    with (
        patch("server.api.endpoints.chat.response_cache.get_response", return_value=None),
        patch("server.api.endpoints.chat.response_cache.set_response", return_value=None),
        patch("server.agents.npc_graph.get_model") as mock_get_model,
    ):
        from server.tests.llm_fixtures import MockChatModel

        mock_get_model.return_value = MockChatModel(default_response="Mock response")

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            payload = {"npc_id": "guard_1", "player_id": "player_123", "message": "Hello!"}
            response = await ac.post("/api/chat/", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert "guard_1" in data["npc_id"]
    assert "Mock response" in data["response"]
