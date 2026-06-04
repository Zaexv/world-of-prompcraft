#!/usr/bin/env python3
"""
Generate a PDF presentation for LLMDays Hamburg about World of Promptcraft.
Uses fpdf2 to create a slide deck with a dark RPG theme.
"""

from fpdf import FPDF
from fpdf.enums import XPos, YPos
import os

# --- Colour palette ----------------------------------------------------------
BG_DARK    = (15,  20,  35)   # very dark navy
BG_SLIDE   = (20,  28,  48)   # slide background
ACCENT     = (74, 144, 217)   # Promptcraft blue
ACCENT2    = (230, 126, 34)   # warm amber
ACCENT3    = (39, 174, 96)    # green
ACCENT4    = (155, 89, 182)   # purple
ACCENT5    = (231, 76, 60)    # red
WHITE      = (255, 255, 255)
LIGHT_GREY = (180, 190, 210)
MID_GREY   = (90, 100, 130)
DARK_GREY  = (40,  50,  70)
YELLOW     = (241, 196, 15)


# --- Slide dimensions (16:9) -------------------------------------------------
W, H = 297, 167   # mm  (A4 landscape ~= 16:9)


class Deck(FPDF):
    """FPDF subclass with slide-building helpers."""

    def slide_bg(self, gradient=True):
        """Fill the slide background."""
        self.set_fill_color(*BG_SLIDE)
        self.rect(0, 0, W, H, "F")
        if gradient:
            # subtle top bar
            self.set_fill_color(*BG_DARK)
            self.rect(0, 0, W, 2, "F")

    def accent_bar(self, color=ACCENT, y=0, h=8):
        """Draw a coloured accent bar across the top."""
        self.set_fill_color(*color)
        self.rect(0, y, W, h, "F")

    def title_text(self, text, y=20, size=38, color=WHITE, align="C"):
        self.set_text_color(*color)
        self.set_font("Helvetica", "B", size)
        self.set_xy(10, y)
        self.cell(W - 20, 0, text, align=align, new_x=XPos.LEFT, new_y=YPos.NEXT)

    def subtitle_text(self, text, y=None, size=16, color=LIGHT_GREY, align="C"):
        if y is not None:
            self.set_xy(10, y)
        self.set_text_color(*color)
        self.set_font("Helvetica", "", size)
        self.cell(W - 20, 0, text, align=align, new_x=XPos.LEFT, new_y=YPos.NEXT)

    def body_text(self, text, x=20, y=None, w=None, size=11, color=LIGHT_GREY, bold=False):
        if y is not None:
            self.set_xy(x, y)
        self.set_text_color(*color)
        self.set_font("Helvetica", "B" if bold else "", size)
        self.multi_cell(w or (W - x - 15), 6, text, new_x=XPos.LEFT, new_y=YPos.NEXT)

    def bullet(self, text, x=25, indent=0, color=LIGHT_GREY, size=11, dot_color=ACCENT):
        self.set_text_color(*dot_color)
        self.set_font("Helvetica", "B", size)
        self.set_x(x + indent)
        self.cell(5, 6, chr(149), new_x=XPos.RIGHT, new_y=YPos.LAST)
        self.set_text_color(*color)
        self.set_font("Helvetica", "", size)
        self.multi_cell(W - x - indent - 20, 6, text, new_x=XPos.LEFT, new_y=YPos.NEXT)

    def code_box(self, code, x=20, y=None, w=None, size=8):
        """Render a code block with a dark background."""
        if y is not None:
            self.set_xy(x, y)
        bx = self.get_x()
        by = self.get_y()
        bw = w or (W - x - 15)
        lines = code.strip().split("\n")
        bh = len(lines) * 5 + 6
        self.set_fill_color(*BG_DARK)
        self.rect(bx, by, bw, bh, "F")
        # left accent stripe
        self.set_fill_color(*ACCENT)
        self.rect(bx, by, 2, bh, "F")
        self.set_text_color(*ACCENT3)
        self.set_font("Courier", "", size)
        self.set_xy(bx + 4, by + 3)
        for line in lines:
            self.set_x(bx + 4)
            self.cell(bw - 6, 5, line, new_x=XPos.LEFT, new_y=YPos.NEXT)
        self.set_xy(bx, by + bh + 2)

    def tag_badge(self, label, x, y, color=ACCENT, text_color=WHITE):
        """Small coloured badge/tag."""
        self.set_font("Helvetica", "B", 8)
        tw = self.get_string_width(label) + 6
        self.set_fill_color(*color)
        self.set_text_color(*text_color)
        self.set_xy(x, y)
        self.cell(tw, 6, label, align="C", fill=True, new_x=XPos.RIGHT, new_y=YPos.LAST)
        return tw

    def divider(self, y, color=DARK_GREY):
        self.set_draw_color(*color)
        self.set_line_width(0.3)
        self.line(20, y, W - 20, y)

    def section_header(self, text, y, color=ACCENT, size=16):
        self.set_fill_color(*color)
        self.rect(0, y, 5, 10, "F")
        self.set_text_color(*WHITE)
        self.set_font("Helvetica", "B", size)
        self.set_xy(10, y)
        self.cell(W - 20, 10, "  " + text, new_x=XPos.LEFT, new_y=YPos.NEXT)

    def node_box(self, label, x, y, w=38, h=14, color=ACCENT, text_color=WHITE, sublabel=""):
        self.set_fill_color(*color)
        self.set_draw_color(*color)
        self.rect(x, y, w, h, "F")
        self.set_text_color(*text_color)
        self.set_font("Helvetica", "B", 9)
        self.set_xy(x, y + 2)
        self.cell(w, 5, label, align="C", new_x=XPos.LEFT, new_y=YPos.NEXT)
        if sublabel:
            self.set_font("Helvetica", "", 7)
            self.set_text_color(200, 220, 255)
            self.set_xy(x, y + 7)
            self.cell(w, 4, sublabel, align="C")

    def arrow(self, x1, y1, x2, y2, color=MID_GREY):
        self.set_draw_color(*color)
        self.set_line_width(0.5)
        self.line(x1, y1, x2, y2)
        # simple arrowhead
        dx, dy = x2 - x1, y2 - y1
        length = (dx**2 + dy**2) ** 0.5
        if length > 0:
            ux, uy = dx / length, dy / length
            ax1 = x2 - 3 * ux + 2 * uy
            ay1 = y2 - 3 * uy - 2 * ux
            ax2 = x2 - 3 * ux - 2 * uy
            ay2 = y2 - 3 * uy + 2 * ux
            self.line(x2, y2, ax1, ay1)
            self.line(x2, y2, ax2, ay2)

    def page_number(self, n, total):
        self.set_text_color(*MID_GREY)
        self.set_font("Helvetica", "", 8)
        self.set_xy(W - 25, H - 8)
        self.cell(20, 5, f"{n} / {total}", align="R")

    def footer_brand(self):
        self.set_text_color(*MID_GREY)
        self.set_font("Helvetica", "I", 7)
        self.set_xy(5, H - 8)
        self.cell(80, 5, "World of Promptcraft  -  github.com/Zaexv/world-of-prompcraft")


