"""
routes/tools_chat.py — Tool-augmented chat endpoint using Groq Responses API.

Supports:
  - Built-in tools: browser_search, code_interpreter
  - Remote MCP tools: Firecrawl, custom MCP servers
  
Uses Groq's Responses API directly (not LangChain) since it natively
handles tool execution server-side.
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import Any, AsyncGenerator

import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from config import GROQ_API_KEY
from sessions import get_or_create_session
from parsers import strip_think_tags, md_to_html

router = APIRouter()

GROQ_RESPONSES_URL = "https://api.groq.com/openai/v1/responses"

# ─── Known MCP Servers ────────────────────────────────────────────────────────

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")

KNOWN_MCP_SERVERS: dict[str, dict[str, Any]] = {
    "firecrawl": {
        "server_label": "firecrawl",
        "server_description": "Web scraping and content extraction. Provide a URL to scrape.",
        "server_url_template": f"https://mcp.firecrawl.dev/{FIRECRAWL_API_KEY}/v2/mcp",
        "require_approval": "never",
        "available": bool(FIRECRAWL_API_KEY),
    },
}

# Built-in tools available for GPT-OSS models
BUILT_IN_TOOLS = {
    "browser_search": {
        "label": "Web Search",
        "description": "Search the web for current information",
        "icon": "🔍",
    },
    "code_interpreter": {
        "label": "Code Execution",
        "description": "Execute Python code for calculations and analysis",
        "icon": "💻",
    },
}


# ─── Request Schema ───────────────────────────────────────────────────────────

class ToolChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    # Built-in tools to enable (e.g. ["browser_search", "code_interpreter"])
    builtin_tools: list[str] = []
    # MCP servers to connect (e.g. ["firecrawl"])
    mcp_servers: list[str] = []
    # Custom MCP servers (user-defined)
    custom_mcp: list[dict[str, Any]] = []


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/chat/available-tools")
async def list_available_tools():
    """List all available tools and MCP servers."""
    mcp_list = []
    for key, server in KNOWN_MCP_SERVERS.items():
        mcp_list.append({
            "id": key,
            "label": server["server_label"],
            "description": server["server_description"],
            "available": server["available"],
        })

    return {
        "builtin_tools": [
            {"id": k, **v} for k, v in BUILT_IN_TOOLS.items()
        ],
        "mcp_servers": mcp_list,
        "model": "openai/gpt-oss-120b",
    }


def _sse_event(data: dict) -> str:
    return f"data: {json.dumps(data, separators=(',', ':'))}\n\n"


@router.post("/chat/tools")
async def tools_chat(req: ToolChatRequest):
    """Chat with Groq tools (built-in + MCP).
    
    Uses Groq's Responses API for MCP, Chat Completions API for built-in tools.
    Falls back to regular chat if no tools are enabled.
    """
    session = get_or_create_session(req.session_id)
    session_id = session.session_id

    # Build tools array
    tools: list[dict[str, Any]] = []

    # Add built-in tools
    for tool_id in req.builtin_tools:
        if tool_id in BUILT_IN_TOOLS:
            tools.append({"type": tool_id})

    # Add known MCP servers
    for server_id in req.mcp_servers:
        server = KNOWN_MCP_SERVERS.get(server_id)
        if server and server["available"]:
            tools.append({
                "type": "mcp",
                "server_label": server["server_label"],
                "server_description": server["server_description"],
                "server_url": server["server_url_template"],
                "require_approval": server["require_approval"],
            })

    # Add custom MCP servers
    for custom in req.custom_mcp:
        tools.append({
            "type": "mcp",
            "server_label": custom.get("label", "custom"),
            "server_url": custom.get("url", ""),
            "server_description": custom.get("description", ""),
            "require_approval": custom.get("require_approval", "never"),
        })

    has_mcp = any(t.get("type") == "mcp" for t in tools)

    async def generate() -> AsyncGenerator[str, None]:
        yield ": heartbeat\n\n"

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                headers = {
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                }

                if has_mcp:
                    # Use Responses API for MCP tools
                    payload: dict[str, Any] = {
                        "model": "openai/gpt-oss-120b",
                        "input": [
                            {"type": "message", "role": "user", "content": req.message}
                        ],
                        "tools": tools,
                        "stream": False,
                    }
                    
                    yield _sse_event({"type": "token", "token": "🔧 Using tools... ", "done": False})

                    resp = await client.post(
                        GROQ_RESPONSES_URL,
                        headers=headers,
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()

                    # Parse Responses API output
                    final_text = ""
                    tool_calls: list[dict] = []

                    for item in data.get("output", []):
                        item_type = item.get("type")

                        if item_type == "mcp_list_tools":
                            tool_names = [t.get("name", "?") for t in item.get("tools", [])]
                            yield _sse_event({
                                "type": "tool_info",
                                "server": item.get("server_label", ""),
                                "tools": tool_names[:10],
                            })

                        elif item_type == "mcp_call":
                            tool_calls.append({
                                "server": item.get("server_label", ""),
                                "name": item.get("name", ""),
                                "arguments": item.get("arguments", ""),
                            })
                            yield _sse_event({
                                "type": "tool_call",
                                "server": item.get("server_label", ""),
                                "tool": item.get("name", ""),
                            })

                        elif item_type == "message":
                            content = item.get("content", [])
                            for c in content:
                                if c.get("type") == "output_text":
                                    final_text += c.get("text", "")

                    # Stream the final text
                    if final_text:
                        clean = strip_think_tags(final_text)
                        # Send in chunks for streaming feel
                        chunk_size = 80
                        for i in range(0, len(clean), chunk_size):
                            yield _sse_event({
                                "type": "token",
                                "token": clean[i:i+chunk_size],
                                "done": False,
                            })
                            await asyncio.sleep(0.02)

                        html = md_to_html(clean)
                        # Save to session history
                        from langchain_core.messages import HumanMessage, AIMessage
                        session.messages.append(HumanMessage(content=req.message))
                        session.messages.append(AIMessage(content=clean))
                        session.trim_history()

                        yield _sse_event({
                            "type": "done",
                            "token": "",
                            "done": True,
                            "html": html,
                            "session_id": session_id,
                            "tool_calls": tool_calls,
                        })
                    else:
                        yield _sse_event({
                            "type": "done",
                            "token": "",
                            "done": True,
                            "html": "<p>No response from tools.</p>",
                            "session_id": session_id,
                        })

                else:
                    # Use Chat Completions API for built-in tools only
                    payload = {
                        "model": "openai/gpt-oss-120b",
                        "messages": [
                            {"role": "user", "content": req.message}
                        ],
                        "stream": False,
                    }
                    if tools:
                        payload["tools"] = tools

                    yield _sse_event({"type": "token", "token": "🔧 Searching... ", "done": False})

                    resp = await client.post(
                        "https://api.groq.com/openai/v1/chat/completions",
                        headers=headers,
                        json=payload,
                    )
                    resp.raise_for_status()
                    data = resp.json()

                    content = data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    clean = strip_think_tags(content)

                    # Extract executed_tools info
                    executed = data.get("choices", [{}])[0].get("message", {}).get("executed_tools", [])
                    for et in executed:
                        yield _sse_event({
                            "type": "tool_call",
                            "server": "groq-builtin",
                            "tool": et.get("type", "unknown"),
                        })

                    chunk_size = 80
                    for i in range(0, len(clean), chunk_size):
                        yield _sse_event({
                            "type": "token",
                            "token": clean[i:i+chunk_size],
                            "done": False,
                        })
                        await asyncio.sleep(0.02)

                    html = md_to_html(clean)
                    from langchain_core.messages import HumanMessage, AIMessage
                    session.messages.append(HumanMessage(content=req.message))
                    session.messages.append(AIMessage(content=clean))
                    session.trim_history()

                    yield _sse_event({
                        "type": "done",
                        "token": "",
                        "done": True,
                        "html": html,
                        "session_id": session_id,
                    })

        except httpx.HTTPStatusError as e:
            error_body = e.response.text[:300] if e.response else str(e)
            print(f"[ToolChat] HTTP error: {e.response.status_code} - {error_body}")
            yield _sse_event({
                "type": "error",
                "token": "",
                "done": True,
                "error": f"Groq API error ({e.response.status_code}): {error_body}",
                "session_id": session_id,
            })
        except Exception as e:
            print(f"[ToolChat] Error: {e}")
            yield _sse_event({
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
        },
    )
