"""Tests for the inline tool-call fallback parser.

Local models (Qwen via ollama) sometimes emit tool calls as plain text instead
of structured ``tool_calls``. The parser must recover both the function-call
form and the XML/tag form, run the right tools, and strip the syntax from the
dialogue shown to the player.
"""

from __future__ import annotations

from src.agents.nodes.inline_tools import extract_inline_tool_calls

PARAMS = {
    "emote": [("animation", "string")],
    "spawn_effect": [("effect_type", "string"), ("duration", "number")],
    "deal_damage": [
        ("target", "string"),
        ("amount", "integer"),
        ("damage_type", "string"),
    ],
    "start_quest": [("quest_id", "string")],
}


def test_no_calls_returns_text_unchanged() -> None:
    text = "Hello traveller, the weather is fine today."
    cleaned, calls = extract_inline_tool_calls(text, PARAMS)
    assert cleaned == text
    assert calls == []


def test_empty_inputs() -> None:
    assert extract_inline_tool_calls("", PARAMS) == ("", [])
    assert extract_inline_tool_calls("anything", {}) == ("anything", [])


def test_xml_tag_form() -> None:
    text = (
        "<emote>threaten</emote> <spawn_effect>smoke</spawn_effect> "
        "<deal_damage>target=player amount=24 damage_type=physical</deal_damage>"
    )
    cleaned, calls = extract_inline_tool_calls(text, PARAMS)
    assert cleaned == ""
    assert calls == [
        {"name": "emote", "args": {"animation": "threaten"}},
        {"name": "spawn_effect", "args": {"effect_type": "smoke"}},
        {
            "name": "deal_damage",
            "args": {"target": "player", "amount": 24, "damage_type": "physical"},
        },
    ]


def test_function_call_form_strips_and_parses() -> None:
    text = "Giggles. Deal_damage(12, 'dark') Try not to trip!"
    cleaned, calls = extract_inline_tool_calls(text, PARAMS)
    assert cleaned == "Giggles. Try not to trip!"
    # Capitalized name is matched case-insensitively; the integer 12 is assigned
    # to the integer `amount` rather than the leading string `target`.
    assert calls == [{"name": "deal_damage", "args": {"amount": 12, "target": "dark"}}]


def test_function_call_with_dialogue_between() -> None:
    text = "emote('wave') \"Hi!\" start_quest('village_patrol')"
    cleaned, calls = extract_inline_tool_calls(text, PARAMS)
    assert cleaned == "Hi!"
    assert calls == [
        {"name": "emote", "args": {"animation": "wave"}},
        {"name": "start_quest", "args": {"quest_id": "village_patrol"}},
    ]


def test_xml_bare_body_is_single_positional() -> None:
    cleaned, calls = extract_inline_tool_calls("<emote>wave happily</emote>", PARAMS)
    assert cleaned == ""
    assert calls == [{"name": "emote", "args": {"animation": "wave happily"}}]


def test_unknown_tool_left_untouched() -> None:
    text = "<unknown_tool>foo</unknown_tool> cast_spell(3)"
    cleaned, calls = extract_inline_tool_calls(text, PARAMS)
    assert calls == []
    assert "unknown_tool" in cleaned
    assert "cast_spell" in cleaned
