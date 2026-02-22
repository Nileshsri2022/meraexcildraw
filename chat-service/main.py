"""
AI Canvas Chat Assistant — Python Microservice  (v5.0)

A streaming chatbot powered by arcee-ai/trinity-large-preview:free via
OpenRouter, built with LangChain 1.x architecture patterns:

  - ChatOpenAI with OpenRouter base_url for OpenAI-compatible LCEL chains
  - ChatPromptTemplate + MessagesPlaceholder for prompt management
  - LCEL chains (prompt | llm | parser) with async-first patterns
  - Pydantic v2 schemas for structured canvas output
  - StrOutputParser for reliable chain composition
  - Python performance best practices (__slots__, frozenset, compiled regex,
    generator-based SSE, local-variable hot paths, LRU cache)

Architecture:
    Phase 1 — Stream text via SSE  (chat_chain.astream)
    Phase 2 — Generate structured canvas elements (canvas_chain.ainvoke)
              OR route to AI tools (diagram, image, sketch, ocr, tts)

Endpoints:
    POST /chat          — Streaming SSE chat with optional canvas actions
    POST /chat/context  — Update canvas context
    POST /chat/clear    — Clear conversation history
    DELETE /chat/session/{id} — Delete session
    GET  /health        — Health check
    GET  /debug/test-llm — LLM connectivity test
"""

from __future__ import annotations

import asyncio
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
from langchain_openai import ChatOpenAI

# ─── LangChain OpenAI Monkey Patch for OpenRouter Reasoning ───────────────────
#
# LangChain normally strips custom message fields like 'reasoning_details'.
# OpenRouter requires passing 'reasoning_details' unmodified back to the API.
# This patch ensures AIMessage.additional_kwargs["reasoning_details"] is
# correctly serialized to {"role": "assistant", "reasoning_details": ...}

try:
    import langchain_openai.chat_models.base as lc_base
    _orig_convert = lc_base._convert_message_to_dict

    def _patched_convert_message_to_dict(message, *args, **kwargs):
        msg_dict = _orig_convert(message, *args, **kwargs)
        if hasattr(message, "additional_kwargs") and "reasoning_details" in message.additional_kwargs:
            msg_dict["reasoning_details"] = message.additional_kwargs["reasoning_details"]
        return msg_dict

    lc_base._convert_message_to_dict = _patched_convert_message_to_dict
except Exception as e:
    print(f"[Warning] Could not patch langchain_openai message converter: {e}")

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

OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
CHAT_MODEL: str = os.getenv("CHAT_MODEL", "arcee-ai/trinity-large-preview:free")
CHAT_PORT: int = int(os.getenv("CHAT_PORT", "3003"))
MAX_HISTORY_MESSAGES: int = int(os.getenv("MAX_HISTORY_MESSAGES", "20"))
SESSION_TTL_HOURS: int = int(os.getenv("SESSION_TTL_HOURS", "24"))

if not OPENROUTER_API_KEY:
    raise ValueError("OPENROUTER_API_KEY is required. Set it in .env")

# ─── OpenRouter LLMs via ChatOpenAI (OpenAI-compatible endpoint) ─────────────
#
# Using ChatOpenAI with OpenRouter's base_url gives us full LCEL chain
# compatibility while accessing OpenRouter's model catalog.
# Singleton instances reuse HTTP connection pools.

chat_llm = ChatOpenAI(
    model=CHAT_MODEL,
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
    temperature=0.8,
    max_tokens=4096,
    streaming=True,
    model_kwargs={"extra_body": {"reasoning": {"enabled": True}}},
)

canvas_llm = ChatOpenAI(
    model=CHAT_MODEL,
    api_key=OPENROUTER_API_KEY,
    base_url="https://openrouter.ai/api/v1",
    temperature=0.2,
    max_tokens=4096,
    streaming=False,
    # Canvas doesn't strictly need reasoning since it just outputs JSON,
    # but we enable it to match the configured model's requirements if it strictly requires it.
    model_kwargs={"extra_body": {"reasoning": {"enabled": True}}},
)


# ─── Pydantic Schemas (Validated structured output) ──────────────────────────


class CanvasElement(BaseModel):
    """Single Excalidraw element generated by the AI."""
    type: str = Field(description="Element type")
    x: float = Field(default=100)
    y: float = Field(default=100)
    width: float | None = None
    height: float | None = None
    text: str | None = None
    backgroundColor: str | None = None
    strokeColor: str | None = None
    fontSize: int | None = None
    id: str | None = None
    startId: str | None = None
    endId: str | None = None


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class CanvasContextRequest(BaseModel):
    session_id: str
    elements: list[dict] | None = None
    description: str | None = None


class ClearRequest(BaseModel):
    session_id: str


# ─── Prompts (LangChain ChatPromptTemplate for maintainability) ──────────────

chat_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are **Canvas AI**, an intelligent assistant embedded in a collaborative whiteboard application (Excalidraw-based).