# --- Slide builders ----------------------------------------------------------

def slide_title(pdf: Deck):
    pdf.add_page()
    pdf.slide_bg(gradient=False)

    # Dark top half
    pdf.set_fill_color(*BG_DARK)
    pdf.rect(0, 0, W, H * 0.55, "F")

    # Accent stripes
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, H * 0.55, W, 3, "F")
    pdf.set_fill_color(*ACCENT2)
    pdf.rect(0, H * 0.55 + 3, W, 1.5, "F")

    # Title
    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 44)
    pdf.set_xy(0, 20)
    pdf.cell(W, 0, "World of Promptcraft", align="C")

    pdf.set_text_color(*ACCENT)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_xy(0, 42)
    pdf.cell(W, 0, "LangGraph-Powered NPCs in a 3D RPG", align="C")

    pdf.divider(58, color=ACCENT)

    pdf.set_text_color(*LIGHT_GREY)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_xy(0, 63)
    pdf.cell(W, 0, "Type anything.  The dragon reacts.", align="C")

    # Bottom half info
    pdf.set_text_color(*LIGHT_GREY)
    pdf.set_font("Helvetica", "", 11)
    pdf.set_xy(0, H * 0.65)
    pdf.cell(W, 0, "LLMDays Hamburg  -  2025", align="C")

    # Tech tags
    tags = [("LangGraph", ACCENT), ("FastAPI", ACCENT3), ("Three.js", ACCENT2),
            ("TypeScript", ACCENT), ("Python", ACCENT4)]
    tx = 90
    for label, color in tags:
        tw = pdf.get_string_width(label) + 8
        pdf.set_fill_color(*color)
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_xy(tx, H * 0.78)
        pdf.cell(tw, 7, label, align="C", fill=True)
        tx += tw + 4

    # GitHub link
    pdf.set_text_color(*MID_GREY)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_xy(0, H - 10)
    pdf.cell(W, 0, "github.com/Zaexv/world-of-prompcraft", align="C")


