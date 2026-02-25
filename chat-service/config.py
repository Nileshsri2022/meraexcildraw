"""
config.py — Environment variables and LLM initialization.

Centralizes all configuration so that other modules import from here
rather than reading os.getenv() ad-hoc.
"""
from __future__ import annotations

import os
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

load_dotenv()

# ─── Environment Variables ────────────────────────────────────────────────────

OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
CHAT_MODEL_PRIMARY: str = os.getenv("CHAT_MODEL_PRIMARY", "llama-3.3-70b-versatile")
CHAT_MODEL_FALLBACK: str = os.getenv("CHAT_MODEL_FALLBACK", "arcee-ai/trinity-large-preview:free")
CHAT_MODEL_VISION: str = os.getenv("CHAT_MODEL_VISION", "llama-3.2-11b-vision-preview")
CHAT_MODEL_VISION_FALLBACK: str = os.getenv("CHAT_MODEL_VISION_FALLBACK", "openai/gpt-4o-mini")
CHAT_PORT: int = int(os.getenv("CHAT_PORT", "3003"))
MAX_HISTORY_MESSAGES: int = int(os.getenv("MAX_HISTORY_MESSAGES", "20"))
SESSION_TTL_HOURS: int = int(os.getenv("SESSION_TTL_HOURS", "24"))

if not GROQ_API_KEY and not OPENROUTER_API_KEY:
    raise ValueError("Either GROQ_API_KEY or OPENROUTER_API_KEY is required. Set in .env")

# ─── LLMs: Groq (primary) + OpenRouter (fallback) ────────────────────────────
#
# Primary: Groq with llama-3.3-70b-versatile (fast, free)
# Fallback: OpenRouter with arcee-ai/trinity-large-preview:free
# Both use ChatOpenAI since they expose OpenAI-compatible APIs.

# Primary LLM — Groq
chat_llm = ChatOpenAI(
    model=CHAT_MODEL_PRIMARY,
    api_key=GROQ_API_KEY or "unused",
    base_url="https://api.groq.com/openai/v1",
    temperature=0.8,
    max_tokens=4096,
    streaming=True,
) if GROQ_API_KEY else None

canvas_llm = ChatOpenAI(
    model=CHAT_MODEL_PRIMARY,
    api_key=GROQ_API_KEY or "unused",
    base_url="https://api.groq.com/openai/v1",
    temperature=0.2,
    max_tokens=4096,
    streaming=False,
) if GROQ_API_KEY else None

# Fallback LLM — OpenRouter
fallback_chat_llm = ChatOpenAI(
    model=CHAT_MODEL_FALLBACK,
    api_key=OPENROUTER_API_KEY or "unused",
    base_url="https://openrouter.ai/api/v1",
    temperature=0.8,
    max_tokens=4096,
    streaming=True,
    extra_body={"reasoning": {"enabled": True}},
) if OPENROUTER_API_KEY else None

fallback_canvas_llm = ChatOpenAI(
    model=CHAT_MODEL_FALLBACK,
    api_key=OPENROUTER_API_KEY or "unused",
    base_url="https://openrouter.ai/api/v1",
    temperature=0.2,
    max_tokens=4096,
    streaming=False,
    extra_body={"reasoning": {"enabled": True}},
) if OPENROUTER_API_KEY else None

# Vision LLMs
vision_llm = ChatOpenAI(
    model=CHAT_MODEL_VISION,
    api_key=GROQ_API_KEY or "unused",
    base_url="https://api.groq.com/openai/v1",
    temperature=0.4,
    max_tokens=2048,
    streaming=True,
) if GROQ_API_KEY else None

fallback_vision_llm = ChatOpenAI(
    model=CHAT_MODEL_VISION_FALLBACK,
    api_key=OPENROUTER_API_KEY or "unused",
    base_url="https://openrouter.ai/api/v1",
    temperature=0.4,
    max_tokens=2048,
    streaming=True,
) if OPENROUTER_API_KEY else None

# Use primary if available, otherwise fallback
if chat_llm is None:
    chat_llm = fallback_chat_llm
if canvas_llm is None:
    canvas_llm = fallback_canvas_llm
if vision_llm is None:
    vision_llm = fallback_vision_llm
