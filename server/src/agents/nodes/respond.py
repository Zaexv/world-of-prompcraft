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
from .prompt_parts import (
    global_directive_section,
    length_budget_instruction,
    relationship_tier,
)

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


# Markers/heuristics that a turn's raw content is leaked chain-of-thought rather
# than dialogue: an open reasoning tag, harmony channel words, or telltale
# meta-talk. Such content must NOT be reused verbatim — it routes to the
# dedicated, tool-free speak call instead.
_REASONING_HINT = re.compile(
    r"<\s*(?:thought|think|thinking|reasoning|analysis|channel)\b"
    r"|no tool calls?\s+(?:needed|required)"
    r"|looking at (?:my|the) (?:instructions|tool)",
    re.IGNORECASE,
)


def _looks_like_leaked_reasoning(text: str) -> bool:
    """True when raw content is a reasoning dump or a degenerate repetition loop."""
    if _REASONING_HINT.search(text):
        return True
    if len(text) > 1000:  # dialogue budget is ~180 tokens; this is runaway
        return True
    words = text.split()
    # A loop ("Wait, I'll use ` `." repeated) has very low lexical diversity.
    return len(words) >= 60 and len(set(words)) / len(words) < 0.25


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
    if kind in ("accept_quest", "start_quest", "offer_quest"):
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
    parts.extend(global_directive_section())
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

        # Fast path: reuse reason's prose whenever it produced clean dialogue.
        # After the act → reason loop, reason's final pass is usually clean
        # dialogue, so action turns — trade, quest, heal, combat — cost no extra
        # LLM round-trip. Skip the reuse when the content is leaked reasoning or
        # empties out after stripping; those fall through to the speak call.
        if raw and raw != EMPTY_DIALOGUE and not _looks_like_leaked_reasoning(raw):
            cleaned = _clean_speak_text(raw, params_by_tool)
            if cleaned:
                return {"response_text": cleaned, "pending_actions": pending}

        # Speak path: reason came back empty/"..."/leaked → dedicated tool-free call.
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
            # Last-resort guard: if even the dedicated call loops/leaks, drop it so
            # fallback_node substitutes a clean action line rather than a wall of CoT.
            if _looks_like_leaked_reasoning(text):
                text = ""
        except Exception:
            logger.warning("Speak call failed; deferring to fallback_node", exc_info=True)
            text = ""

        # Leave EMPTY_DIALOGUE so fallback_node can still substitute an action line.
        return {"response_text": text or EMPTY_DIALOGUE, "pending_actions": pending}

    return respond_node
