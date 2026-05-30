"""Tests for dialogue tools and leaked-action recovery."""

from __future__ import annotations

from src.agents.tools.dialogue import (
    VALID_ANIMATIONS,
    VALID_SKINS,
    create_dialogue_tools,
    extract_leaked_actions,
)


def _tool(name: str):
    tools = create_dialogue_tools([], {})
    return next(t for t in tools if t.name == name)


def test_dialogue_tools_registered() -> None:
    names = {t.name for t in create_dialogue_tools([], {})}
    assert {"emote", "give_quest", "complete_quest", "set_skin"} <= names


def test_emote_tool_appends_valid_action() -> None:
    actions: list = []
    tools = create_dialogue_tools(actions, {})
    emote = next(t for t in tools if t.name == "emote")
    emote.invoke({"animation": "bow"})
    assert actions == [{"kind": "emote", "params": {"animation": "bow"}}]


def test_emote_tool_rejects_invalid_animation() -> None:
    actions: list = []
    tools = create_dialogue_tools(actions, {})
    emote = next(t for t in tools if t.name == "emote")
    result = emote.invoke({"animation": "moonwalk"})
    assert actions == []
    assert "Invalid" in result


def test_set_skin_tool_appends_and_normalizes() -> None:
    actions: list = []
    tools = create_dialogue_tools(actions, {})
    set_skin = next(t for t in tools if t.name == "set_skin")
    set_skin.invoke({"style": "Dragon"})
    assert actions == [{"kind": "set_skin", "params": {"style": "dragon"}}]


def test_set_skin_tool_rejects_invalid_skin() -> None:
    actions: list = []
    tools = create_dialogue_tools(actions, {})
    set_skin = next(t for t in tools if t.name == "set_skin")
    result = set_skin.invoke({"style": "wizardy"})
    assert actions == []
    assert "Invalid" in result


def test_valid_sets_are_lowercase() -> None:
    assert all(a == a.lower() for a in VALID_ANIMATIONS)
    assert all(s == s.lower() for s in VALID_SKINS)


def test_extract_recovers_leaked_emote_and_keeps_roleplay() -> None:
    clean, actions = extract_leaked_actions(
        "Greetings traveler! *waves enthusiastically* emote('wave')"
    )
    assert clean == "Greetings traveler! *waves enthusiastically*"
    assert actions == [{"kind": "emote", "params": {"animation": "wave"}}]


def test_extract_recovers_leaked_set_skin() -> None:
    clean, actions = extract_leaked_actions("Behold! set_skin(style='dragon') *roars*")
    assert "set_skin" not in clean
    assert {"kind": "set_skin", "params": {"style": "dragon"}} in actions


def test_extract_handles_keyword_and_quote_variants() -> None:
    _, actions = extract_leaked_actions('I bow. emote(animation="bow")')
    assert actions == [{"kind": "emote", "params": {"animation": "bow"}}]


def test_extract_strips_invalid_calls_without_emitting() -> None:
    clean, actions = extract_leaked_actions("Hmm. emote('shrug')")
    assert "emote(" not in clean  # leaked code is always removed
    assert actions == []


def test_extract_dedupes_repeated_calls() -> None:
    _, actions = extract_leaked_actions("emote('wave') and again emote('wave')")
    assert actions == [{"kind": "emote", "params": {"animation": "wave"}}]


def test_extract_leaves_plain_roleplay_untouched() -> None:
    text = "Pure roleplay *waves* with **emphasis** and no leak"
    clean, actions = extract_leaked_actions(text)
    assert clean == text
    assert actions == []
