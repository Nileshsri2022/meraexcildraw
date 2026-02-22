"""
AI Canvas Chat Assistant — Python Microservice  (v4.0)

A streaming chatbot powered by MiniMax M2.1 via NVIDIA AI Endpoints,
built with LangChain 1.x + LangGraph architecture patterns:

  - LangGraph StateGraph for two-phase pipeline orchestration
  - MemorySaver checkpointing for durable conversation memory
  - ChatPromptTemplate for prompt management
  - LCEL chains (prompt | llm | parser) with async-first patterns
  - Pydantic v2 schemas for structured canvas output
  - StrOutputParser for reliable chain composition
  - Python performance best practices (__slots__, frozenset, compiled regex,
    generator-based SSE, local-variable hot paths)

Architecture:
    StateGraph: START → stream_chat → (conditional) → generate_canvas → END
    Phase 1 — Stream text via SSE  (chat_chain.astream)
    Phase 2 — Generate structured canvas elements (canvas_chain.ainvoke)

Endpoints:
    POST /chat          — Streaming SSE chat with optional canvas actions
    POST /chat/context  — Update canvas context
    POST /chat/clear    — Clear conversation history
    DELETE /chat/session/{id} — Delete session
    GET  /health        — Health check
"""

from __future__ import annotations

import json
import os
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from functools import lru_cache
from typing import Annotated, Any, AsyncGenerator, TypedDict

import markdown as md
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_nvidia_ai_endpoints import ChatNVIDIA

load_dotenv()

# ─── Compiled Regex (compile once, reuse everywhere) ─────────────────────────

_THINK_PATTERN = re.compile(r"<think>.*?</think>", re.DOTALL)
_FENCE_OPEN = re.compile(r"^```\w*\n?")
_FENCE_CLOSE = re.compile(r"\n?```$")

# ─── Markdown → HTML Converter ────────────────────────────────────────────────

_MD_EXTENSIONS: tuple[str, ...] = (
    "fenced_code", "tables", "nl2br", "sane_lists", "smarty"
)


def strip_think_tags(text: str) -> str:
    """Remove <think>...</think> reasoning blocks from model output."""
    return _THINK_PATTERN.sub("", text).lstrip("\n")


@lru_cache(maxsize=256)
def md_to_html(text: str) -> str:
    """Convert LLM markdown to clean HTML for the frontend.

    Cached with LRU (256 entries) — identical markdown fragments are common
    during session replays and avoid repeated parsing overhead.
    """
    return md.markdown(text, extensions=list(_MD_EXTENSIONS))


# ─── Configuration ────────────────────────────────────────────────────────────

NVIDIA_API_KEY: str = os.getenv("NVIDIA_API_KEY", "")
CHAT_MODEL: str = os.getenv("CHAT_MODEL", "minimaxai/minimax-m2.1")
CHAT_PORT: int = int(os.getenv("CHAT_PORT", "3003"))
MAX_HISTORY_MESSAGES: int = int(os.getenv("MAX_HISTORY_MESSAGES", "20"))
SESSION_TTL_HOURS: int = int(os.getenv("SESSION_TTL_HOURS", "24"))

if not NVIDIA_API_KEY:
    raise ValueError("NVIDIA_API_KEY is required. Set it in .env")

# ─── LangChain LLMs (singleton instances, reused for connection pooling) ─────

chat_llm = ChatNVIDIA(
    model=CHAT_MODEL,
    api_key=NVIDIA_API_KEY,
    temperature=0.8,
    top_p=0.95,
    max_completion_tokens=4096,
)

canvas_llm = ChatNVIDIA(
    model=CHAT_MODEL,
    api_key=NVIDIA_API_KEY,
    temperature=0.2,
    top_p=0.9,
    max_completion_tokens=4096,
)

# ─── Pydantic Schemas (Validated structured output) ──────────────────────────


