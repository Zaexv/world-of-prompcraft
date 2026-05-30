"""Tests for world-update payload throttling helpers."""

from __future__ import annotations

from src.world.world_state import NPCData
from src.ws import handler as ws_handler


def _npc(npc_id: str) -> NPCData:
    return NPCData(
        npc_id=npc_id,
        name=npc_id,
        personality="npc",
    )


def test_should_send_npc_snapshot_on_first_move(
    monkeypatch,
) -> None:
    player_id = "player-one"
    ws_handler.cleanup_player_locks(player_id)
    monkeypatch.setattr(ws_handler.settings, "npc_sync_interval_seconds", 1.0)
    monkeypatch.setattr(ws_handler.time, "monotonic", lambda: 10.0)

    assert ws_handler._should_send_npc_snapshot(player_id, [_npc("npc_a")]) is True

    ws_handler.cleanup_player_locks(player_id)


def test_should_skip_npc_snapshot_when_recent_and_unchanged(
    monkeypatch,
) -> None:
    player_id = "player-two"
    ws_handler.cleanup_player_locks(player_id)
    monkeypatch.setattr(ws_handler.settings, "npc_sync_interval_seconds", 1.0)

    times = iter([10.0, 10.2])
    monkeypatch.setattr(ws_handler.time, "monotonic", lambda: next(times))

    assert ws_handler._should_send_npc_snapshot(player_id, [_npc("npc_a")]) is True
    assert ws_handler._should_send_npc_snapshot(player_id, [_npc("npc_a")]) is False

    ws_handler.cleanup_player_locks(player_id)


def test_should_send_npc_snapshot_when_set_changes(
    monkeypatch,
) -> None:
    player_id = "player-three"
    ws_handler.cleanup_player_locks(player_id)
    monkeypatch.setattr(ws_handler.settings, "npc_sync_interval_seconds", 1.0)

    times = iter([10.0, 10.2])
    monkeypatch.setattr(ws_handler.time, "monotonic", lambda: next(times))

    assert ws_handler._should_send_npc_snapshot(player_id, [_npc("npc_a")]) is True
    assert ws_handler._should_send_npc_snapshot(player_id, [_npc("npc_b")]) is True

    ws_handler.cleanup_player_locks(player_id)


def test_should_send_npc_snapshot_after_interval_elapses(
    monkeypatch,
) -> None:
    player_id = "player-four"
    ws_handler.cleanup_player_locks(player_id)
    monkeypatch.setattr(ws_handler.settings, "npc_sync_interval_seconds", 1.0)

    times = iter([10.0, 11.2])
    monkeypatch.setattr(ws_handler.time, "monotonic", lambda: next(times))

    assert ws_handler._should_send_npc_snapshot(player_id, [_npc("npc_a")]) is True
    assert ws_handler._should_send_npc_snapshot(player_id, [_npc("npc_a")]) is True

    ws_handler.cleanup_player_locks(player_id)


def test_build_world_update_payload_omits_npcs_when_not_provided() -> None:
    payload = ws_handler._build_world_update_payload(players=[{"playerId": "p1"}], npcs=None)

    assert payload == {"type": "world_update", "players": [{"playerId": "p1"}]}
