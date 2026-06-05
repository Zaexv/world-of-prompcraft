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


def _make_paren_colon_pattern(names: set[str]) -> re.Pattern[str]:
    # Paren-colon form: ``(offer_item: "Plato de Jamón Ibérico")``.
    # Some models write the call name *inside* the parens followed by a colon.
    alternation = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(rf"\(\s*({alternation})\s*:\s*([^()]*)\)", re.IGNORECASE)


def _make_star_pattern(names: set[str]) -> re.Pattern[str]:
    # Star form: ``*deal_damage target=player amount=20 damage_type=physical*``.
    # Requires at least one whitespace after the name so bare ``*word*`` action
    # markers (not tool calls) are left untouched.
    alternation = "|".join(re.escape(n) for n in sorted(names, key=len, reverse=True))
    return re.compile(rf"\*\s*({alternation})\s+(.*?)\s*\*", re.IGNORECASE | re.DOTALL)


# ── Generic leak cleanup (model-agnostic, not tied to the bound tool list) ──
#
# Reasoning/think blocks some local models emit into content despite a
# ``reasoning_effort=none`` request. Closed form is removed entirely; an
# *unclosed* opener means the rest of the message is reasoning, so everything
# from the tag to the end is dropped.
_REASON_TAGS = r"thought|think|thinking|reasoning|analysis|scratchpad"
_REASONING_BLOCK = re.compile(
    rf"<\s*(?:{_REASON_TAGS})\s*>[\s\S]*?<\s*/\s*(?:{_REASON_TAGS})\s*>", re.IGNORECASE
)
_REASONING_OPEN_TO_END = re.compile(rf"<\s*(?:{_REASON_TAGS})\b[\s\S]*$", re.IGNORECASE)

# Harmony/channel control tokens some models (e.g. gpt-oss) leak into content.
# Tokenizers mangle the pipes, so the bracket/pipe combo is matched loosely:
# ``<|channel|>``, ``<channel|>``, ``<|message|>``, ``<|start|>``, ``<|end|>``.
_CHANNEL_NAMES = r"channel|message|start|end|return|assistant|user|system"
_CHANNEL_MARKER = re.compile(rf"<\|?\s*(?:{_CHANNEL_NAMES})\s*\|?>", re.IGNORECASE)
# A channel-name word glued to a marker (``thought <channel|>``). Only stripped
# next to a marker so the plain English words survive everywhere else.
_CHANNEL_WORD = re.compile(
    rf"\b(?:thought|analysis|commentary|assistantfinal|final)\b\s*"
    rf"(?=<\|?\s*(?:{_CHANNEL_NAMES})\s*\|?>)",
    re.IGNORECASE,
)
# A bare channel word left at the very start once the marker itself is gone.
_LEADING_CHANNEL_WORD = re.compile(
    r"^\s*(?:thought|analysis|commentary|assistantfinal)\b[\s:]*", re.IGNORECASE
)
# Leftover call syntax for tools the model *hallucinated* (not in the bound set),
# e.g. ``own_item('jamon')`` or ``own_item('Beginner\'s Guide', 0)``. Matched
# conservatively — a name glued to parens whose body contains a *quoted* argument
# (any arg count) — so natural prose like ``apples(red)`` and bare numeric forms
# like ``cast_spell(3)`` are left alone.
_LEFTOVER_CALL = re.compile(r"\b[a-z][a-z0-9_]*\([^()]*['\"][^()]*\)", re.IGNORECASE)
# Empty enclosure left once a wrapped call is stripped: ``[give_gold(50)]`` or
# ``(emote('wave'))`` becomes ``[ ]`` / ``( )``. Drop brackets/parens/braces that
# now hold only whitespace; mismatched pairs (``[ )``) are residue too.
_EMPTY_ENCLOSURE = re.compile(r"[\[\(\{]\s*[\]\)\}]")


def _strip_leaked_markup(text: str) -> str:
    """Remove reasoning blocks, channel tokens, and stray call/enclosure residue."""
    text = _REASONING_BLOCK.sub(" ", text)
    text = _REASONING_OPEN_TO_END.sub(" ", text)
    text = _CHANNEL_WORD.sub(" ", text)
    text = _CHANNEL_MARKER.sub(" ", text)
    text = _LEADING_CHANNEL_WORD.sub("", text)
    text = _LEFTOVER_CALL.sub(" ", text)
    # Repeat until stable so nested residue (``[( )]`` → ``[ ]`` → empty) collapses.
    while _EMPTY_ENCLOSURE.search(text):
        text = _EMPTY_ENCLOSURE.sub(" ", text)
    return text


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
    escaped = False
    for ch in arg_str:
        is_sep = ch.isspace() if on_ws else ch == sep
        if quote:
            buf.append(ch)
            if escaped:  # previous char was a backslash → this char is literal
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
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
        # Drop the wrapping quotes, then unescape inline backslash escapes the
        # model wrote (``Beginner\'s Guide`` → ``Beginner's Guide``) so the raw
        # backslash never reaches inventory/combat-log display.
        return re.sub(r"\\(['\"\\])", r"\1", t[1:-1])
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
    if not text:
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

    def _consume_body(match: re.Match[str]) -> str:
        """Shared handler for XML-tag, paren-colon, and star forms (all use
        space-separated ``key=value`` bodies or a single positional value)."""
        name = canonical.get(match.group(1).lower())
        if name is None:  # pragma: no cover - pattern is built from known names
            return match.group(0)
        body = match.group(2).strip()
        tokens = _split_on(body, " ") if "=" in body else ([body] if body else [])
        calls.append({"name": name, "args": _assign_args(params_by_tool[name], tokens)})
        return " "

    cleaned = text
    if params_by_tool:
        cleaned = _make_tag_pattern(names).sub(_consume_body, cleaned)
        cleaned = _make_call_pattern(names).sub(_consume_call, cleaned)
        cleaned = _make_paren_colon_pattern(names).sub(_consume_body, cleaned)
        cleaned = _make_star_pattern(names).sub(_consume_body, cleaned)
    # Strip <em> tags — keep inner text, discard markup.
    cleaned = re.sub(r"<em>\s*</em>", " ", cleaned, flags=re.DOTALL)
    cleaned = re.sub(r"<em>(.*?)</em>", r"\1", cleaned, flags=re.DOTALL)
    # Drop reasoning/channel tokens and hallucinated (unknown-tool) call residue.
    cleaned = _strip_leaked_markup(cleaned)
    # Collapse whitespace left behind and trim stray wrapping quotes/space.
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip("\"'").strip()
    return cleaned, calls
