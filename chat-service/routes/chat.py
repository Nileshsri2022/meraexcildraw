"""
routes/chat.py — Streaming chat endpoint (SSE).
"""
from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncGenerator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage

from models import ChatRequest
from sessions import get_or_create_session
from parsers import strip_think_tags, md_to_html, parse_canvas_json
from tools import detect_tool_intent
from prompts import chat_chain, canvas_chain, vision_chain

router = APIRouter()


def _sse_event(data: dict) -> str:
    """Format a dict as an SSE data line. Single allocation per event."""
    return f"data: {json.dumps(data, separators=(',', ':'))}\n\n"


@router.post("/chat")
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
    session = get_or_create_session(req.session_id)
    session_id = session.session_id

    # Build chain input
    chain_input = session.get_chain_input(req.message, req.image_data)

    # Detect which AI tool (if any) should handle this message
    tool_intent = detect_tool_intent(req.message)

    async def generate() -> AsyncGenerator[str, None]:
        """SSE generator — yields data lines for each event.

        Performance notes:
        - Uses local references to avoid global/attribute lookups in hot loop
        - Generator-based (constant memory regardless of response length)
        - Pre-formats SSE events with compact JSON separators
        """
        _strip_think = strip_think_tags
        _sse = _sse_event

        full_response_parts: list[str] = []
        reasoning_details_accum: list[str] = []
        inside_think = False
        chunks_yielded = 0

        try:
            yield ": heartbeat\n\n"

            print(f"[Chat] Starting LLM stream for session {session_id}")

            async with asyncio.timeout(90):
                chain_to_use = vision_chain if req.image_data else chat_chain
                async for chunk in chain_to_use.astream(chain_input):
                    rd = chunk.additional_kwargs.get("reasoning_details") or getattr(chunk, "reasoning_details", None)
                    if rd:
                        reasoning_details_accum.append(str(rd))

                    token = chunk.content if hasattr(chunk, "content") else str(chunk)
                    if not token:
                        continue

                    full_response_parts.append(token)

                    # Filter <think>...</think> blocks during streaming
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
                            chunks_yielded += 1
                            if chunks_yielded % 10 == 0:
                                yield ": keepalive\n\n"
                        continue

                    yield _sse({"type": "token", "token": token, "done": False})

            print(f"[Chat] LLM stream completed, {len(full_response_parts)} chunks")

            # Assemble full response
            full_response = "".join(full_response_parts)
            clean_response = _strip_think(full_response)

            final_reasoning = "".join(reasoning_details_accum)

            ai_msg = AIMessage(content=clean_response)
            if final_reasoning:
                ai_msg.additional_kwargs["reasoning_details"] = final_reasoning

            session.messages.append(ai_msg)
            session.trim_history()

            html = md_to_html(clean_response)

            yield _sse({
                "type": "done",
                "token": "",
                "done": True,
                "html": html,
                "session_id": session_id,
            })

            # Phase 2: Route to AI tool or canvas_chain
            if tool_intent:
                tool_name = tool_intent["tool"]
                print(f"[Chat] Tool intent detected: {tool_name}")

                if tool_name == "draw":
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
                    tool_event: dict[str, Any] = {
                        "type": "tool_action",
                        "tool": tool_name,
                        "prompt": tool_intent.get("prompt", req.message),
                    }
                    if tool_name == "diagram" and "style" in tool_intent:
                        tool_event["style"] = tool_intent["style"]
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
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Transfer-Encoding": "chunked",
        },
    )
