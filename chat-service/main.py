"""
AI Canvas Chat Assistant — Python Microservice

A streaming chatbot powered by MiniMax M2.1 via NVIDIA AI Endpoints.
Understands the whiteboard canvas context and helps users create,
modify, and analyze their diagrams and drawings.

Endpoints:
    POST /chat          — Streaming SSE chat
    POST /chat/context  — Update canvas context (elements on board)
    GET  /health        — Health check
"""

import os
import re
import json
import uuid
import asyncio
from typing import AsyncGenerator
from datetime import datetime

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import markdown as md

load_dotenv()

# ─── Markdown → HTML converter ────────────────────────────────────────────────

MD_EXTENSIONS = ["fenced_code", "tables", "nl2br", "sane_lists", "smarty"]

# Regex to match <think>...</think> blocks (including multiline)
THINK_PATTERN = re.compile(r"<think>.*?</think>", re.DOTALL)

def strip_think_tags(text: str) -> str:
    """Remove <think>...</think> reasoning blocks from model output."""
    cleaned = THINK_PATTERN.sub("", text)
    return cleaned.lstrip("\n")

def md_to_html(text: str) -> str:
    """Convert LLM markdown response to clean HTML for the frontend."""
    return md.markdown(text, extensions=MD_EXTENSIONS)

# ─── Configuration ────────────────────────────────────────────────────────────

NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
CHAT_MODEL = os.getenv("CHAT_MODEL", "minimaxai/minimax-m2.1")
CHAT_PORT = int(os.getenv("CHAT_PORT", "3003"))

if not NVIDIA_API_KEY:
    raise ValueError("NVIDIA_API_KEY is required. Set it in .env")

# ─── LangChain Client ────────────────────────────────────────────────────────

llm = ChatNVIDIA(
    model=CHAT_MODEL,
    api_key=NVIDIA_API_KEY,
    temperature=0.8,
    top_p=0.95,
    max_completion_tokens=4096,
)

# ─── Canvas-Aware System Prompt ───────────────────────────────────────────────

SYSTEM_PROMPT = """You are **Canvas AI**, an intelligent assistant embedded in a collaborative whiteboard application (Excalidraw-based).

## Your Capabilities
- Help users brainstorm, plan, and organize ideas on their whiteboard
- Suggest diagram structures (flowcharts, mind maps, class diagrams, sequence diagrams)
- Provide Mermaid code that can be rendered on the canvas
- Analyze the current canvas content and provide insights
- Help with writing, editing, and refining text on the board
- Explain concepts, provide code snippets, and answer questions
- Suggest visual improvements and layout optimizations

## Response Guidelines
1. **Be concise** — Users are working visually. Keep responses focused and actionable.
2. **Use formatting** — Use markdown with headers, lists, and code blocks.
3. **Mermaid diagrams** — When suggesting diagrams, provide Mermaid code in ```mermaid blocks so it can be rendered directly.
4. **Canvas awareness** — When canvas context is provided, reference specific elements the user has drawn.
5. **Proactive suggestions** — If you notice improvements, suggest them naturally.
6. **Friendly tone** — Be a collaborative partner, not a formal assistant.

## Current Canvas Context
{canvas_context}
"""

# ─── In-Memory Session Storage ────────────────────────────────────────────────

class Session:
    """Chat session with conversation history and canvas context."""

    def __init__(self):
        self.messages: list = []
        self.canvas_context: str = "No canvas elements loaded yet."
        self.created_at: str = datetime.now().isoformat()

    def get_system_message(self) -> SystemMessage:
        return SystemMessage(
            content=SYSTEM_PROMPT.format(canvas_context=self.canvas_context)
        )

    def get_langchain_messages(self) -> list:
        """Build the full message list for the LLM."""
        result = [self.get_system_message()]
        # Keep last 20 messages to avoid context overflow
        recent = self.messages[-20:]
        result.extend(recent)
        return result


# Session store: session_id -> Session
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
    version="1.0.0",
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
    Each chunk is a JSON object: { "token": "...", "done": false }
    Final chunk: { "token": "", "done": true, "session_id": "..." }
    """
    session_id, session = get_or_create_session(req.session_id)

    # Add user message to history
    session.messages.append(HumanMessage(content=req.message))

    # Build messages for LLM
    messages = session.get_langchain_messages()

    async def generate() -> AsyncGenerator[str, None]:
        full_response = ""
        inside_think = False

        try:
            # Stream from LangChain
            for chunk in llm.stream(messages):
                token = chunk.content
                if token:
                    full_response += token

                    # --- Filter out <think>...</think> tokens during stream ---
                    if "<think>" in token:
                        inside_think = True
                    if inside_think:
                        if "</think>" in token:
                            inside_think = False
                            # There might be useful text after </think>
                            after = token.split("</think>", 1)[1]
                            if after.strip():
                                data = json.dumps({"token": after, "done": False})
                                yield f"data: {data}\n\n"
                        continue  # skip this token entirely (it's thinking)

                    data = json.dumps({"token": token, "done": False})
                    yield f"data: {data}\n\n"

            # Strip think tags from full response before saving & converting
            clean_response = strip_think_tags(full_response)

            # Save assistant response to history
            session.messages.append(AIMessage(content=clean_response))

            # Convert clean response from markdown to HTML
            html = md_to_html(clean_response)

            # Send final event with rendered HTML
            done_data = json.dumps({
                "token": "",
                "done": True,
                "html": html,
                "session_id": session_id,
            })
            yield f"data: {done_data}\n\n"

        except Exception as e:
            error_data = json.dumps({
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
        # Build a concise summary of canvas elements
        summary_parts = []
        type_counts: dict[str, int] = {}

        for el in req.elements[:50]:  # Limit to 50 elements
            el_type = el.get("type", "unknown")
            type_counts[el_type] = type_counts.get(el_type, 0) + 1

            # Extract meaningful text content
            text = el.get("text", "").strip()
            if text and len(text) < 200:
                summary_parts.append(f'- {el_type}: "{text}"')

        counts_str = ", ".join(f"{count} {t}(s)" for t, count in type_counts.items())
        elements_str = "\n".join(summary_parts[:20])  # Max 20 text elements

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
    print(f"[Canvas AI] Chat Service starting on port {CHAT_PORT}")
    print(f"   Model: {CHAT_MODEL}")
    uvicorn.run(app, host="0.0.0.0", port=CHAT_PORT)
