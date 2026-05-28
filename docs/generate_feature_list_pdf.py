"""Generate World of Promptcraft Feature List PDF."""
import os
from fpdf import FPDF
from fpdf.enums import XPos, YPos

# ── Palette ──────────────────────────────────────────────────────────────────
DARK_BG   = (18, 18, 30)
CARD_BG   = (30, 30, 50)
ACCENT    = (120, 80, 220)
GOLD      = (212, 175, 55)
GREEN     = (70, 190, 110)
ORANGE    = (230, 140, 50)
RED       = (210, 65, 65)
WHITE     = (235, 235, 255)
GRAY      = (150, 150, 180)
LIGHT_GRAY = (195, 195, 220)

FONT_REG  = "/Library/Fonts/Poppins-Regular.ttf"
FONT_BOLD = "/Library/Fonts/Poppins-Bold.ttf"
FONT_MED  = "/Library/Fonts/Poppins-Medium.ttf"
FONT_SEMI = "/Library/Fonts/Poppins-SemiBold.ttf"

SECTIONS = [
    {
        "title": "Core Online / Multiplayer",
        "items": [
            ("M-1", "Servidor WebSocket en tiempo real (FastAPI)", "done"),
            ("M-2", "Ver otros jugadores moviéndose en el mundo", "done"),
            ("M-3", "Chat global / por zona", "done"),
            ("M-4", "Estado del mundo sincronizado (server-authoritative)", "done"),
            ("M-5", "Login + sesión persistente (nombre, raza, estado)", "partial"),
            ("M-6", "Persistencia en base de datos (jugador, inventario, quests, reputación)", "missing"),
            ("M-7", "Grupos / party online", "missing"),
            ("M-8", "PvP entre jugadores", "missing"),
            ("M-9", "Mercado / auction house entre jugadores", "missing"),
        ],
    },
    {
        "title": "Personaje & Razas",
        "items": [
            ("C-1", "Creación de personaje (raza, skin, nombre)", "done"),
            ("C-2", "4 razas: Humano, Elfo, Orco, Muerto Viviente", "done"),
            ("C-3", "Stats distintos por raza (HP, mana, velocidad)", "missing"),
            ("C-4", "Rasgos / pasivas raciales", "missing"),
            ("C-5", "Sistema de niveles (XP, level up)", "missing"),
            ("C-6", "Stats de personaje (fuerza, agilidad, inteligencia...)", "missing"),
            ("C-7", "1-2 habilidades activas por personaje", "missing"),
            ("C-8", "Hotbar de habilidades (UI + cooldowns)", "missing"),
            ("C-9", "Progresión de habilidades", "missing"),
        ],
    },
    {
        "title": "Combate",
        "items": [
            ("B-1", "Sistema de combate básico (deal_damage, heal)", "done"),
            ("B-2", "Tipos de daño (físico, fuego, hielo, rayo, sagrado, oscuro)", "done"),
            ("B-3", "Combat HUD (HP, mana, barra de enemigo)", "done"),
            ("B-4", "Lanzar habilidad activa desde hotbar", "missing"),
            ("B-5", "Efectos visuales de habilidades (partículas, animaciones)", "partial"),
            ("B-6", "Muerte y respawn del jugador", "missing"),
            ("B-7", "Drop de loot al matar enemigos", "missing"),
            ("B-8", "Enemigos con IA (agro, patrulla, huida)", "partial"),
        ],
    },
    {
        "title": "Items & Inventario",
        "items": [
            ("I-1", "Inventario visual (grid 20 slots)", "done"),
            ("I-2", "Sistema de equipamiento (arma, escudo, amuleto)", "done"),
            ("I-3", "Definiciones estructuradas de items (rareza, stats, tipo)", "missing"),
            ("I-4", "Consumibles con efectos (poción de vida = +50 HP)", "missing"),
            ("I-5", "Items en el suelo (drop, pickup por proximidad)", "missing"),
            ("I-6", "Bonus de stats al equipar un item", "missing"),
            ("I-7", "Items únicos / legendarios", "missing"),
            ("I-8", "Items generados por prompt", "missing"),
        ],
    },
    {
        "title": "Compraventa",
        "items": [
            ("T-1", "Herramientas servidor: offer_item / take_item", "done"),
            ("T-2", "Sistema de moneda (oro)", "missing"),
            ("T-3", "UI de tienda / mercader", "missing"),
            ("T-4", "Precios dinámicos por item", "missing"),
            ("T-5", "NPC mercader configurado en el mundo", "missing"),
            ("T-6", "Sincronización de compras entre jugadores (online)", "missing"),
        ],
    },
    {
        "title": "Reputación",
        "items": [
            ("R-1", "Campo relationship_score por NPC (client + server)", "done"),
            ("R-2", "Visualización en nameplate del NPC", "done"),
            ("R-3", "Lógica servidor que modifica reputación por acciones", "missing"),
            ("R-4", "Umbrales de comportamiento (hostil / neutral / amigable)", "missing"),
            ("R-5", "Contenido bloqueado por reputación (tiendas, quests)", "missing"),
            ("R-6", "Reputación persistente entre sesiones", "missing"),
            ("R-7", "Reputación por facción (no solo NPC individual)", "missing"),
        ],
    },
    {
        "title": "Misiones (Quests)",
        "items": [
            ("Q-1", "UI: QuestLog + QuestTracker", "done"),
            ("Q-2", "Estado de quests en cliente y servidor", "done"),
            ("Q-3", "3 misiones hard-coded existentes", "done"),
            ("Q-4", "Sistema de recompensas al completar", "missing"),
            ("Q-5", "Misión de German (NPC dedicado)", "missing"),
            ("Q-6", "Quests reactivas a acciones de otros jugadores (online)", "missing"),
            ("Q-7", "Diálogo de quest ramificado (aceptar / rechazar / negociar)", "missing"),
            ("Q-8", "Quests generadas dinámicamente por LLM", "missing"),
        ],
    },
    {
        "title": "Mazmorras",
        "items": [
            ("D-1", "Sistema de mazmorra (entrar / salir, salas, cofres)", "done"),
            ("D-2", "2 mazmorras: Ember Depths, Crystal Caverns", "done"),
            ("D-3", "Spawn de enemigos dentro de mazmorras", "done"),
            ("D-4", "Jefe final (boss) con mecánica propia", "missing"),
            ("D-5", "Dificultad escalada por número de jugadores (online)", "missing"),
            ("D-6", "Mazmorra instanciada por grupo (cada party tiene la suya)", "missing"),
            ("D-7", "Progresión de salas (puertas al limpiar sala)", "missing"),
            ("D-8", "Loot de cofres sincronizado (sin duplicados entre jugadores)", "missing"),
        ],
    },
    {
        "title": "Mundo & Prompting",
        "items": [
            ("W-1", "Terreno procedural por chunks (64x64)", "done"),
            ("W-2", "Ciudad Malaka con arquitectura mediterránea", "done"),
            ("W-3", "Herramienta servidor spawn_structure (14 tipos)", "done"),
            ("W-4", "Pipeline: jugador escribe prompt -> objeto aparece", "missing"),
            ("W-5", "Objetos persistidos en base de datos", "missing"),
            ("W-6", "Objetos colocados por un jugador visibles para todos", "missing"),
            ("W-7", "Límite de objetos por jugador / moderación", "missing"),
        ],
    },
    {
        "title": "Historia & Lore",
        "items": [
            ("L-1", "Base de conocimiento RAG (50+ entradas)", "done"),
            ("L-2", "NPCs recuperan lore antes de razonar", "done"),
            ("L-3", "Personalidades de NPCs (10+ arquetipos)", "done"),
            ("L-4", "Progresión narrativa (hitos de historia desbloqueables)", "missing"),
            ("L-5", "UI visor de lore / diario del aventurero", "missing"),
            ("L-6", "Eventos de historia disparados por acciones de jugadores", "missing"),
            ("L-7", "Historia principal con acto 1 -> 2 -> 3", "missing"),
        ],
    },
    {
        "title": "Visual & UX",
        "items": [
            ("V-1", "Texturas procedurales de caminos", "done"),
            ("V-2", "Agua, skybox, iluminación dinámica", "done"),
            ("V-3", "Animaciones de jugador (respiración, inclinación, banking)", "done"),
            ("V-4", "Efectos de partículas por combate / habilidad", "partial"),
            ("V-5", "Minimapa", "done"),
            ("V-6", "Post-processing (bloom, AO, niebla)", "partial"),
            ("V-7", "Pantalla de carga entre zonas", "missing"),
        ],
    },
]

