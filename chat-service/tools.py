"""
tools.py — AI tool intent detection and keyword routing.

Routes user messages to the appropriate AI tool:
  diagram  → Mermaid-based diagram generation
  image    → FLUX image generation
  sketch   → ControlNet sketch-to-image
  ocr      → Vision-based text extraction
  tts      → Text-to-speech synthesis
  draw     → Basic canvas_chain shapes (fallback)
  None     → Plain chat (no tool needed)
"""
from __future__ import annotations

from typing import Any


# ─── Keyword Maps ─────────────────────────────────────────────────────────────

_TOOL_KEYWORDS: dict[str, frozenset[str]] = {
    "diagram": frozenset({
        "flowchart", "diagram", "mindmap", "mind map", "sequence diagram",
        "class diagram", "er diagram", "gantt", "pie chart", "state diagram",
        "graph", "chart", "architecture", "uml", "schema",
        "system design", "microservice", "infrastructure", "deployment",
        "pipeline", "ci/cd", "database schema", "network topology",
        "data flow", "entity relationship", "workflow", "process flow",
        "hierarchy", "org chart", "sitemap", "user flow", "api flow",
        "decision tree", "tree structure",
    }),
    "image": frozenset({
        "generate image", "generate an image", "create image",
        "create an image", "generate picture", "create picture",
        "photo of", "picture of", "image of", "illustration of",
        "generate a photo", "make an image", "make a picture",
    }),
    "sketch": frozenset({
        "sketch to image", "convert sketch", "turn sketch",
        "make it realistic", "sketch to real", "transform sketch",
        "convert my drawing", "turn my drawing", "make my sketch",
    }),
    "ocr": frozenset({
        "read text", "extract text", "ocr", "what text",
        "recognize text", "what does it say", "read the text",
        "text recognition", "scan text", "what is written",
        "what's written",
    }),
    "tts": frozenset({
        "read aloud", "speak", "say this", "text to speech",
        "read this aloud", "tts", "pronounce", "voice",
        "say it out loud", "read out",
    }),
}

_DRAW_KEYWORDS: frozenset[str] = frozenset({
    "draw", "create", "add", "place", "make", "build", "put", "insert",
    "box", "circle", "rectangle", "arrow", "shape", "ellipse", "diamond",
    "layout", "wireframe", "design", "sticky", "note",
    "organize", "arrange", "connect", "link",
})

_DIAGRAM_STYLES: list[tuple[str, str]] = [
    ("class diagram", "class"),
    ("er diagram", "erDiagram"),
    ("entity relationship", "erDiagram"),
    ("sequence diagram", "sequence"),
    ("sequence", "sequence"),
    ("state diagram", "stateDiagram"),
    ("gantt", "gantt"),
    ("pie chart", "pie"),
    ("pie", "pie"),
    ("mindmap", "mindmap"),
    ("mind map", "mindmap"),
    ("flow chart", "flowchart"),
    ("flowchart", "flowchart"),
    ("architecture", "flowchart"),
    ("system design", "flowchart"),
    ("microservice", "flowchart"),
    ("infrastructure", "flowchart"),
    ("deployment", "flowchart"),
    ("pipeline", "flowchart"),
    ("ci/cd", "flowchart"),
    ("network", "flowchart"),
    ("data flow", "flowchart"),
    ("workflow", "flowchart"),
    ("process flow", "flowchart"),
    ("hierarchy", "flowchart"),
    ("decision tree", "flowchart"),
]


def detect_tool_intent(message: str) -> dict | None:
    """Detect which AI tool the user's message needs.

    Returns a dict with tool info, or None for plain chat.
    Priority: specific tools > basic drawing > None.

    Returns:
        {"tool": "diagram", "prompt": "...", "style": "flowchart"}
        {"tool": "image",   "prompt": "..."}
        {"tool": "sketch",  "prompt": "..."}
        {"tool": "ocr"}
        {"tool": "tts",     "text": "..."}
        {"tool": "draw"}    — fallback to canvas_chain
        None                — plain chat
    """
    msg_lower = message.lower()

    # Check specific tools first (highest priority)
    for tool_name, keywords in _TOOL_KEYWORDS.items():
        if any(kw in msg_lower for kw in keywords):
            result: dict[str, Any] = {"tool": tool_name, "prompt": message}

            # For diagrams, detect the style
            if tool_name == "diagram":
                style = "flowchart"
                for keyword, diagram_style in _DIAGRAM_STYLES:
                    if keyword in msg_lower:
                        style = diagram_style
                        break
                result["style"] = style

            return result

    # Fallback: basic shape drawing
    if any(kw in msg_lower for kw in _DRAW_KEYWORDS):
        return {"tool": "draw", "prompt": message}

    return None