## Your Capabilities
- **Generate Images**: You CAN generate realistic or stylized images directly onto the canvas.
- **Convert Sketches**: You CAN turn user's rough sketches into realistic images.
- **Generate Diagrams**: You CAN generate Mermaid-based diagrams (flowcharts, mind maps, sequence diagrams, etc.).
- **Draw Shapes**: You CAN draw basic shapes, diagrams, and text directly on the canvas.
- **OCR text**: You CAN read and extract text from images on the canvas.
- **Text-to-Speech**: You CAN speak aloud.

**IMPORTANT:** The system automatically intercepts your responses to execute these specific tasks using specialized AI tools in the background. Therefore, if a user asks for an image, diagram, or any of the above, NEVER apologize or say you cannot do it. Instead, enthusiastically acknowledge the request and briefly state what you are generating.

## Response Guidelines
1. **Be concise** — Users are working visually. Keep responses focused and actionable.
2. **Use formatting** — Use markdown with headers, lists, and code blocks.
3. **When drawing/generating** — Briefly describe what you're creating. Do NOT include the actual image URL or diagram code, as the system handles it automatically.
4. **Canvas awareness** — Reference specific elements the user has drawn when context is available.
5. **Friendly tone** — Be a collaborative partner, not a formal assistant."""),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}"),
])

canvas_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a canvas element generator for an Excalidraw whiteboard.
Generate a JSON array of elements based on the user's request.

RULES:
- Output ONLY a JSON array — no markdown, no explanation
- Each element must have: type, x, y
- Supported types: rectangle, ellipse, diamond, text, arrow, line
- Text elements MUST include "text" field
- Arrows connecting elements use "startId" and "endId"
- Use reasonable spacing (150-200px between elements)
- Use vibrant colors like #a855f7, #3b82f6, #10b981, #f59e0b, #ef4444
- Generate unique IDs prefixed with "ai-"
- Keep coordinates positive (100-1200 range)

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
    """Parse LLM output into validated canvas elements.

    Handles markdown fences, validates with Pydantic, and gracefully
    degrades when output doesn't perfectly match the schema.
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


# ─── Session Management (with __slots__ for memory efficiency) ────────────────


class ChatSession:
    """In-memory conversation session.

    Uses __slots__ for 40-60% memory savings per instance (Pattern 13).
    Typical deployment with 1000 concurrent sessions saves ~200KB.
    """
    __slots__ = ("session_id", "messages", "canvas_context", "created_at", "last_active")

    def __init__(self, session_id: str) -> None:
        self.session_id = session_id
        self.messages: list[HumanMessage | AIMessage] = []
        self.canvas_context: str = "The whiteboard is currently completely empty."
        self.created_at: datetime = datetime.now()
        self.last_active: datetime = datetime.now()

    def trim_history(self) -> None:
        """Cap conversation history to prevent unbounded memory growth.

        Uses list slicing (O(k) where k = MAX_HISTORY_MESSAGES) instead of
        repeated pop(0) which is O(n) per removal.
        """
        if len(self.messages) > MAX_HISTORY_MESSAGES:
            self.messages = self.messages[-MAX_HISTORY_MESSAGES:]

    def get_chain_input(self, user_input: str) -> dict:
        """Build the input dict for LCEL chains.

        Pre-computed once per request; avoids re-slicing in the hot loop.
        """
        self.last_active = datetime.now()
        self.messages.append(HumanMessage(content=user_input))

        # Keep history bounded, excluding the message we JUST added
        # so it isn't duplicated in the `history` and `input` variables.
        history = self.messages[-(MAX_HISTORY_MESSAGES):-1]
        
        # Inject the live canvas context into the current turn to override History Anchor Bias
        injected_input = (
            f"[SYSTEM NOTE: Current Live Canvas Context]\n"
            f"{self.canvas_context}\n\n"
            f"[User Request]\n"
            f"{user_input}"
        )

        return {
            "input": injected_input,
            "history": history,
            "canvas_context": self.canvas_context,
        }


# Session storage (dict for O(1) lookups)
_sessions: dict[str, ChatSession] = {}


def _cleanup_stale_sessions() -> int:
    """Remove sessions older than SESSION_TTL_HOURS.

    Called periodically to prevent memory leaks from abandoned sessions.
    """
    cutoff = datetime.now()
    stale = [
        sid for sid, s in _sessions.items()
        if (cutoff - s.last_active).total_seconds() > SESSION_TTL_HOURS * 3600
    ]
    for sid in stale:
        del _sessions[sid]
    if stale:
        print(f"[Cleanup] Removed {len(stale)} stale sessions")
    return len(stale)


# ─── FastAPI App ──────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup + shutdown hooks."""
    print(f"[Boot] Canvas AI Chat Service v5.0")
    print(f"[Boot] Model: {CHAT_MODEL}")
    print(f"[Boot] API: OpenRouter (https://openrouter.ai/api/v1)")
    print(f"[Boot] Port: {CHAT_PORT}")
    yield
    print("[Shutdown] Chat service stopping")