CRITICAL_GAPS = [
    ("BLOQUEANTE", RED, [
        "M-6  Persistencia real en BD (todo se pierde al reiniciar)",
        "I-3  Definiciones de items estructuradas",
        "C-3  Stats por raza",
        "T-2  Sistema de moneda (oro)",
    ]),
    ("CORE GAMEPLAY", ORANGE, [
        "C-7 / C-8  Habilidades + hotbar",
        "R-3 / R-4  Reputación con lógica real",
        "Q-4 / Q-5  Recompensas + misión de German",
        "D-4        Boss de mazmorra",
        "W-4        Pipeline prompt -> objeto",
    ]),
    ("ONLINE ESPECIFICO", GOLD, [
        "M-5  Auth real",
        "D-5 / D-6  Instancias de mazmorra por grupo",
        "W-5 / W-6  Objetos persistidos y sincronizados",
        "Q-6  Quests reactivas al mundo compartido",
    ]),
]

STATUS_META = {
    "done":    ("COMPLETO",  GREEN),
    "partial": ("PARCIAL",   ORANGE),
    "missing": ("FALTA",     RED),
}

SECTION_ICONS = {
    "Core Online / Multiplayer": "M",
    "Personaje & Razas":         "C",
    "Combate":                   "B",
    "Items & Inventario":        "I",
    "Compraventa":               "T",
    "Reputación":                "R",
    "Misiones (Quests)":         "Q",
    "Mazmorras":                 "D",
    "Mundo & Prompting":         "W",
    "Historia & Lore":           "L",
    "Visual & UX":               "V",
}


