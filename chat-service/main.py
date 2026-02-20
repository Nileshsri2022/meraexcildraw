"""
AI Canvas Chat Assistant — Python Microservice

A streaming chatbot powered by MiniMax M2.1 via NVIDIA AI Endpoints.
Understands the whiteboard canvas context and helps users create,
modify, and analyze their diagrams and drawings.

Architecture:
    Phase 1 — Stream text response via SSE (type: "token")
    Phase 2 — If drawing is requested, generate structured canvas
              elements via a separate LLM call (type: "canvas_action")

Endpoints:
    POST /chat          — Streaming SSE chat with optional canvas actions
    POST /chat/context  — Update canvas context (elements on board)
    POST /chat/clear    — Clear conversation history
    DELETE /chat/session/{id} — Delete session
    GET  /health        — Health check
"""

import os
import re
import json
import uuid
from typing import AsyncGenerator
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
import markdown as md

load_dotenv()

# ─── Markdown → HTML converter ────────────────────────────────────────────────

MD_EXTENSIONS = ["fenced_code", "tables", "nl2br", "sane_lists", "smarty"]

THINK_PATTERN = re.compile(r"<think>.*?</think>", re.DOTALL)

def strip_think_tags(text: str) -> str:
    """Remove <think>...</think> reasoning blocks from model output."""
    return THINK_PATTERN.sub("", text).lstrip("\n")

def md_to_html(text: str) -> str:
    """Convert LLM markdown response to clean HTML for the frontend."""
    return md.markdown(text, extensions=MD_EXTENSIONS)

# ─── Configuration ────────────────────────────────────────────────────────────

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
CHAT_MODEL = os.getenv("CHAT_MODEL", "minimaxai/minimax-m2.1")
CHAT_PORT = int(os.getenv("CHAT_PORT", "3003"))

if not NVIDIA_API_KEY:
    raise ValueError("NVIDIA_API_KEY is required. Set it in .env")

# ─── LangChain Clients ───────────────────────────────────────────────────────

# Main chat LLM (streaming, creative)
chat_llm = ChatNVIDIA(
    model=CHAT_MODEL,
    api_key=NVIDIA_API_KEY,
    temperature=0.8,
    top_p=0.95,
    max_completion_tokens=4096,
)

# Canvas action LLM (structured output, deterministic)
canvas_llm = ChatNVIDIA(
    model=CHAT_MODEL,
    api_key=NVIDIA_API_KEY,
    temperature=0.2,
    top_p=0.9,
    max_completion_tokens=4096,
)

# ─── LangChain Output Parser ────────────────────────────────────────────────

canvas_parser = JsonOutputParser()

# ─── Canvas Element Schema (for the LLM prompt) ──────────────────────────────

CANVAS_ELEMENT_SCHEMA = """[
  {
    "id": "unique-id",
    "type": "rectangle | ellipse | diamond | text | arrow | line",
    "x": 100,
    "y": 100,
    "width": 200,
    "height": 100,
    "text": "Label text",
    "backgroundColor": "#3b82f6",
    "strokeColor": "#1e1e1e",
    "startId": "source-element-id (for arrows only)",
    "endId": "target-element-id (for arrows only)"
  }
]"""

# ─── Prompts ─────────────────────────────────────────────────────────────────

CHAT_SYSTEM_PROMPT = """You are **Canvas AI**, an intelligent assistant embedded in a collaborative whiteboard application (Excalidraw-based).

## Your Capabilities
- Help users brainstorm, plan, and organize ideas on their whiteboard
- Suggest diagram structures (flowcharts, mind maps, class diagrams, sequence diagrams)
- Draw shapes, diagrams, and text directly on the canvas
- Analyze the current canvas content and provide insights
- Help with writing, editing, and refining text on the board
- Explain concepts, provide code snippets, and answer questions
- Suggest visual improvements and layout optimizations

## Response Guidelines
1. **Be concise** — Users are working visually. Keep responses focused and actionable.
2. **Use formatting** — Use markdown with headers, lists, and code blocks.
3. **When drawing** — Just describe what you're adding. The canvas elements will be generated automatically.
4. **Canvas awareness** — When canvas context is provided, reference specific elements the user has drawn.
5. **Proactive suggestions** — If you notice improvements, suggest them naturally.
6. **Friendly tone** — Be a collaborative partner, not a formal assistant.

## Current Canvas Context
{canvas_context}
"""