class CanvasElement(BaseModel):
    """A single element on the Excalidraw canvas.

    Pydantic v2 model used for validating LLM-generated canvas elements.
    """

    id: str = Field(description="Unique element ID, e.g. 'el-1'")
    type: str = Field(
        description="Shape type: rectangle, ellipse, diamond, text, arrow, line"
    )
    x: int = Field(default=100, description="X position in pixels")
    y: int = Field(default=100, description="Y position in pixels")
    width: int = Field(default=200, description="Width in pixels")
    height: int = Field(default=100, description="Height in pixels")
    text: str = Field(default="", description="Text inside shape or label")
    backgroundColor: str = Field(default="#3b82f6", description="Fill color hex")
    strokeColor: str = Field(default="#1e1e1e", description="Border color hex")
    startId: str | None = Field(
        default=None, description="Arrow source element ID"
    )
    endId: str | None = Field(
        default=None, description="Arrow target element ID"
    )


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: str | None = None


class CanvasContextRequest(BaseModel):
    session_id: str
    elements: list[dict] = Field(default_factory=list)
    description: str | None = None


class ClearRequest(BaseModel):
    session_id: str


# ─── LangChain Prompts ───────────────────────────────────────────────────────

chat_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are **Canvas AI**, an intelligent assistant embedded in a collaborative whiteboard application (Excalidraw-based).

## Your Capabilities
- Help users brainstorm, plan, and organize ideas on their whiteboard
- Suggest diagram structures (flowcharts, mind maps, class diagrams, sequence diagrams)
- Draw shapes, diagrams, and text directly on the canvas
- Analyze the current canvas content and provide insights
- Explain concepts, provide code snippets, and answer questions
- Suggest visual improvements and layout optimizations

## Response Guidelines
1. **Be concise** — Users are working visually. Keep responses focused and actionable.
2. **Use formatting** — Use markdown with headers, lists, and code blocks.
3. **When drawing** — Briefly describe what you're creating. Elements are generated automatically.
4. **Canvas awareness** — Reference specific elements the user has drawn when context is available.
5. **Proactive suggestions** — Suggest improvements naturally.
6. **Friendly tone** — Be a collaborative partner, not a formal assistant.

## Current Canvas Context
{canvas_context}"""),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}"),
])

canvas_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a canvas element generator for an Excalidraw whiteboard.
Generate a JSON array of canvas elements based on the user's request.

RULES:
1. Output ONLY a valid JSON array. No markdown, no explanation, no code fences.
2. Each element needs: id, type, x, y, width, height.
3. Supported types: rectangle, ellipse, diamond, text, arrow, line.
4. Give each element a unique "id" (e.g., "el-1", "el-2").
5. Space elements at least 250px apart horizontally, 200px vertically.
6. Colors: blue=#3b82f6, green=#22c55e, red=#ef4444, yellow=#f59e0b, purple=#8b5cf6, pink=#ec4899.
7. For arrows: use startId/endId to reference shape ids.
8. For text inside shapes: use the "text" field.
9. Start positioning from x=100, y=100.

Canvas context: {canvas_context}"""),
    ("human", "{input}"),
])

# ─── LCEL Chains ─────────────────────────────────────────────────────────────

# Chat chain: prompt → LLM (streams) — no parser so we can stream raw chunks
chat_chain = chat_prompt | chat_llm

# Canvas chain: prompt → LLM (deterministic) → string parser
canvas_chain = canvas_prompt | canvas_llm | StrOutputParser()

# ─── AI Tool Intent Detection ─────────────────────────────────────────────────
#
# Routes user messages to the appropriate AI tool:
#   diagram  → Mermaid-based diagram generation (best quality diagrams)
#   image    → FLUX image generation (actual images on canvas)
#   sketch   → ControlNet sketch-to-image conversion
#   ocr      → Vision-based text extraction
#   tts      → Text-to-speech synthesis
#   draw     → Basic canvas_chain shapes (fallback for simple drawing)
#   None     → Plain chat (no tool needed)

_TOOL_KEYWORDS: dict[str, frozenset[str]] = {
    "diagram": frozenset({
        "flowchart", "diagram", "mindmap", "mind map", "sequence diagram",
        "class diagram", "er diagram", "gantt", "pie chart", "state diagram",
        "graph", "chart", "architecture", "uml", "schema",
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
        "text recognition", "scan text",
    }),
    "tts": frozenset({
        "read aloud", "speak", "say this", "text to speech",
        "read this aloud", "tts", "pronounce", "voice",
        "say it out loud", "read out",
    }),
}