class PDF(FPDF):
    def header(self):
        pass

    def footer(self):
        self.set_y(-12)
        # Fallback to Helvetica if Poppins not loaded yet or fails
        try:
            self.set_font("Poppins", "", 7)
        except:
            self.set_font("Helvetica", "", 7)
        self.set_text_color(*GRAY)
        self.cell(0, 8, f"World of Promptcraft  —  Feature List  |  Pág. {self.page_no()}", align="C")


def fr(pdf: FPDF, x: float, y: float, w: float, h: float, color: tuple) -> None:
    """Draw filled rectangle."""
    pdf.set_fill_color(*color)
    pdf.rect(x, y, w, h, style="F")


def build_pdf(output_path: str) -> None:
    pdf = PDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    
    # Load fonts with fallback check
    fonts_loaded = True
    for name, style, path in [
        ("Poppins", "", FONT_REG),
        ("Poppins", "B", FONT_BOLD),
        ("PoppinsMed", "", FONT_MED),
        ("PoppinsSemi", "", FONT_SEMI),
    ]:
        if os.path.exists(path):
            pdf.add_font(name, style=style, fname=path)
        else:
            print(f"Warning: Font not found at {path}. Using default fonts.")
            fonts_loaded = False

    def set_safe_font(family, style, size):
        if fonts_loaded:
            pdf.set_font(family, style, size)
        else:
            # Map Poppins to Helvetica
            f = "Helvetica"
            s = style
            pdf.set_font(f, s, size)

    # ── Cover ─────────────────────────────────────────────────────────────────
    pdf.add_page()
    fr(pdf, 0, 0, 210, 297, DARK_BG)
    fr(pdf, 0, 0, 210, 6, ACCENT)

    # Decorative side strip
    fr(pdf, 0, 0, 4, 297, ACCENT)

    # Title
    pdf.set_xy(14, 70)
    set_safe_font("Poppins", "B", 34)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 14, "World of Promptcraft", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_xy(14, pdf.get_y() + 2)
    set_safe_font("PoppinsSemi" if fonts_loaded else "Poppins", "", 15)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 8, "Feature List — v1.0", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_xy(14, pdf.get_y() + 4)
    set_safe_font("Poppins", "", 10)
    pdf.set_text_color(*GRAY)
    pdf.cell(0, 6, "3D Multiplayer RPG  |  Three.js + LangGraph + FastAPI", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    # Divider line
    pdf.ln(6)
    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.4)
    pdf.line(14, pdf.get_y(), 130, pdf.get_y())

    # Stats cards
    total   = sum(len(s["items"]) for s in SECTIONS)
    done    = sum(1 for s in SECTIONS for _, _, st in s["items"] if st == "done")
    partial = sum(1 for s in SECTIONS for _, _, st in s["items"] if st == "partial")
    missing = total - done - partial

    stats = [("TOTAL", str(total), WHITE), ("COMPLETO", str(done), GREEN),
             ("PARCIAL", str(partial), ORANGE), ("POR HACER", str(missing), RED)]

    card_w = 42
    sx = 14
    card_y = pdf.get_y() + 10
    for label, val, color in stats:
        fr(pdf, sx, card_y, card_w - 3, 24, CARD_BG)
        fr(pdf, sx, card_y, 3, 24, color)
        pdf.set_xy(sx + 6, card_y + 3)
        set_safe_font("Poppins", "B", 18)
        pdf.set_text_color(*color)
        pdf.cell(card_w - 9, 9, val)
        pdf.set_xy(sx + 6, card_y + 14)
        set_safe_font("Poppins", "", 6)
        pdf.set_text_color(*GRAY)
        pdf.cell(card_w - 9, 5, label)
        sx += card_w

    # Progress bar
    bar_y = card_y + 34
    bar_x, bar_w, bar_h = 14, 182, 10
    fr(pdf, bar_x, bar_y, bar_w, bar_h, CARD_BG)
    done_w    = int(bar_w * done / total)
    partial_w = int(bar_w * partial / total)
    fr(pdf, bar_x, bar_y, done_w, bar_h, GREEN)
    fr(pdf, bar_x + done_w, bar_y, partial_w, bar_h, ORANGE)
    pct = round((done + partial * 0.5) / total * 100)
    pdf.set_xy(bar_x, bar_y + 1)
    set_safe_font("Poppins", "B", 7)
    pdf.set_text_color(*DARK_BG)
    pdf.cell(done_w, 8, f" {pct}%")

    pdf.set_xy(bar_x, bar_y + bar_h + 3)
    set_safe_font("Poppins", "", 7)
    pdf.set_text_color(*GRAY)
    pdf.cell(0, 5, f"{done} completadas   {partial} parciales   {missing} por hacer   {total} total")

    # Legend
    legend_y = bar_y + bar_h + 16
    lx = 14
    for lbl, color in [("COMPLETO", GREEN), ("PARCIAL", ORANGE), ("POR HACER", RED)]:
        fr(pdf, lx, legend_y, 10, 5, color)
        pdf.set_xy(lx + 12, legend_y - 0.5)
        set_safe_font("Poppins", "", 7)
        pdf.set_text_color(*LIGHT_GRAY)
        pdf.cell(30, 5, lbl)
        lx += 52

    # Section index
    idx_y = legend_y + 18
    pdf.set_xy(14, idx_y)
    set_safe_font("Poppins", "B", 9)
    pdf.set_text_color(*ACCENT)
    pdf.cell(0, 6, "CONTENIDO", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)

    cols, col_w = 2, 88
    for i, section in enumerate(SECTIONS):
        col = i % cols
        ix = 14 + col * (col_w + 8)
        
        if col == 0:
            iy = pdf.get_y()
        else:
            iy = pdf.get_y() - 7
            
        pdf.set_xy(ix, iy)
        icon = SECTION_ICONS.get(section["title"], "?")
        fr(pdf, ix, iy, 6, 5, ACCENT)
        pdf.set_xy(ix + 0.5, iy + 0.2)
        set_safe_font("Poppins", "B", 5)
        pdf.set_text_color(*DARK_BG)
        pdf.cell(5, 4.5, icon, align="C")
        pdf.set_xy(ix + 8, iy + 0.2)
        set_safe_font("Poppins", "", 7)
        pdf.set_text_color(*LIGHT_GRAY)
        pdf.cell(col_w - 8, 5, section["title"])
        
        if col == 1 or i == len(SECTIONS) - 1:
            pdf.ln(7)

    fr(pdf, 0, 291, 210, 6, ACCENT)

    # ── Sections ──────────────────────────────────────────────────────────────
    for section in SECTIONS:
        pdf.add_page()
        fr(pdf, 0, 0, 210, 297, DARK_BG)
        fr(pdf, 0, 0, 4, 297, ACCENT)
        fr(pdf, 0, 0, 210, 6, ACCENT)

        # Header
        icon = SECTION_ICONS.get(section["title"], "?")
        fr(pdf, 14, 12, 10, 10, ACCENT)
        pdf.set_xy(14, 13)
        set_safe_font("Poppins", "B", 8)
        pdf.set_text_color(*DARK_BG)
        pdf.cell(10, 8, icon, align="C")

        pdf.set_xy(27, 13)
        set_safe_font("Poppins", "B", 14)
        pdf.set_text_color(*WHITE)
        pdf.cell(0, 10, section["title"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)

        # Section stats
        s_done    = sum(1 for _, _, st in section["items"] if st == "done")
        s_partial = sum(1 for _, _, st in section["items"] if st == "partial")
        s_miss    = len(section["items"]) - s_done - s_partial
        pdf.set_xy(27, pdf.get_y())
        set_safe_font("Poppins", "", 7)
        pdf.set_text_color(*GRAY)
        pdf.cell(0, 5, f"{s_done} completadas  |  {s_partial} parciales  |  {s_miss} por hacer")

        # Divider
        pdf.ln(3)
        pdf.set_draw_color(*ACCENT)
        pdf.set_line_width(0.3)
        pdf.line(14, pdf.get_y(), 196, pdf.get_y())
        pdf.ln(5)

        # Column headers
        set_safe_font("PoppinsSemi" if fonts_loaded else "Poppins", "", 6)
        pdf.set_text_color(*GRAY)
        pdf.set_xy(14, pdf.get_y())
        pdf.cell(14, 5, "ID")
        pdf.cell(148, 5, "DESCRIPCIÓN")
        pdf.cell(24, 5, "ESTADO", align="C")
        pdf.ln(6)

        for code, desc, status in section["items"]:
            row_y = pdf.get_y()
            row_h = 9

            label, color = STATUS_META[status]
            fr(pdf, 14, row_y, 182, row_h, CARD_BG)
            fr(pdf, 14, row_y, 3, row_h, color)

            # Code chip
            fr(pdf, 19, row_y + 1.5, 12, 6, ACCENT)
            pdf.set_xy(19, row_y + 2)
            set_safe_font("Poppins", "B", 6)
            pdf.set_text_color(*DARK_BG)
            pdf.cell(12, 5, code, align="C")

            # Description
            pdf.set_xy(34, row_y + 2)
            set_safe_font("Poppins", "", 7.5)
            pdf.set_text_color(*LIGHT_GRAY)
            pdf.cell(142, 5, desc)

            # Status badge
            bx = 176
            fr(pdf, bx, row_y + 1.5, 18, 6, color)
            pdf.set_xy(bx, row_y + 2)
            set_safe_font("Poppins", "B", 5.5)
            pdf.set_text_color(*DARK_BG)
            pdf.cell(18, 5, label, align="C")

            pdf.ln(row_h + 1)

        fr(pdf, 0, 291, 210, 6, ACCENT)

    # ── Critical Gaps page ────────────────────────────────────────────────────
    pdf.add_page()
    fr(pdf, 0, 0, 210, 297, DARK_BG)
    fr(pdf, 0, 0, 4, 297, ACCENT)
    fr(pdf, 0, 0, 210, 6, ACCENT)

    pdf.set_xy(14, 14)
    set_safe_font("Poppins", "B", 14)
    pdf.set_text_color(*WHITE)
    pdf.cell(0, 10, "Resumen de Brechas Críticas", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_draw_color(*ACCENT)
    pdf.set_line_width(0.3)
    pdf.line(14, pdf.get_y(), 196, pdf.get_y())
    pdf.ln(8)

    for title, color, items in CRITICAL_GAPS:
        block_y = pdf.get_y()
        fr(pdf, 14, block_y, 182, 11, color)
        pdf.set_xy(18, block_y + 2)
        set_safe_font("Poppins", "B", 9)
        pdf.set_text_color(*DARK_BG)
        pdf.cell(0, 7, title)
        pdf.ln(13)

        for item in items:
            row_y = pdf.get_y()
            fr(pdf, 14, row_y, 182, 9, CARD_BG)
            fr(pdf, 14, row_y, 3, 9, color)
            pdf.set_xy(20, row_y + 2)
            set_safe_font("Poppins", "", 8)
            pdf.set_text_color(*LIGHT_GRAY)
            pdf.cell(0, 5, item)
            pdf.ln(10)

        pdf.ln(5)

    fr(pdf, 0, 291, 210, 6, ACCENT)

    pdf.output(output_path)
    print(f"PDF generado: {output_path}")


if __name__ == "__main__":
    build_pdf("docs/feature_list.pdf")