CANVAS_ACTION_PROMPT = """You are a canvas element generator for an Excalidraw whiteboard.

Based on the user's request, generate a JSON array of canvas elements.

RULES:
1. Output ONLY a valid JSON array. No markdown, no explanation, no code fences.
2. Each element needs: id, type, x, y, width, height.
3. Supported types: rectangle, ellipse, diamond, text, arrow, line.
4. Give each element a unique "id" (e.g., "el-1", "el-2").
5. Space elements at least 250px apart horizontally, 200px vertically.
6. Use these colors: blue=#3b82f6, green=#22c55e, red=#ef4444, yellow=#f59e0b, purple=#8b5cf6, pink=#ec4899.
7. For arrows, use startId/endId to reference shape ids.
8. For text inside shapes, use the "text" field.
9. Start positioning from x=100, y=100.

SCHEMA for each element:
{schema}

User request: {user_message}
Canvas context: {canvas_context}

Respond with ONLY the JSON array:"""

# ─── Drawing Intent Detection ────────────────────────────────────────────────

DRAW_KEYWORDS = {
    "draw", "create", "add", "place", "make", "build", "put", "insert",
    "diagram", "flowchart", "chart", "graph", "mindmap", "mind map",
    "box", "circle", "rectangle", "arrow", "shape", "ellipse", "diamond",
    "layout", "wireframe", "sketch", "design", "sticky", "note",
    "architecture", "schema", "er diagram", "class diagram", "sequence",
    "organize", "arrange", "connect", "link",
}

def has_drawing_intent(message: str) -> bool:
    """Detect if the user's message requests drawing on the canvas."""
    msg_lower = message.lower()
    return any(kw in msg_lower for kw in DRAW_KEYWORDS)

# ─── Canvas Element Generator (LangChain structured output) ──────────────────

def generate_canvas_elements(user_message: str, canvas_context: str) -> list[dict] | None:
    """
    Use LangChain to generate structured canvas elements.
    Makes a separate LLM call with low temperature for reliable JSON.
    """
    prompt = CANVAS_ACTION_PROMPT.format(
        schema=CANVAS_ELEMENT_SCHEMA,
        user_message=user_message,
        canvas_context=canvas_context,
    )

    try:
        response = canvas_llm.invoke([HumanMessage(content=prompt)])
        raw = strip_think_tags(response.content).strip()

        # Clean up: remove markdown fences if the model wraps them
        if raw.startswith("```"):
            raw = re.sub(r"^```\w*\n?", "", raw)
            raw = re.sub(r"\n?```$", "", raw)

        elements = canvas_parser.parse(raw)

        # Validate it's a list
        if isinstance(elements, list) and len(elements) > 0:
            return elements

    except Exception as e:
        print(f"[CanvasAction] Failed to generate elements: {e}")

    return None

# ─── In-Memory Session Storage ────────────────────────────────────────────────

class Session:
    """Chat session with conversation history and canvas context."""

    def __init__(self):
        self.messages: list = []
        self.canvas_context: str = "No canvas elements loaded yet."
        self.created_at: str = datetime.now().isoformat()

    def get_system_message(self) -> SystemMessage:
        return SystemMessage(
            content=CHAT_SYSTEM_PROMPT.format(canvas_context=self.canvas_context)
        )

    def get_langchain_messages(self) -> list:
        """Build the full message list for the LLM."""
        result = [self.get_system_message()]
        recent = self.messages[-20:]
        result.extend(recent)
        return result


sessions: dict[str, Session] = {}


def get_or_create_session(session_id: str | None) -> tuple[str, Session]:
    """Get existing session or create a new one."""
    if session_id and session_id in sessions:
        return session_id, sessions[session_id]
    new_id = session_id or str(uuid.uuid4())
    sessions[new_id] = Session()
    return new_id, sessions[new_id]


# ─── Pydantic Models ─────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    session_id: str | None = None

class CanvasContextRequest(BaseModel):
    session_id: str
    elements: list[dict] = Field(default_factory=list)
    description: str | None = None

class ClearRequest(BaseModel):
    session_id: str

