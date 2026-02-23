"""
parsers.py — Text processing utilities (think-tag stripping, markdown, JSON).
"""
from __future__ import annotations

import json
import re
from functools import lru_cache

import markdown as md

from models import CanvasElement

# ─── Compiled Regexes ─────────────────────────────────────────────────────────

_THINK_PATTERN = re.compile(r"<think>[\s\S]*?</think>", re.IGNORECASE)
_FENCE_OPEN = re.compile(r"^```(?:json)?\s*\n?", re.MULTILINE)
_FENCE_CLOSE = re.compile(r"\n?```\s*$", re.MULTILINE)

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
