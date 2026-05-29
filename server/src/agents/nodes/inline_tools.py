"""Fallback parser for tool calls emitted as plain text.

Some local models (e.g. Qwen via ollama) do not reliably produce structured
OpenAI-style ``tool_calls``. Instead they write the call inline in the message
content, e.g. ``emote('wave') "Hello!" start_quest('village_patrol')``. Left
unhandled, the action never fires and the raw call syntax leaks into the
dialogue shown to the player. This module extracts those inline calls so the
agent can run the real tools and display clean dialogue.
"""

from __future__ import annotations

import re
from typing import Any


def _make_call_pattern(names: set[str]) -> re.Pattern[str]:
    # Longer names first so e.g. ``give_quest`` is preferred over a hypothetical
    # ``give``. Args are captured non-greedily; our tools take no nested parens.
    alternation = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(rf"\b({alternation})\s*\(([^()]*)\)")


def _split_args(arg_str: str) -> list[str]:
    """Split a call's argument string on top-level commas, respecting quotes."""
    args: list[str] = []
    buf: list[str] = []
    quote: str | None = None
    for ch in arg_str:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            buf.append(ch)
        elif ch == ",":
            args.append("".join(buf).strip())
            buf = []
        else:
            buf.append(ch)
    tail = "".join(buf).strip()
    if tail:
        args.append(tail)
    return [a for a in args if a]


def _coerce(token: str) -> Any:
    t = token.strip()
    if len(t) >= 2 and t[0] in "\"'" and t[-1] == t[0]:
        return t[1:-1]
    if re.fullmatch(r"-?\d+", t):
        return int(t)
    if re.fullmatch(r"-?\d+\.\d+", t):
        return float(t)
    if t.lower() in ("true", "false"):
        return t.lower() == "true"
    return t


def extract_inline_tool_calls(
    text: str, arg_names_by_tool: dict[str, list[str]]
) -> tuple[str, list[dict[str, Any]]]:
    """Convert function-style tool calls written as plain text into call dicts.

    Args:
        text: The model's message content.
        arg_names_by_tool: Maps each known tool name to its ordered parameter
            names (used to assign positional arguments).

    Returns:
        A ``(cleaned_text, calls)`` tuple where ``calls`` is a list of
        ``{"name": str, "args": dict}`` dicts and ``cleaned_text`` has the call
        syntax removed.
    """
    if not text or not arg_names_by_tool:
        return text, []

    pattern = _make_call_pattern(set(arg_names_by_tool))
    calls: list[dict[str, Any]] = []

    def _consume(match: re.Match[str]) -> str:
        name = match.group(1)
        param_names = arg_names_by_tool.get(name, [])
        kwargs: dict[str, Any] = {}
        for idx, token in enumerate(_split_args(match.group(2))):
            key, sep, val = token.partition("=")
            if sep and key.strip().isidentifier():
                kwargs[key.strip()] = _coerce(val)
            elif idx < len(param_names):
                kwargs[param_names[idx]] = _coerce(token)
        calls.append({"name": name, "args": kwargs})
        return " "

    cleaned = pattern.sub(_consume, text)
    # Collapse whitespace left behind and trim stray wrapping quotes/space.
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip("\"'").strip()
    return cleaned, calls