def slide_concept(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT2, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("The Idea", 10, ACCENT2)

    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_xy(20, 28)
    pdf.cell(W - 40, 0, "No buttons.  No scripted trees.  Just text.")

    pdf.set_y(38)
    pdf.bullet("You open a 3D world rendered in your browser (Three.js + WebGL).", size=12)
    pdf.bullet("Walk up to an NPC - a dragon, a merchant, a wandering knight.", size=12)
    pdf.bullet("Type anything in the chat box.  Free-form.  Unscripted.", size=12)
    pdf.bullet("The NPC reasons, acts, and responds in real-time.", size=12)

    pdf.divider(95)

    # Two columns
    # Left: classic approach
    col_w = (W - 45) // 2
    pdf.set_fill_color(*DARK_GREY)
    pdf.rect(20, 100, col_w, 52, "F")
    pdf.set_text_color(*ACCENT5)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(20, 102)
    pdf.cell(col_w, 6, "  Classic approach", new_x=XPos.LEFT, new_y=YPos.NEXT)
    for line in ["Dialogue trees", "Scripted if/else", "Hard-coded responses", "Stale after 1 hour"]:
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_x(25)
        pdf.cell(col_w - 10, 5, "[x]  " + line, new_x=XPos.LEFT, new_y=YPos.NEXT)

    # Right: agentic approach
    rx = 20 + col_w + 5
    pdf.set_fill_color(*BG_DARK)
    pdf.rect(rx, 100, col_w, 52, "F")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(rx, 100, 3, 52, "F")
    pdf.set_text_color(*ACCENT3)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(rx + 4, 102)
    pdf.cell(col_w - 4, 6, "Agentic approach", new_x=XPos.LEFT, new_y=YPos.NEXT)
    for line in ["LLM reasons each turn", "Tool calls = real game effects", "Persistent memory + mood", "Every conversation unique"]:
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_x(rx + 5)
        pdf.cell(col_w - 10, 5, "[ok]  " + line, new_x=XPos.LEFT, new_y=YPos.NEXT)


def slide_architecture(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("Architecture Overview", 10, ACCENT)

    # Left column: stack
    pdf.set_text_color(*ACCENT)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(20, 28)
    pdf.cell(80, 6, "Full Stack")

    items = [
        ("Client", "Three.js + TypeScript + Vite", ACCENT2),
        ("Transport", "WebSocket  (port 8000)", ACCENT),
        ("Server", "FastAPI + Python 3.11+", ACCENT3),
        ("Agents", "LangGraph StateGraph per NPC", ACCENT4),
        ("LLM", "Claude / OpenAI / Ollama", YELLOW),
    ]
    y = 36
    for label, val, color in items:
        pdf.set_fill_color(*color)
        pdf.rect(20, y, 3, 8, "F")
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_xy(26, y + 1)
        pdf.cell(35, 4, label)
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 9)
        pdf.set_xy(26, y + 5)
        pdf.cell(80, 4, val)
        y += 12

    # Right column: key principles
    pdf.set_text_color(*ACCENT)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(130, 28)
    pdf.cell(130, 6, "Key Principles")

    principles = [
        ("Server-authoritative", "WorldState lives on server; client is a render mirror"),
        ("One graph per NPC", "Each NPC = independent LangGraph StateGraph"),
        ("Tool-driven actions", "LLM calls typed functions -> real game effects"),
        ("Persistent memory", "MemorySaver per (npc_id, player_id) thread"),
        ("Prompt as interface", "No buttons - text IS the game mechanic"),
    ]
    y = 36
    for title, desc in principles:
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_xy(130, y)
        pdf.cell(140, 5, title)
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(130, y + 5)
        pdf.cell(150, 4, desc)
        y += 13

    pdf.divider(105)

    # Message flow diagram (simplified)
    pdf.set_text_color(*LIGHT_GREY)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_xy(20, 108)
    pdf.cell(W - 40, 5, "WebSocket Message Flow", align="C")

    nodes = [
        ("Player\ntypes text", 22, 118, 35, 16, ACCENT2),
        ("Client\nWS send", 66, 118, 30, 16, ACCENT),
        ("FastAPI\nhandler", 106, 118, 30, 16, ACCENT),
        ("LangGraph\nNPC agent", 146, 118, 35, 16, ACCENT4),
        ("ReactionSystem\n3D effects", 192, 118, 42, 16, ACCENT3),
    ]
    for label, x, y, w, h, color in nodes:
        pdf.set_fill_color(*color)
        pdf.rect(x, y, w, h, "F")
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 7)
        for i, line in enumerate(label.split("\n")):
            pdf.set_xy(x, y + 3 + i * 5)
            pdf.cell(w, 5, line, align="C")

    for i in range(len(nodes) - 1):
        _, x1, y1, w1, h1, _ = nodes[i]
        _, x2, y2, w2, h2, _ = nodes[i + 1]
        pdf.arrow(x1 + w1, y1 + h1 // 2, x2, y2 + h2 // 2, ACCENT)

    pdf.set_text_color(*MID_GREY)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_xy(20, H - 14)
    pdf.cell(W - 40, 5, "actions[] flow back: damage, emotes, weather, quests, items", align="C")


def slide_langgraph_pipeline(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT4, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("The LangGraph Pipeline", 10, ACCENT4)

    # Pipeline diagram
    nodes_data = [
        ("START", 18, 42, 20, 14, BG_DARK, WHITE),
        ("reason", 46, 42, 36, 14, ACCENT, WHITE),
        ("act", 90, 42, 32, 14, ACCENT2, WHITE),
        ("respond", 90, 80, 36, 14, ACCENT3, WHITE),
        ("reflect", 140, 80, 34, 14, ACCENT4, WHITE),
        ("summarize", 185, 80, 40, 14, ACCENT5, WHITE),
        ("END", 238, 80, 22, 14, BG_DARK, WHITE),
    ]

    for label, x, y, w, h, color, tc in nodes_data:
        pdf.set_fill_color(*color)
        pdf.rect(x, y, w, h, "F")
        pdf.set_text_color(*tc)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_xy(x, y + 3)
        pdf.cell(w, 8, label, align="C")

    # Arrows
    pdf.arrow(38, 49, 46, 49)                   # START -> reason
    pdf.arrow(82, 49, 90, 49)                   # reason -> act (tool_calls)
    pdf.arrow(106, 56, 106, 80)                 # act | -> respond (via reason again)
    pdf.arrow(82, 52, 82, 55); pdf.arrow(82, 55, 106, 55)  # reason -> respond (no tools)
    pdf.arrow(108, 87, 140, 87)                 # respond -> reflect
    pdf.arrow(174, 87, 185, 87)                 # reflect -> summarize (conditional)
    pdf.arrow(225, 87, 238, 87)                 # summarize -> END
    pdf.arrow(174, 90, 238, 90)                 # reflect -> END (direct)

    # act -> reason back arrow (loop)
    pdf.set_draw_color(*ACCENT2)
    pdf.set_line_width(0.5)
    pdf.line(106, 56, 106, 38)
    pdf.line(106, 38, 64, 38)
    pdf.line(64, 38, 64, 42)
    pdf.set_text_color(*ACCENT2)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_xy(66, 33)
    pdf.cell(40, 5, "loop (multi-tool)")

    # Labels
    pdf.set_text_color(*MID_GREY)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_xy(82, 43)
    pdf.cell(20, 4, "tool_calls")
    pdf.set_xy(46, 60)
    pdf.cell(30, 4, "no tool_calls")

    pdf.set_text_color(*MID_GREY)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_xy(185, 70)
    pdf.cell(40, 4, "conditional")

    pdf.divider(105)

    # Node descriptions
    descs = [
        (ACCENT,  "reason",    "LLM CALL",   "Builds system prompt, injects world context + memory + RAG lore.\nBinds 14 tools. If LLM emits tool_calls -> route to act."),
        (ACCENT2, "act",       "NO LLM",     "Executes tool calls. Appends action dicts to pending_actions[].\nLoops back to reason for multi-step reasoning."),
        (ACCENT3, "respond",   "NO LLM",     "Extracts dialogue text from last AIMessage. Passes pending_actions through."),
        (ACCENT4, "reflect",   "NO LLM",     "Heuristic keyword analysis. Updates mood, relationship_score,\nand personality_notes. Zero cost."),
        (ACCENT5, "summarize", "CONDITIONAL","LLM call only every 3rd turn after 10 exchanges. Compresses memory\nto 2-3 sentences. The only 2nd LLM call in the pipeline."),
    ]

    x = 15
    for color, name, cost, desc in descs:
        bw = 53
        pdf.set_fill_color(*BG_DARK)
        pdf.rect(x, 108, bw, 50, "F")
        pdf.set_fill_color(*color)
        pdf.rect(x, 108, bw, 3, "F")
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_xy(x + 2, 113)
        pdf.cell(bw - 4, 5, name)
        pdf.set_text_color(*MID_GREY)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_xy(x + 2, 119)
        pdf.cell(bw - 4, 4, cost)
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_xy(x + 2, 124)
        pdf.multi_cell(bw - 4, 4, desc)
        x += bw + 4


def slide_live_trace(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT5, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("Live Demo Trace - Ignathar the Dragon", 10, ACCENT5)

    pdf.set_text_color(*ACCENT2)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_xy(20, 26)
    pdf.cell(W - 40, 6, 'Player types:  "I challenge you, wyrm!"')

    pdf.divider(36)

    # Trace steps
    steps = [
        (ACCENT, "1  reason", [
            'System prompt includes: "On EVERY combat, MUST call deal_damage (20-50 fire)',
            '  AND spawn_effect(fire). Below 250 HP: deal 40-50 instead."',
            "LLM sees: Ignathar HP = 180  ->  below 250 threshold  ->  enrage mode",
            "->  AIMessage with tool_calls: [deal_damage(45, fire), spawn_effect(fire), change_weather(storm)]",
        ]),
        (ACCENT2, "2  act", [
            "deal_damage  -> pending_actions += {kind:damage, amount:45, type:fire}",
            "             -> world_state[player][hp] = 100 - 45 = 55",
            "spawn_effect -> pending_actions += {kind:spawn_effect, effectType:fire}",
            "change_weather -> pending_actions += {kind:change_weather, weather:storm}",
        ]),
        (ACCENT, "3  reason (round 2)", [
            "LLM sees ToolMessages confirming all 3 tools succeeded",
            '->  AIMessage (no tool_calls): "THOU DAREST CHALLENGE ME?! FEEL THE FURY..."',
        ]),
        (ACCENT3, "4  respond", [
            'response_text = "THOU DAREST CHALLENGE ME?! FEEL THE FURY OF A THOUSAND EMBERS!"',
        ]),
        (ACCENT4, "5  reflect", [
            'tokens {challenge, wyrm} -> hostile_count=1 -> mood stays "angry"',
            "relationship delta: damage(-5) + hostile word(-2) = -7",
            "relationship_score = -12  ->  tier: DISTRUSTFUL",
        ]),
    ]

    y = 40
    for color, title, lines in steps:
        pdf.set_fill_color(*color)
        pdf.rect(15, y, 3, len(lines) * 5 + 6, "F")
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_xy(20, y + 1)
        pdf.cell(60, 5, title)
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Courier", "", 7)
        for i, line in enumerate(lines):
            pdf.set_xy(20, y + 6 + i * 5)
            pdf.cell(W - 35, 5, line)
        y += len(lines) * 5 + 10

    # Client effects box
    pdf.set_fill_color(*BG_DARK)
    pdf.rect(15, y, W - 30, 22, "F")
    pdf.set_fill_color(*ACCENT3)
    pdf.rect(15, y, W - 30, 3, "F")
    pdf.set_text_color(*ACCENT3)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_xy(18, y + 5)
    pdf.cell(40, 5, "Client effects")
    pdf.set_text_color(*LIGHT_GREY)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_xy(18, y + 11)
    pdf.cell(W - 36, 5, "ReactionSystem dispatches:  45 fire damage (red flash) + fire particle burst + fog/storm scene update")


def slide_tools(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT3, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("Tool System - LLM Calls Typed Functions", 10, ACCENT3)

    pdf.set_text_color(*LIGHT_GREY)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(20, 26)
    pdf.multi_cell(W - 40, 5,
        "Each NPC's tools are closures over that NPC's pending_actions list and world snapshot. "
        "The LLM never touches game state directly - it calls a typed function that does it.")

    # Tool table
    categories = [
        ("Combat",      ACCENT5, ["deal_damage", "defend", "flee", "heal_target"]),
        ("Dialogue",    ACCENT4, ["emote", "give_quest", "complete_quest"]),
        ("Trade",       ACCENT2, ["offer_item", "take_item"]),
        ("Environment", ACCENT,  ["change_weather", "spawn_effect", "move_npc"]),
        ("World Query", ACCENT3, ["get_nearby_entities", "check_player_state"]),
        ("Quest",       YELLOW,  ["start_quest", "advance_objective", "check_player_quests"]),
    ]

    x = 18
    y = 44
    col_w = 44
    for cat, color, tools in categories:
        pdf.set_fill_color(*BG_DARK)
        pdf.rect(x, y, col_w, 50, "F")
        pdf.set_fill_color(*color)
        pdf.rect(x, y, col_w, 8, "F")
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_xy(x, y + 1)
        pdf.cell(col_w, 6, cat, align="C")
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Courier", "", 7)
        for i, t in enumerate(tools):
            pdf.set_xy(x + 3, y + 10 + i * 7)
            pdf.cell(col_w - 6, 6, t)
        x += col_w + 4

    pdf.divider(103)

    # Closure pattern code
    pdf.set_text_color(*ACCENT)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(20, 106)
    pdf.cell(W - 40, 5, "The Closure Pattern")

    code = """def get_all_tools(pending_actions: list, world_snapshot: dict) -> list[BaseTool]:
    @tool
    def deal_damage(target: str, amount: int, damage_type: str) -> str:
        \"\"\"Deal damage to a target.\"\"\"
        pending_actions.append({"kind": "damage", "params": {...}})
        world_snapshot["player"]["hp"] -= amount          # immediate snapshot update
        return f"Dealt {amount} {damage_type} damage to {target}"

    return [deal_damage, heal_target, emote, offer_item, ...]  # 14 tools total"""
    pdf.code_box(code, x=20, y=112, w=W - 40, size=7)

    pdf.set_text_color(*LIGHT_GREY)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_xy(20, pdf.get_y() + 2)
    pdf.multi_cell(W - 40, 4,
        "Query tools (get_nearby_entities, check_player_state) return strings into LLM context but "
        "append nothing to pending_actions - zero side effects. pending_actions is applied to "
        "authoritative WorldState only AFTER the entire graph finishes.")


def slide_memory(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT4, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("Memory & Relationship System", 10, ACCENT4)

    # Left: how memory works
    col_w = 120
    pdf.set_text_color(*ACCENT4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(20, 26)
    pdf.cell(col_w, 6, "How NPCs Remember You")

    pdf.set_y(34)
    pdf.bullet("thread_id = \"{npc_id}_{player_id}\"", x=22, size=9)
    pdf.bullet("Two players -> same NPC -> independent memories", x=22, size=9)
    pdf.bullet("MemorySaver checkpoints after every invocation", x=22, size=9)
    pdf.bullet("Persistent fields survive indefinitely across sessions", x=22, size=9)

    # Persistent fields box
    fields = [
        ("conversation_summary", "str", "Rolling 2-3 sentence LLM summary of past conversations"),
        ("mood",                 "str", "neutral / happy / angry / sad / fearful"),
        ("relationship_score",   "int", "-100 (enemy)  to  +100 (trusted ally)"),
        ("personality_notes",    "str", "NPC observations about this player - max 300 chars"),
    ]
    y = 72
    pdf.set_fill_color(*BG_DARK)
    pdf.rect(18, y, col_w + 8, len(fields) * 10 + 10, "F")
    pdf.set_text_color(*ACCENT4)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_xy(22, y + 3)
    pdf.cell(col_w, 5, "Persistent fields in NPCAgentState")
    for i, (field, typ, desc) in enumerate(fields):
        fy = y + 12 + i * 10
        pdf.set_text_color(*ACCENT3)
        pdf.set_font("Courier", "B", 8)
        pdf.set_xy(22, fy)
        pdf.cell(55, 5, field)
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_xy(80, fy)
        pdf.cell(col_w - 60, 5, desc)

    # Right: relationship tiers
    rx = 155
    pdf.set_text_color(*ACCENT4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(rx, 26)
    pdf.cell(W - rx - 15, 6, "Relationship Tiers")

    tiers = [
        ("<= -50", "ENEMY",        "Hostile, refuses interaction", ACCENT5),
        ("-50->-10", "DISTRUSTFUL","Wary, curt replies",           ACCENT2),
        ("-10->+10", "STRANGER",   "Polite, reserved",             MID_GREY),
        ("+10->+50", "FRIEND",     "Warm, helpful",                ACCENT3),
        ("> +50",   "TRUSTED ALLY","Shares secrets, rare quests", YELLOW),
    ]
    y = 34
    for score, tier, behavior, color in tiers:
        bw = W - rx - 18
        pdf.set_fill_color(*BG_DARK)
        pdf.rect(rx, y, bw, 13, "F")
        pdf.set_fill_color(*color)
        pdf.rect(rx, y, 3, 13, "F")
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_xy(rx + 6, y + 2)
        pdf.cell(20, 4, score)
        pdf.cell(35, 4, tier)
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 7)
        pdf.cell(60, 4, behavior)
        y += 15

    pdf.divider(120)

    # reflect node detail
    pdf.set_text_color(*ACCENT4)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_xy(20, 123)
    pdf.cell(W - 40, 5, "reflect node - zero-cost heuristic (no LLM call)")

    code = """# keyword sets drive mood + relationship delta
hostile_tokens = {"attack", "kill", "challenge", "fight", "die", "curse", ...}
friendly_tokens = {"help", "please", "thank", "friend", "praise", ...}

delta = 0
if any(t in text for t in hostile_tokens):   delta -= 2
if any(t in text for t in friendly_tokens):  delta += 3
if "damage" action in pending_actions:       delta -= 5
if "give_item" action in pending_actions:    delta += 5
relationship_score = clamp(relationship_score + delta, -100, 100)"""
    pdf.code_box(code, x=20, y=130, w=W - 40, size=7)


def slide_cost(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT3, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("Cost Efficiency", 10, ACCENT3)

    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_xy(20, 26)
    pdf.cell(W - 40, 8, "Cheaper than it looks  -  by design")

    # Cost boxes
    items = [
        ("1 LLM call\nper turn", "The reason node is the only mandatory call.\nEvery other node is free.", ACCENT),
        ("Conditional\nsummarize", "Only fires at human_count >= 10\nAND every 3rd turn after that.", ACCENT4),
        ("Heuristic\nreflect", "Mood + relationship update via\nkeyword token sets. Zero tokens.", ACCENT3),
        ("RAG lore\nkeyword", "Top-3 keyword-matched lore snippets.\nNo embedding model needed.", ACCENT2),
        ("Context\nbounded", "Reason node keeps only a small recent\nwindow + compact summary.", ACCENT),
    ]

    x = 18
    y = 42
    for label, desc, color in items:
        bw = 50
        pdf.set_fill_color(*BG_DARK)
        pdf.rect(x, y, bw, 42, "F")
        pdf.set_fill_color(*color)
        pdf.rect(x, y, bw, 3, "F")
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "B", 10)
        pdf.set_xy(x + 2, y + 6)
        for line in label.split("\n"):
            pdf.set_x(x + 2)
            pdf.cell(bw - 4, 5, line)
            pdf.ln(5)
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(x + 2, y + 20)
        pdf.multi_cell(bw - 4, 4, desc)
        x += bw + 6

    pdf.divider(95)

    pdf.set_text_color(*ACCENT3)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(20, 98)
    pdf.cell(W - 40, 6, "Typical token budget per player interaction")

    # Token budget table
    rows = [
        ("System prompt (personality + world ctx)", "~400-600 tokens", ACCENT),
        ("Conversation window (last 6-8 turns)",    "~300-500 tokens", ACCENT),
        ("RAG lore injection (top-3 snippets)",     "~100-200 tokens", ACCENT2),
        ("Tool schemas (14 tools)",                 "~800-1000 tokens",ACCENT4),
        ("Total input estimate",                    "~1600-2300 tokens",ACCENT3),
        ("Output (dialogue + tool_calls)",          "~100-300 tokens", ACCENT3),
    ]
    y = 106
    for label, val, color in rows:
        pdf.set_fill_color(*BG_DARK)
        pdf.rect(20, y, 160, 7, "F")
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(23, y + 1)
        pdf.cell(120, 5, label)
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_xy(145, y + 1)
        pdf.cell(35, 5, val)
        y += 8

    pdf.set_text_color(*MID_GREY)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_xy(20, y + 2)
    pdf.multi_cell(W - 40, 4,
        "Summarize node compresses after every 3rd turn post-10 exchanges, keeping the "
        "conversation_summary <= 500 chars. This keeps per-turn cost essentially flat over "
        "arbitrarily long player relationships.")


def slide_npcs(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT2, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("The NPCs - Same Graph, Different Personalities", 10, ACCENT2)

    pdf.set_text_color(*LIGHT_GREY)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_xy(20, 26)
    pdf.multi_cell(W - 40, 5,
        "Every NPC shares the SAME LangGraph topology. Differentiation comes entirely from the "
        "system_prompt in the reason node. Three layers stack inside every prompt:")

    pdf.set_y(44)
    pdf.bullet("Personality / voice  (who am I, how do I speak?)", x=22, size=9)
    pdf.bullet("_TOOL_RULES_PREAMBLE  (shared: MUST use tools, never text alone)", x=22, size=9)
    pdf.bullet("NPC-specific tool rules  (Ignathar: deal 40-50 fire when enraged; Aurelia: offer_item on greeting)", x=22, size=9)

    pdf.divider(70)

    # NPC roster
    npcs = [
        ("Ignathar",      "Hostile Boss",      "HP 500", "dragon_01",     ACCENT5),
        ("Aurelia",       "Merchant",          "HP 100", "merchant_01",   ACCENT2),
        ("Nireg Jenkins", "Oracle / God",      "HP 5000","nireg_jenkins",  ACCENT4),
        ("Captain Rolan", "City Guard",        "HP 180", "guard_malaka_01",ACCENT),
        ("Sister Constanza","Healer",          "HP 120", "healer_malaka_01",ACCENT3),
        ("Paco el Churrero","Street Merchant", "HP 100", "churrero_01",   YELLOW),
        ("Sylvara",       "Wraith Monster",    "HP 70",  "wraith_01",     MID_GREY),
        ("Tutorial-Man",  "Guide NPC",         "HP 1000","tutorial_01",   ACCENT),
    ]

    x = 18
    y = 74
    col_w = 65
    for i, (name, archetype, hp, npc_id, color) in enumerate(npcs):
        if i == 4:
            x = 18
            y = 118
        pdf.set_fill_color(*BG_DARK)
        pdf.rect(x, y, col_w, 35, "F")
        pdf.set_fill_color(*color)
        pdf.rect(x, y, col_w, 3, "F")
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_xy(x + 2, y + 5)
        pdf.cell(col_w - 4, 5, name)
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(x + 2, y + 11)
        pdf.cell(col_w - 4, 4, archetype)
        pdf.set_text_color(*MID_GREY)
        pdf.set_font("Helvetica", "", 7)
        pdf.set_xy(x + 2, y + 16)
        pdf.cell(col_w - 4, 4, hp + "  -  " + npc_id)
        x += col_w + 5


def slide_design_patterns(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg()
    pdf.accent_bar(ACCENT, y=0, h=5)
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.section_header("Agentic Design Patterns", 10, ACCENT)

    patterns = [
        (ACCENT,  "One agent per entity",
         "Each NPC = independent StateGraph + MemorySaver. No shared graph state leaks "
         "between NPCs. Scales horizontally. Bounded by a global semaphore for LLM concurrency."),
        (ACCENT2, "Closure-scoped tool state",
         "Tools close over their NPC's pending_actions list at startup. The LLM sees clean "
         "function signatures. Side effects are invisible to the LLM - it only reads return strings."),
        (ACCENT3, "Deferred side effects",
         "pending_actions is applied to authoritative WorldState ONLY after the full graph "
         "finishes. This ensures consistent server state even when act -> reason loops multiple times."),
        (ACCENT4, "Layered memory without a database",
         "MemorySaver = in-process checkpointing. conversation_summary keeps context bounded. "
         "reflect runs heuristics so mood/relationship update every turn at zero LLM cost."),
        (ACCENT5, "Prompt-as-config for behaviour",
         "NPC tool rules live in the system prompt, not in graph structure. Adding a new "
         "behaviour pattern = edit one string. No code changes, no graph rewiring needed."),
        (YELLOW,  "Hybrid retrieval (keyword RAG)",
         "LoreRetriever uses keyword matching (no embedding model). Fast, deterministic, cheap. "
         "Good enough for lore injection; upgrading to dense retrieval is a drop-in swap."),
    ]

    y = 28
    for color, title, desc in patterns:
        pdf.set_fill_color(*BG_DARK)
        pdf.rect(15, y, W - 30, 20, "F")
        pdf.set_fill_color(*color)
        pdf.rect(15, y, 3, 20, "F")
        pdf.set_text_color(*color)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_xy(22, y + 3)
        pdf.cell(70, 5, title)
        pdf.set_text_color(*LIGHT_GREY)
        pdf.set_font("Helvetica", "", 8)
        pdf.set_xy(22, y + 9)
        pdf.multi_cell(W - 40, 4, desc)
        y += 23


def slide_takeaways(pdf: Deck, n, total):
    pdf.add_page()
    pdf.slide_bg(gradient=False)
    pdf.set_fill_color(*BG_DARK)
    pdf.rect(0, 0, W, H * 0.45, "F")
    pdf.set_fill_color(*ACCENT)
    pdf.rect(0, H * 0.45, W, 3, "F")
    pdf.footer_brand()
    pdf.page_number(n, total)

    pdf.set_text_color(*WHITE)
    pdf.set_font("Helvetica", "B", 30)
    pdf.set_xy(0, 14)
    pdf.cell(W, 0, "Key Takeaways", align="C")

    pdf.set_text_color(*LIGHT_GREY)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_xy(0, 32)
    pdf.cell(W, 0, "What this project shows about building with LLMs", align="C")

    takeaways = [
        (ACCENT,  "Text IS the interface.  No buttons needed when the LLM is the game engine."),
        (ACCENT3, "One graph per agent, not one graph for all.  Isolation > complexity."),
        (ACCENT2, "Tool calls = structured side effects.  LLM decides what, code decides how."),
        (ACCENT4, "Memory without a database.  In-process MemorySaver + heuristic reflect node."),
        (ACCENT5, "Cost is predictable.  1 LLM call per turn + conditional summarize every ~3rd."),
        (YELLOW,  "Behaviour via prompt, not code.  NPC tool rules live in the system prompt."),
    ]

    y = H * 0.52
    for color, text in takeaways:
        pdf.set_fill_color(*color)
        pdf.rect(20, y, 3, 9, "F")
        pdf.set_text_color(*WHITE)
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_xy(26, y + 1)
        pdf.cell(W - 46, 7, text)
        y += 13

    # Bottom CTA
    pdf.set_text_color(*ACCENT)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_xy(0, H - 16)
    pdf.cell(W, 0, "github.com/Zaexv/world-of-prompcraft", align="C")
    pdf.set_text_color(*MID_GREY)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_xy(0, H - 10)
    pdf.cell(W, 0, "Stack: LangGraph  -  FastAPI  -  Three.js  -  TypeScript  -  Python  |  LLMDays Hamburg 2025", align="C")


# --- Main ---------------------------------------------------------------------

TOTAL_SLIDES = 9

def main():
    pdf = Deck(orientation="L", unit="mm", format=(H, W))
    pdf.set_auto_page_break(False)

    slide_title(pdf)
    slide_concept(pdf, 2, TOTAL_SLIDES)
    slide_architecture(pdf, 3, TOTAL_SLIDES)
    slide_langgraph_pipeline(pdf, 4, TOTAL_SLIDES)
    slide_live_trace(pdf, 5, TOTAL_SLIDES)
    slide_tools(pdf, 6, TOTAL_SLIDES)
    slide_memory(pdf, 7, TOTAL_SLIDES)
    slide_cost(pdf, 8, TOTAL_SLIDES)
    slide_npcs(pdf, 9, TOTAL_SLIDES)
    slide_design_patterns(pdf, 10, TOTAL_SLIDES)
    slide_takeaways(pdf, 11, TOTAL_SLIDES)

    out = os.path.join(os.path.dirname(__file__), "world_of_promptcraft_llmdays.pdf")
    pdf.output(out)
    print(f"PDF written to: {out}")


if __name__ == "__main__":
    main()