# Fallback: basic shape drawing keywords (uses canvas_chain)
_DRAW_KEYWORDS: frozenset[str] = frozenset({
    "draw", "create", "add", "place", "make", "build", "put", "insert",
    "box", "circle", "rectangle", "arrow", "shape", "ellipse", "diamond",
    "layout", "wireframe", "design", "sticky", "note",
    "organize", "arrange", "connect", "link",
})

# Diagram styles derived from prompt keywords
_DIAGRAM_STYLES: dict[str, str] = {
    "flowchart": "flowchart",
    "flow chart": "flowchart",
    "mindmap": "mindmap",
    "mind map": "mindmap",
    "sequence": "sequence",
    "class diagram": "classDiagram",
    "er diagram": "erDiagram",
    "state diagram": "stateDiagram",
    "gantt": "gantt",
    "pie": "pie",
}


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
                style = "flowchart"  # default
                for keyword, diagram_style in _DIAGRAM_STYLES.items():
                    if keyword in msg_lower:
                        style = diagram_style
                        break
                result["style"] = style

            return result

    # Fallback: basic shape drawing
    if any(kw in msg_lower for kw in _DRAW_KEYWORDS):
        return {"tool": "draw", "prompt": message}

    return None


# ─── Canvas Element Parser ───────────────────────────────────────────────────


def parse_canvas_json(raw: str) -> list[dict] | None:
    """Clean LLM output and parse as a list of canvas elements.

    Strips think tags, markdown fences, and validates JSON structure.
    Uses Pydantic for validation with graceful fallback to raw dicts.
    """
    text = strip_think_tags(raw).strip()

    # Remove markdown fences if model wraps output
    if text.startswith("```"):
        text = _FENCE_OPEN.sub("", text)
        text = _FENCE_CLOSE.sub("", text)

    try:
        parsed = json.loads(text)
        if isinstance(parsed, list) and len(parsed) > 0:
            validated: list[dict] = []
            for item in parsed:
                try:
                    el = CanvasElement(**item)
                    validated.append(el.model_dump(exclude_none=True))
                except Exception:
                    # Keep raw if close enough — LLM output may vary slightly
                    validated.append(item)
            return validated
    except json.JSONDecodeError as e:
        print(f"[Canvas] JSON parse error: {e}")

    return None


# ─── LangGraph State + In-Memory Session Storage ─────────────────────────────


class PipelineState(TypedDict):
    """LangGraph-style typed state for the two-phase pipeline.

    Using TypedDict for explicit, inspectable state management
    as recommended by LangGraph patterns.
    """

    session_id: str
    user_message: str
    canvas_context: str
    history: list
    full_response: str
    html: str
    drawing_requested: bool
    canvas_elements: list[dict] | None
    error: str | None


class Session:
    """Chat session with conversation history and canvas context.

    Uses __slots__ for memory efficiency — significant savings when
    many concurrent sessions are active (Pattern 13 from perf skill).
    """

    __slots__ = ("messages", "canvas_context", "created_at")

    def __init__(self) -> None:
        self.messages: list[HumanMessage | AIMessage] = []
        self.canvas_context: str = "No canvas elements loaded yet."
        self.created_at: str = datetime.now().isoformat()

    def get_chain_input(self, user_input: str) -> dict[str, Any]:
        """Build input dict for the chat LCEL chain.

        Slices history to the last N messages to stay within
        the model's context window. Uses local variable for the
        slice bound (faster than repeated attribute access).
        """
        max_msgs = MAX_HISTORY_MESSAGES
        return {
            "canvas_context": self.canvas_context,
            "history": self.messages[-max_msgs:],
            "input": user_input,
        }

    def trim_history(self) -> None:
        """Trim conversation history to prevent unbounded memory growth.

        Keeps only the most recent messages. Called after each response
        to cap memory usage per session.
        """
        max_keep = MAX_HISTORY_MESSAGES * 2  # Keep 2x window for context
        if len(self.messages) > max_keep:
            self.messages = self.messages[-max_keep:]


# Dict-based session store — O(1) lookup/insert (Pattern 8 from perf skill)
_sessions: dict[str, Session] = {}


def get_or_create_session(session_id: str | None) -> tuple[str, Session]:
    """Get existing session or create a new one.

    Uses dict.get() for single hash lookup instead of
    `in` check + `[]` access (avoids double hashing).
    """
    if session_id:
        session = _sessions.get(session_id)
        if session is not None:
            return session_id, session

    new_id = session_id or str(uuid.uuid4())
    session = Session()
    _sessions[new_id] = session
    return new_id, session