# ─── FastAPI App ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="Canvas AI Chat Service",
    description="Streaming chat microservice for the AI Whiteboard",
    version="2.0.0",
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
    return {
        "status": "ok",
        "model": CHAT_MODEL,
        "sessions": len(sessions),
    }


@app.post("/chat")
async def chat(req: ChatRequest):
    """
    Streaming chat endpoint using Server-Sent Events.

    SSE event types:
        {"type": "token",  "token": "...", "done": false}
        {"type": "done",   "html": "...", "session_id": "..."}
        {"type": "canvas_action", "elements": [...]}
        {"type": "error",  "error": "..."}
    """
    session_id, session = get_or_create_session(req.session_id)

    session.messages.append(HumanMessage(content=req.message))
    messages = session.get_langchain_messages()

    # Check drawing intent upfront
    drawing_requested = has_drawing_intent(req.message)

    async def generate() -> AsyncGenerator[str, None]:
        full_response = ""
        inside_think = False

        try:
            # ── Phase 1: Stream text response ──
            for chunk in chat_llm.stream(messages):
                token = chunk.content
                if token:
                    full_response += token

                    if "<think>" in token:
                        inside_think = True
                    if inside_think:
                        if "</think>" in token:
                            inside_think = False
                            after = token.split("</think>", 1)[1]
                            if after.strip():
                                data = json.dumps({"type": "token", "token": after, "done": False})
                                yield f"data: {data}\n\n"
                        continue

                    data = json.dumps({"type": "token", "token": token, "done": False})
                    yield f"data: {data}\n\n"

            # Clean up response
            clean_response = strip_think_tags(full_response)
            session.messages.append(AIMessage(content=clean_response))

            html = md_to_html(clean_response)

            # Send final text event
            done_data = json.dumps({
                "type": "done",
                "token": "",
                "done": True,
                "html": html,
                "session_id": session_id,
            })
            yield f"data: {done_data}\n\n"

            # ── Phase 2: Generate canvas actions (if drawing requested) ──
            if drawing_requested:
                elements = generate_canvas_elements(
                    req.message, session.canvas_context
                )
                if elements:
                    action_data = json.dumps({
                        "type": "canvas_action",
                        "elements": elements,
                    })
                    yield f"data: {action_data}\n\n"

        except Exception as e:
            error_data = json.dumps({
                "type": "error",
                "token": "",
                "done": True,
                "error": str(e),
                "session_id": session_id,
            })
            yield f"data: {error_data}\n\n"

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
    """Update the canvas context for a session so the AI knows what's on the board."""
    if req.session_id not in sessions:
        raise HTTPException(status_code=404, detail="Session not found")

    session = sessions[req.session_id]

    if req.description:
        session.canvas_context = req.description
    elif req.elements:
        summary_parts = []
        type_counts: dict[str, int] = {}

        for el in req.elements[:50]:
            el_type = el.get("type", "unknown")
            type_counts[el_type] = type_counts.get(el_type, 0) + 1

            text = el.get("text", "").strip()
            if text and len(text) < 200:
                summary_parts.append(f'- {el_type}: "{text}"')

        counts_str = ", ".join(f"{count} {t}(s)" for t, count in type_counts.items())
        elements_str = "\n".join(summary_parts[:20])

        session.canvas_context = (
            f"Canvas has {len(req.elements)} elements: {counts_str}.\n"
            f"Text content found:\n{elements_str}" if elements_str
            else f"Canvas has {len(req.elements)} elements: {counts_str}. No text content."
        )
    else:
        session.canvas_context = "Canvas is empty."

    return {"status": "ok", "context_length": len(session.canvas_context)}


@app.post("/chat/clear")
async def clear_session(req: ClearRequest):
    """Clear conversation history for a session."""
    if req.session_id in sessions:
        sessions[req.session_id].messages.clear()
        return {"status": "ok", "message": "Session cleared"}
    return {"status": "ok", "message": "Session not found (already clean)"}


@app.delete("/chat/session/{session_id}")
async def delete_session(session_id: str):
    """Delete an entire session."""
    sessions.pop(session_id, None)
    return {"status": "ok"}


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print(f"[Canvas AI] Chat Service v2 starting on port {CHAT_PORT}")
    print(f"   Chat Model: {CHAT_MODEL}")
    print(f"   Canvas actions: LangChain structured output")
    uvicorn.run(app, host="0.0.0.0", port=CHAT_PORT)
