"""
routes/health.py — Health check, LLM test, and admin endpoints.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter

from config import CHAT_MODEL_PRIMARY, CHAT_MODEL_FALLBACK, GROQ_API_KEY, OPENROUTER_API_KEY, chat_llm
from sessions import cleanup_stale_sessions

router = APIRouter()


@router.get("/health")
async def health():
    """Health check with diagnostics."""
    from sessions import _sessions  # avoid circular import at module level
    return {
        "status": "ok",
        "primary_model": CHAT_MODEL_PRIMARY,
        "fallback_model": CHAT_MODEL_FALLBACK,
        "sessions": len(_sessions),
        "version": "5.1.0",
        "groq_key_set": bool(GROQ_API_KEY),
        "openrouter_key_set": bool(OPENROUTER_API_KEY),
    }


@router.get("/debug/test-llm")
async def test_llm():
    """Quick LLM connectivity test — 30s timeout."""
    try:
        async with asyncio.timeout(30):
            result = await chat_llm.ainvoke("Say hello in one word")
            content = result.content if hasattr(result, "content") else str(result)
            return {
                "status": "ok",
                "model": CHAT_MODEL_PRIMARY,
                "response": content[:200],
            }
    except asyncio.TimeoutError:
        return {"status": "timeout", "model": CHAT_MODEL_PRIMARY, "error": "LLM did not respond within 30s"}
    except Exception as e:
        return {"status": "error", "model": CHAT_MODEL_PRIMARY, "error": str(e)}


@router.post("/admin/cleanup")
async def admin_cleanup():
    """Manual trigger for stale session cleanup."""
    from sessions import _sessions  # avoid circular import at module level
    removed = cleanup_stale_sessions()
    return {"status": "ok", "removed": removed, "remaining": len(_sessions)}