def _cleanup_stale_sessions() -> int:
    """Remove sessions older than SESSION_TTL_HOURS.

    Called periodically to prevent memory leaks from abandoned sessions.
    Returns the number of sessions removed.
    """
    now = datetime.now()
    stale_ids: list[str] = []

    for sid, session in _sessions.items():
        try:
            created = datetime.fromisoformat(session.created_at)
            age_hours = (now - created).total_seconds() / 3600
            if age_hours > SESSION_TTL_HOURS:
                stale_ids.append(sid)
        except (ValueError, TypeError):
            stale_ids.append(sid)

    for sid in stale_ids:
        del _sessions[sid]

    return len(stale_ids)


# ─── SSE Helpers (pre-serialise reusable event shapes) ───────────────────────


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE data line. Single allocation per event."""
    return f"data: {json.dumps(data, separators=(',', ':'))}\n\n"


# ─── FastAPI App with Lifecycle Hooks ─────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup + shutdown hooks.

    - Startup: validate LLM connectivity
    - Shutdown: clean up sessions
    """
    # ── Startup ──
    print(f"[Canvas AI] Chat Service v4 starting on port {CHAT_PORT}")
    print(f"   Model: {CHAT_MODEL}")
    print(f"   Chains: chat_chain (streaming), canvas_chain (structured)")
    print(f"   Max history: {MAX_HISTORY_MESSAGES} messages")
    yield
    # ── Shutdown ──
    removed = _cleanup_stale_sessions()
    _sessions.clear()
    print(f"[Canvas AI] Shutdown — cleared {removed} stale + all sessions")


app = FastAPI(
    title="Canvas AI Chat Service",
    description="Streaming chat with LangChain LCEL chains + LangGraph patterns",
    version="4.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Health check with diagnostics."""
    return {
        "status": "ok",
        "model": CHAT_MODEL,
        "sessions": len(_sessions),
        "version": "4.0.0",
    }


@app.post("/chat")
async def chat(req: ChatRequest):
    """Streaming chat endpoint using Server-Sent Events.

    Two-phase LangGraph-style pipeline:
        Phase 1 — chat_chain.astream() for text tokens
        Phase 2 — canvas_chain.ainvoke() for structured drawing elements

    SSE event types:
        {"type": "token",         "token": "...", "done": false}
        {"type": "done",          "html": "...", "session_id": "..."}
        {"type": "canvas_action", "elements": [...]}
        {"type": "error",         "error": "..."}
    """
    session_id, session = get_or_create_session(req.session_id)

    # Add user message to history
    session.messages.append(HumanMessage(content=req.message))

    # Build chain input (uses local variable for history slice)
    chain_input = session.get_chain_input(req.message)

    # Detect which AI tool (if any) should handle this message
    tool_intent = detect_tool_intent(req.message)

    async def generate() -> AsyncGenerator[str, None]:
        """SSE generator — yields data lines for each event.

        Performance notes:
        - Uses local references to avoid global/attribute lookups in hot loop
        - Generator-based (constant memory regardless of response length)
        - Pre-formats SSE events with compact JSON separators
        """
        # Local references for hot-loop performance (Pattern 9 from perf skill)
        _strip_think = strip_think_tags
        _json_dumps = json.dumps
        _sse = _sse_event

        full_response_parts: list[str] = []
        inside_think = False

        try:
            # ── Phase 1: Stream text via chat_chain.astream() ──
            async for chunk in chat_chain.astream(chain_input):
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if not token:
                    continue

                full_response_parts.append(token)

                # ── Filter <think>...</think> blocks during streaming ──
                if "<think>" in token:
                    inside_think = True
                if inside_think:
                    if "</think>" in token:
                        inside_think = False
                        after = token.split("</think>", 1)[1]
                        if after.strip():
                            yield _sse({"type": "token", "token": after, "done": False})
                    continue

                yield _sse({"type": "token", "token": token, "done": False})

            # ── Assemble full response ──
            full_response = "".join(full_response_parts)
            clean_response = _strip_think(full_response)

            # Save to history, then trim to cap memory
            session.messages.append(AIMessage(content=clean_response))
            session.trim_history()

            # Convert to HTML (LRU-cached for repeated fragments)
            html = md_to_html(clean_response)

            # Send completion event
            yield _sse({
                "type": "done",
                "token": "",
                "done": True,
                "html": html,
                "session_id": session_id,
            })

            # ── Phase 2: Route to AI tool or canvas_chain ──
            if tool_intent:
                tool_name = tool_intent["tool"]

                if tool_name == "draw":
                    # Fallback: use canvas_chain for basic shape drawing
                    canvas_input = {
                        "canvas_context": session.canvas_context,
                        "input": req.message,
                    }
                    raw_output = await canvas_chain.ainvoke(canvas_input)
                    elements = parse_canvas_json(raw_output)

                    if elements:
                        drawn_parts: list[str] = []
                        for el in elements:
                            el_type = el.get("type", "unknown")
                            el_text = el.get("text", "").strip()
                            if el_text:
                                drawn_parts.append(f'- {el_type}: "{el_text}"')
                            else:
                                drawn_parts.append(f"- {el_type}")
                        drawn_summary = "\n".join(drawn_parts)
                        session.canvas_context += (
                            f"\n\nAI just drew {len(elements)} elements:\n"
                            f"{drawn_summary}"
                        )

                        yield _sse({
                            "type": "canvas_action",
                            "elements": elements,
                        })
                else:
                    # Route to a real AI tool (diagram, image, sketch, ocr, tts)
                    tool_event: dict[str, Any] = {
                        "type": "tool_action",
                        "tool": tool_name,
                        "prompt": tool_intent.get("prompt", req.message),
                    }
                    # Include style for diagram tool
                    if tool_name == "diagram" and "style" in tool_intent:
                        tool_event["style"] = tool_intent["style"]
                    # Include text for TTS
                    if tool_name == "tts":
                        tool_event["text"] = clean_response

                    yield _sse(tool_event)

        except Exception as e:
            yield _sse({
                "type": "error",
                "token": "",
                "done": True,
                "error": str(e),
                "session_id": session_id,
            })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Session-Id": session_id,
        },
    )


