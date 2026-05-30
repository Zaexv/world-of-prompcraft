"""Fallback parser for tool calls emitted as plain text.

Some local models (e.g. Qwen via ollama) do not reliably produce structured
OpenAI-style ``tool_calls``. Instead they write the call inline in the message
content. Two shapes show up in practice:

* function-call style — ``emote('wave') "Hello!" start_quest('village_patrol')``
* XML/tag style — ``<emote>threaten</emote>
  <deal_damage>target=player amount=24 damage_type=physical</deal_damage>``

Left unhandled, the action never fires and the raw call syntax leaks into the
dialogue shown to the player. This module extracts both shapes so the agent can
run the real tools and display clean dialogue.
"""

from __future__ import annotations

import re
from typing import Any


def _make_call_pattern(names: set[str]) -> re.Pattern[str]:
    # Longer names first so e.g. ``give_quest`` is preferred over a hypothetical
    # ``give``. Args are captured non-greedily; our tools take no nested parens.
    # Case-insensitive: local models often capitalize calls (``Deal_damage``).
    alternation = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(rf"\b({alternation})\s*\(([^()]*)\)", re.IGNORECASE)


def _make_tag_pattern(names: set[str]) -> re.Pattern[str]:
    # XML/tag form: ``<deal_damage>target=player amount=24</deal_damage>``. The
    # closing tag must repeat the opening name (backreference). Body may span
    # lines, so DOTALL; case-insensitive for the same reason as the call form.
    alternation = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(rf"<({alternation})>([\s\S]*?)</\1>", re.IGNORECASE | re.DOTALL)


def _json_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "number"
    return "string"


def _compatible(value_type: str, param_type: str) -> bool:
    if value_type == param_type:
        return True
    numeric = {"integer", "number"}
    return value_type in numeric and param_type in numeric


def _split_on(arg_str: str, sep: str) -> list[str]:
    """Split *arg_str* on top-level occurrences of *sep*, respecting quotes.

    ``sep`` is either ``","`` (function-call form) or ``" "`` to mean "any run
    of whitespace" (XML/tag form, e.g. ``target=player amount=24``).
    """
    on_ws = sep == " "
    args: list[str] = []
    buf: list[str] = []
    quote: str | None = None
    for ch in arg_str:
        is_sep = ch.isspace() if on_ws else ch == sep
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            buf.append(ch)
        elif is_sep:
            if buf:
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


def _assign_args(params: list[tuple[str, str]], tokens: list[str]) -> dict[str, Any]:
    """Resolve ``key=value`` and positional tokens into a kwargs dict.

    Positional values are assigned to the first unfilled parameter whose type is
    compatible, so e.g. ``deal_damage(12, 'dark')`` puts 12 in the integer
    ``amount`` rather than the string ``target``. Falls back to the next slot.
    """
    kwargs: dict[str, Any] = {}
    positional: list[Any] = []
    for token in tokens:
        key, sep, val = token.partition("=")
        if sep and key.strip().isidentifier():
            kwargs[key.strip()] = _coerce(val)
        else:
            positional.append(_coerce(token))
    unfilled = [(n, t) for n, t in params if n not in kwargs]
    for value in positional:
        value_type = _json_type(value)
        idx = next(
            (i for i, (_, t) in enumerate(unfilled) if _compatible(value_type, t)),
            0 if unfilled else None,
        )
        if idx is None:
            break
        param_name, _ = unfilled.pop(idx)
        kwargs[param_name] = value
    return kwargs


def extract_inline_tool_calls(
    text: str, params_by_tool: dict[str, list[tuple[str, str]]]
) -> tuple[str, list[dict[str, Any]]]:
    """Convert tool calls written as plain text into call dicts.

    Handles both the function-call form ``deal_damage(12, 'dark')`` and the
    XML/tag form ``<deal_damage>target=player amount=24</deal_damage>``.

    Args:
        text: The model's message content.
        params_by_tool: Maps each known tool name to its ordered ``(param_name,
            json_type)`` pairs, used to assign positional arguments by type.

    Returns:
        A ``(cleaned_text, calls)`` tuple where ``calls`` is a list of
        ``{"name": str, "args": dict}`` dicts and ``cleaned_text`` has the call
        syntax removed.
    """
    if not text or not params_by_tool:
        return text, []

    names = set(params_by_tool)
    canonical = {name.lower(): name for name in params_by_tool}
    calls: list[dict[str, Any]] = []

    def _consume_call(match: re.Match[str]) -> str:
        name = canonical.get(match.group(1).lower())
        if name is None:  # pragma: no cover - pattern is built from known names
            return match.group(0)
        tokens = _split_on(match.group(2), ",")
        calls.append({"name": name, "args": _assign_args(params_by_tool[name], tokens)})
        return " "

    def _consume_tag(match: re.Match[str]) -> str:
        name = canonical.get(match.group(1).lower())
        if name is None:  # pragma: no cover - pattern is built from known names
            return match.group(0)
        body = match.group(2).strip()
        # A body with ``=`` is space-separated ``key=value`` pairs; otherwise the
        # whole body is a single positional value (e.g. ``<emote>threaten</emote>``).
        tokens = _split_on(body, " ") if "=" in body else ([body] if body else [])
        calls.append({"name": name, "args": _assign_args(params_by_tool[name], tokens)})
        return " "

    cleaned = _make_tag_pattern(names).sub(_consume_tag, text)
    cleaned = _make_call_pattern(names).sub(_consume_call, cleaned)
    # Collapse whitespace left behind and trim stray wrapping quotes/space.
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip("\"'").strip()
    return cleaned, calls
