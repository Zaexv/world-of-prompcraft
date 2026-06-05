"""The speaking channel.

``reason``/``act`` own the *reasoning* channel: they think and run tools, and
their prose is no longer the source of truth for what the player hears. This node
owns the *speaking* channel — a dedicated, tool-free LLM call whose only job is to
compose one in-character line. Its budget is never polluted by reasoning or
tool-selection tokens, so it essentially always produces text.

Fast path: a pure-chat turn where ``reason`` already produced clean prose and no
tools fired reuses that text directly (one LLM call, the common case). Only action
turns or empty completions pay for the extra speak call.
"""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from langchain_core.messages import HumanMessage, SystemMessage

from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from .constants import EMPTY_DIALOGUE
from .inline_tools import extract_inline_tool_calls
from .prompt_parts import length_budget_instruction, relationship_tier

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

# Empty emphasis left behind after an inline tool call (e.g. ``*emote('wave')*``)
# is stripped: the ``emote('wave')`` is removed, leaving ``* *``.
_EMPTY_EMPHASIS = re.compile(r"\*\s*\*")


def _clean_speak_text(text: str, params_by_tool: dict[str, list[tuple[str, str]]]) -> str:
    """Strip inline tool-call syntax local models leak into spoken prose.

    The speaking channel binds no tools, but some models still write calls as
    text (``emote('wave')``, ``*deal_damage target=player*``). The real actions
    were already executed in the reason/act phase, so here we only discard the
    leaked syntax and keep clean dialogue.
    """
    cleaned, _ = extract_inline_tool_calls(text, params_by_tool)
    cleaned = _EMPTY_EMPHASIS.sub(" ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


_RECENT_TAIL = 4
_SPEAK_DIRECTIVE = (
    "(Reply to the player now, in character — one short spoken line. "
    "Speak only dialogue: no narration, no tool names, do not mention being an AI.)"
)


def _action_phrase(action: dict[str, Any]) -> str:
    """Return a short, player-facing description of a single executed action."""
    kind = action.get("kind", "")
    params = action.get("params", {}) if isinstance(action.get("params"), dict) else {}
    item = params.get("item", "something")
    amount = params.get("amount", 0)
    price = params.get("price", 0)
    if kind == "give_item":
        return f"handed over {item}"
    if kind == "give_gold":
        return f"gave the player {amount} gold"
    if kind == "complete_purchase":
        return f"sold {item} for {price} gold"
    if kind == "sell_item":
        return f"bought {item} from the player for {price} gold"
    if kind in ("take_item", "remove_item"):
        return f"took {item}"
    if kind in ("deal_damage", "damage", "damage_npc", "damage_player"):
        return "struck the player"
    if kind in ("heal_target", "heal", "heal_player"):
        return "healed the player"
    if kind == "apply_status":
        return "cast a spell"
    if kind == "start_quest":
        return "offered a quest"
    if kind == "complete_quest":
        return "completed a quest"
    return ""


def action_digest(pending_actions: list[dict[str, Any]] | None) -> str:
    """Build a one-line digest of the actions just taken, or '' when none.

    Internal/visual-only kinds (mood, movement, effects, emotes) are omitted —
    they do not change what the NPC would say about the exchange.
    """
    if not pending_actions:
        return ""
    phrases = [p for a in pending_actions if (p := _action_phrase(a))]
    if not phrases:
        return ""
    return "You just: " + "; ".join(phrases) + "."


def build_speak_prompt(state: NPCAgentState) -> str:
    """Compact system prompt for the speaking channel.

    A subset of the reasoning prompt: persona, mood, relationship, long-term
    memory, and a digest of what was just done — enough to speak in voice and
    acknowledge the turn's actions, without the reasoning scaffolding.
    """
    parts = [
        f"You are {state.get('npc_name', 'an NPC')}, an NPC in the world of Promptcraft.",
        "",
        "## Your Personality",
        state.get("npc_personality", "You are a helpful villager."),
    ]

    mood = state.get("mood", "neutral") or "neutral"
    parts.extend(["", f"## Your Current Mood: {mood}"])

    score = state.get("relationship_score", 0) or 0
    parts.append(f"## Your Relationship with This Player ({score}): {relationship_tier(score)}")

    summary = state.get("conversation_summary", "")
    if summary:
        parts.extend(
            ["", "## Your Memory of This Player", f"From past conversations you recall: {summary}"]
        )

    notes = state.get("personality_notes", "")
    if notes:
        parts.extend(["", f"## Personal Notes: {notes}"])

    digest = action_digest(state.get("pending_actions", []))
    if digest:
        parts.extend(
            [
                "",
                "## What You Just Did",
                digest,
                "Speak as if you have just done this — acknowledge it naturally.",
            ]
        )

    parts.extend(
        [
            "",
            "## Instructions",
            "Reply to the player in character.",
            length_budget_instruction(False),
            "Your mood, relationship, and memories should naturally colour your dialogue.",
        ]
    )
    return "\n".join(parts)


def make_respond_node(llm: BaseChatModel, tools: list[BaseTool] | None = None) -> Any:
    """Return a respond node that speaks via a dedicated, tool-free LLM call."""
    params_by_tool: dict[str, list[tuple[str, str]]] = {
        t.name: [(name, info.get("type", "string")) for name, info in t.args.items()]
        for t in (tools or [])
    }

    async def respond_node(state: NPCAgentState) -> dict[str, Any]:
        pending = state.get("pending_actions", [])
        messages = state.get("messages", [])
        last = messages[-1] if messages else None
        raw = (getattr(last, "content", "") if last is not None else "") or ""

        # Fast path: reuse reason's prose whenever it produced any. After the
        # act → reason loop, reason runs again and its final pass is usually
        # clean dialogue (already inline-tool-stripped), so action turns —
        # trade, quest, heal, combat — cost no extra LLM round-trip.
        if raw and raw != EMPTY_DIALOGUE:
            cleaned = _clean_speak_text(raw, params_by_tool)
            return {"response_text": cleaned or EMPTY_DIALOGUE, "pending_actions": pending}

        # Speak path: only when reason came back empty/"..." → dedicated call.
        tail = [m for m in messages[-_RECENT_TAIL:] if getattr(m, "content", "")]
        try:
            result = await llm.ainvoke(
                [
                    SystemMessage(content=build_speak_prompt(state)),
                    *tail,
                    HumanMessage(content=_SPEAK_DIRECTIVE),
                ]
            )
            text = _clean_speak_text(getattr(result, "content", "") or "", params_by_tool)
        except Exception:
            logger.warning("Speak call failed; deferring to fallback_node", exc_info=True)
            text = ""

        # Leave EMPTY_DIALOGUE so fallback_node can still substitute an action line.
        return {"response_text": text or EMPTY_DIALOGUE, "pending_actions": pending}

    return respond_node