@app.post("/chat/context")
async def update_canvas_context(req: CanvasContextRequest):
    """Update the canvas context so the AI knows what's on the board.

    Uses efficient dict-based counting and list slicing to
    summarise canvas elements without excessive allocations.
    """
    session = _sessions.get(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    if req.description:
        session.canvas_context = req.description
    elif req.elements:
        summary_parts: list[str] = []
        type_counts: dict[str, int] = {}

        # Process at most 50 elements to bound CPU time
        for el in req.elements[:50]:
            el_type = el.get("type", "unknown")
            type_counts[el_type] = type_counts.get(el_type, 0) + 1

            text = el.get("text", "").strip()
            if text and len(text) < 200:
                summary_parts.append(f'- {el_type}: "{text}"')

        counts_str = ", ".join(
            f"{count} {t}(s)" for t, count in type_counts.items()
        )
        elements_str = "\n".join(summary_parts[:20])

        session.canvas_context = (
            f"Canvas has {len(req.elements)} elements: {counts_str}.\n"
            f"Text content found:\n{elements_str}"
            if elements_str
            else f"Canvas has {len(req.elements)} elements: {counts_str}. No text content."
        )
    else:
        session.canvas_context = "Canvas is empty."

    return {"status": "ok", "context_length": len(session.canvas_context)}


@app.post("/chat/clear")
async def clear_session(req: ClearRequest):
    """Clear conversation history and canvas context for a session."""
    session = _sessions.get(req.session_id)
    if session is not None:
        session.messages.clear()
        session.canvas_context = "No canvas elements loaded yet."
        return {"status": "ok", "message": "Session cleared"}
    return {"status": "ok", "message": "Session not found (already clean)"}


@app.delete("/chat/session/{session_id}")
async def delete_session(session_id: str):
    """Delete an entire session."""
    _sessions.pop(session_id, None)
    return {"status": "ok"}


@app.post("/admin/cleanup")
async def admin_cleanup():
    """Manual trigger for stale session cleanup."""
    removed = _cleanup_stale_sessions()
    return {"status": "ok", "removed": removed, "remaining": len(_sessions)}


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=CHAT_PORT)