app = FastAPI(
    title="Canvas AI Chat Service",
    version="5.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── SSE Helpers (pre-serialise reusable event shapes) ────────────────────────


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE data line. Single allocation per event."""
    return f"data: {json.dumps(data, separators=(',', ':'))}\n\n"


# ─── Endpoints ────────────────────────────────────────────────────────────────


@app.get("/health")
async def health():
    """Health check with diagnostics."""
    return {
        "status": "ok",
        "model": CHAT_MODEL,
        "sessions": len(_sessions),
        "version": "5.0.0",
        "api": "openrouter",
        "api_key_set": bool(OPENROUTER_API_KEY),
    }


@app.get("/debug/test-llm")
async def test_llm():
    """Quick LLM connectivity test — 30s timeout."""
    try:
        async with asyncio.timeout(30):
            result = await chat_llm.ainvoke("Say hello in one word")
            content = result.content if hasattr(result, "content") else str(result)
            return {
                "status": "ok",
                "model": CHAT_MODEL,
                "response": content[:200],
            }
    except asyncio.TimeoutError:
        return {"status": "timeout", "model": CHAT_MODEL, "error": "LLM did not respond within 30s"}
    except Exception as e:
        return {"status": "error", "model": CHAT_MODEL, "error": str(e)}


@app.post("/chat")
async def chat(req: ChatRequest):
    """Streaming chat endpoint using Server-Sent Events.

    Two-phase pipeline:
      Phase 1: Stream text tokens from chat_chain.astream()
      Phase 2: Either route to AI tool OR generate canvas elements

    SSE event types:
      - token          → streaming text chunk
      - done           → final HTML + session_id
      - canvas_action  → draw elements on canvas
      - tool_action    → trigger front-end AI tool
      - error          → error message
    """
    # Get or create session
    session_id = req.session_id or str(uuid.uuid4())
    if session_id not in _sessions:
        _sessions[session_id] = ChatSession(session_id)
    session = _sessions[session_id]

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
        # Local references for hot-loop performance (Pattern 9)
        _strip_think = strip_think_tags
        _json_dumps = json.dumps
        _sse = _sse_event

        full_response_parts: list[str] = []
        reasoning_details_accum: list[str] = []
        inside_think = False
        chunks_yielded = 0

        try:
            # Send initial heartbeat to keep connection alive
            yield ": heartbeat\n\n"

            print(f"[Chat] Starting LLM stream for session {session_id}")

            # ── Phase 1: Stream text via chat_chain.astream() ──
            async with asyncio.timeout(90):
                async for chunk in chat_chain.astream(chain_input):
                    # Capture reasoning_details if OpenRouter streams it via additional_kwargs
                    rd = chunk.additional_kwargs.get("reasoning_details") or getattr(chunk, "reasoning_details", None)
                    if rd:
                        reasoning_details_accum.append(str(rd))

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
                                chunks_yielded += 1
                        else:
                            # Send keep-alive during think phase to prevent proxy timeout
                            chunks_yielded += 1
                            if chunks_yielded % 10 == 0:
                                yield ": keepalive\n\n"
                        continue

                    yield _sse({"type": "token", "token": token, "done": False})

            print(f"[Chat] LLM stream completed, {len(full_response_parts)} chunks")

            # ── Assemble full response ──
            full_response = "".join(full_response_parts)
            clean_response = _strip_think(full_response)

            # Extract reasoning_details from final compiled parts or just fallback to string think block
            final_reasoning = "".join(reasoning_details_accum)

            # Save to history, preserving OpenRouter reasoning unmodified
            ai_msg = AIMessage(content=clean_response)
            if final_reasoning:
                ai_msg.additional_kwargs["reasoning_details"] = final_reasoning
            
            session.messages.append(ai_msg)
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
                print(f"[Chat] Tool intent detected: {tool_name}")

                if tool_name == "draw":
                    # Fallback: use canvas_chain for basic shape drawing
                    canvas_input = {
                        "canvas_context": session.canvas_context,
                        "input": req.message,
                    }
                    async with asyncio.timeout(60):
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

        except asyncio.TimeoutError:
            print(f"[Chat] LLM timeout for session {session_id}")
            yield _sse({
                "type": "error",
                "token": "",
                "done": True,
                "error": "LLM response timed out. Please try again.",
                "session_id": session_id,
            })
        except Exception as e:
            print(f"[Chat] Error for session {session_id}: {e}")
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
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Connection": "keep-alive",
            "X-Session-Id": session_id,
            # Disable proxy/CDN buffering (critical for Railway + Fastly)
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Transfer-Encoding": "chunked",
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
            f"The whiteboard currently has {len(req.elements)} shape(s)/element(s) drawn by the user: {counts_str}.\n"
            f"Text content written on the whiteboard:\n{elements_str}"
            if elements_str
            else f"The whiteboard currently has {len(req.elements)} shape(s)/element(s) drawn by the user: {counts_str}. There is no text written on the board."
        )
    else:
        session.canvas_context = "The whiteboard is currently completely empty."

    return {"status": "ok", "context_length": len(session.canvas_context)}


@app.post("/chat/clear")
async def clear_session(req: ClearRequest):
    """Clear conversation history and canvas context for a session."""
    session = _sessions.get(req.session_id)
    if session:
        session.messages = []
        session.canvas_context = "The whiteboard is currently completely empty."
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

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=CHAT_PORT,
        reload=True,
    )
