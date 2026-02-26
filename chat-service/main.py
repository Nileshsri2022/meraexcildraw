"""
AI Canvas Chat Assistant — Python Microservice  (v5.1)

A streaming chatbot powered by Groq/OpenRouter LLMs via LangChain.

Modular structure:
    config.py     — Environment variables and LLM initialization
    models.py     — Pydantic request/response schemas
    parsers.py    — Text processing (think-tags, markdown, JSON)
    prompts.py    — LangChain prompt templates and LCEL chains
    sessions.py   — In-memory session management
    tools.py      — AI tool intent detection and routing
    routes/       — FastAPI endpoint modules:
        chat.py   — /chat SSE streaming endpoint
        canvas.py — /chat/context, /chat/clear, /chat/session/*
        health.py — /health, /debug/test-llm, /admin/cleanup

Endpoints:
    POST /chat              — Streaming chat (SSE)
    POST /chat/context      — Update canvas state for AI awareness
    POST /chat/clear        — Clear session history
    DELETE /chat/session/:id — Delete session
    GET  /health            — Service health check
    GET  /debug/test-llm    — LLM connectivity test
    POST /admin/cleanup     — Purge stale sessions
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import os
from config import CHAT_MODEL_PRIMARY, CHAT_MODEL_FALLBACK, CHAT_PORT, GROQ_API_KEY, OPENROUTER_API_KEY

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


# ─── FastAPI App ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup + shutdown hooks."""
    print(f"[Boot] Canvas AI Chat Service v5.1")
    print(f"[Boot] Primary: Groq ({CHAT_MODEL_PRIMARY})")
    print(f"[Boot] Fallback: OpenRouter ({CHAT_MODEL_FALLBACK})")
    print(f"[Boot] Groq key: {'set' if GROQ_API_KEY else 'MISSING'}")
    print(f"[Boot] OpenRouter key: {'set' if OPENROUTER_API_KEY else 'MISSING'}")
    yield
    print("[Shutdown] Canvas AI Chat Service stopped")


app = FastAPI(
    title="Canvas AI Chat Service",
    version="5.1.0",
    lifespan=lifespan,
)

# ─── CORS: restrict in production, allow all in dev ─────────────────────────
_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
ALLOWED_ORIGINS = (
    ["*"] if _raw_origins.strip() == "*"
    else [o.strip() for o in _raw_origins.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Mount Route Modules ─────────────────────────────────────────────────────

from routes.chat import router as chat_router
from routes.canvas import router as canvas_router
from routes.health import router as health_router
from routes.tools_chat import router as tools_chat_router
from routes.presentation import router as presentation_router

app.include_router(chat_router)
app.include_router(canvas_router)
app.include_router(health_router)
app.include_router(tools_chat_router)
app.include_router(presentation_router)


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=CHAT_PORT,
        reload=True,
    )
