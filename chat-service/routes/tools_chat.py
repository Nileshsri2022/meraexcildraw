"""
routes/tools_chat.py — Tool-augmented chat endpoint.

Two modes:
  1. Built-in tools  → groq/compound-mini  (compound_custom.tools.enabled_tools)
  2. Remote MCP tools → llama-3.3-70b-versatile (tools: [{type: "mcp", ...}])

Uses the same llama model as the normal chat for MCP, making it reusable.
"""
from __future__ import annotations

import asyncio
import json
import os
from typing import Any, AsyncGenerator

from langsmith import traceable
import httpx
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from config import GROQ_API_KEY
from sessions import get_or_create_session
from parsers import strip_think_tags, md_to_html

router = APIRouter()

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"

# ─── Models ───────────────────────────────────────────────────────────────────
# compound-mini for built-in tools (web_search, code_interpreter, etc.)
# llama-3.3-70b-versatile for MCP (same model as normal chat, reusable)
COMPOUND_MODEL = "groq/compound-mini"
MCP_MODEL = "llama-3.3-70b-versatile"

# ─── Built-in Tool Definitions ────────────────────────────────────────────────

BUILT_IN_TOOLS = {
    "web_search": {
        "label": "Web Search",
        "description": "Search the web for current information",
        "icon": "search",
    },
    "code_interpreter": {
        "label": "Code Execution",
        "description": "Execute Python code for calculations and analysis",
        "icon": "code",
    },
    "visit_website": {
        "label": "Visit Website",
        "description": "Visit a URL and extract its content",
        "icon": "globe",
    },
    "browser_automation": {
        "label": "Browser Automation",
        "description": "Automate browser interactions like clicking and form filling",
        "icon": "bot",
    },
    "wolfram_alpha": {
        "label": "Wolfram Alpha",
        "description": "Compute math, science, and data queries via Wolfram Alpha",
        "icon": "calculator",
    },
}


# ─── Request Schemas ──────────────────────────────────────────────────────────

class McpServerConfig(BaseModel):
    """MCP server connection configuration."""
    label: str
    url: str
    description: str = ""
    headers: dict[str, str] = {}
    require_approval: str = "never"


class ToolChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    builtin_tools: list[str] = []
    mcp_servers: list[McpServerConfig] = []
    image_data: str | None = Field(default=None, description="Base64 encoded image data")


class McpTestRequest(BaseModel):
    """Test an MCP server connection."""
    label: str
    url: str
    headers: dict[str, str] = {}


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/chat/available-tools")
async def list_available_tools():
    """List all available built-in tools."""
    return {
        "builtin_tools": [
            {"id": k, **v} for k, v in BUILT_IN_TOOLS.items()
        ],
        "compound_model": COMPOUND_MODEL,
        "mcp_model": MCP_MODEL,
    }


@router.post("/chat/test-mcp")
async def test_mcp_connection(req: McpTestRequest):
    """Test if an MCP server is reachable by making a simple tool-use request."""
    if not GROQ_API_KEY:
        return {"ok": False, "error": "GROQ_API_KEY not set"}

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            server_url = _format_mcp_url(req.url, req.headers)
            
            # Prepare headers (Groq only wants Authorization)
            tool_headers = {}
            if req.headers and "Authorization" in req.headers:
                tool_headers["Authorization"] = req.headers["Authorization"]

            payload = {
                "model": MCP_MODEL,
                "messages": [
                    {"role": "user", "content": "List available tools."}
                ],
                "tools": [
                    {
                        "type": "mcp",
                        "server_label": req.label,
                        "server_url": server_url,
                        "require_approval": "never",
                    }
                ],
                "max_tokens": 50,
            }
            if tool_headers:
                payload["tools"][0]["headers"] = tool_headers

            print(f"[MCP] Testing connection with URL: {server_url}")
            print(f"[MCP] Payload sent to Groq: {json.dumps(payload, indent=2)}")

            resp = await client.post(
                GROQ_CHAT_URL,
                headers={
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

            print(f"[MCP] Groq response status: {resp.status_code}")
            if resp.status_code != 200:
                print(f"[MCP] Groq error response: {resp.text}")

            if resp.status_code == 200:
                return {"ok": True, "status": resp.status_code}
            
            # Specific handling for Groq's MCP gateway errors
            if resp.status_code == 424:
                return {
                    "ok": False, 
                    "error": "Groq couldn't reach the MCP server. Ensure the URL is correct and the server is public.",
                    "status": 424
                }
            if resp.status_code == 401:
                return {
                    "ok": False, 
                    "error": "Invalid API Key. Check your Firecrawl/Stripe credentials.",
                    "status": 401
                }

            body = resp.text[:300]
            return {"ok": False, "error": body, "status": resp.status_code}

    except Exception as e:
        return {"ok": False, "error": str(e)}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _format_mcp_url(url: str, headers: dict[str, str]) -> str:
    """Generic template replacer + special Groq endpoint for Firecrawl."""
    api_key = headers.get("Authorization", "").replace("Bearer ", "").strip()
    formatted_url = url
    
    # Standard template replacement
    if api_key and "<APIKEY>" in formatted_url:
        formatted_url = formatted_url.replace("<APIKEY>", api_key)
    
    # Special fix for Firecrawl on Groq
    if "firecrawl.dev" in formatted_url:
        # This endpoint is specifically designed to send 'endpoint' event first
        formatted_url = "https://mcp.firecrawl.dev/groq/v2/sse"
    
    print(f"[MCP] Formatting URL: {url} -> {formatted_url}")
    return formatted_url


@traceable(name="Groq Built-in Tool Call")
async def _call_builtin_tools(client: httpx.AsyncClient, message: str, enabled: list[str]):
    """Execute a built-in tool call via groq/compound-mini."""
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
        "Groq-Model-Version": "latest",
    }
    payload: dict[str, Any] = {
        "model": COMPOUND_MODEL,
        "messages": [{"role": "user", "content": message}],
        "compound_custom": {
            "tools": {
                "enabled_tools": enabled,
            }
        },
    }
    resp = await client.post(GROQ_CHAT_URL, headers=headers, json=payload)
    resp.raise_for_status()
    return resp.json()


@traceable(name="Groq MCP Tool Call")
async def _call_mcp_tools(client: httpx.AsyncClient, message: str, mcp_servers: list[McpServerConfig]):
    """Execute an MCP tool call via llama-3.3-70b-versatile."""
    tools: list[dict[str, Any]] = []
    for srv in mcp_servers:
        server_url = _format_mcp_url(srv.url, srv.headers)
        
        # Prepare only Authorization header
        tool_headers = {}
        if srv.headers and "Authorization" in srv.headers:
            tool_headers["Authorization"] = srv.headers["Authorization"]

        tool_def: dict[str, Any] = {
            "type": "mcp",
            "server_label": srv.label,
            "server_url": server_url,
            "require_approval": srv.require_approval,
        }
        
        if tool_headers:
            tool_def["headers"] = tool_headers
            
        if srv.description:
            tool_def["server_description"] = srv.description
        
        tools.append(tool_def)

    payload = {
        "model": MCP_MODEL,
        "messages": [{"role": "user", "content": message}],
        "tools": tools,
    }
    print(f"[MCP] Calling tools for session: {message[:50]}...")
    print(f"[MCP] Tools payload: {json.dumps(payload, indent=2)}")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    resp = await client.post(GROQ_CHAT_URL, headers=headers, json=payload)
    
    print(f"[MCP] Tool call response status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"[MCP] Tool call error: {resp.text}")

    resp.raise_for_status()
    return resp.json()


@router.post("/chat/tools")
async def tools_chat(req: ToolChatRequest):
    """Chat with tools.

    Built-in tools → groq/compound-mini (compound_custom)
    MCP servers    → llama-3.3-70b-versatile (tools: [{type: "mcp"}])
    """
    session = get_or_create_session(req.session_id)
    session_id = session.session_id

    has_builtin = len(req.builtin_tools) > 0
    has_mcp = len(req.mcp_servers) > 0

    async def generate() -> AsyncGenerator[str, None]:
        yield ": heartbeat\n\n"

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                base_headers = {
                    "Authorization": f"Bearer {GROQ_API_KEY}",
                    "Content-Type": "application/json",
                }

                if has_builtin and not has_mcp:
                    # ── Route 1: compound-mini for built-in tools ──
                    enabled = [t for t in req.builtin_tools if t in BUILT_IN_TOOLS]
                    tool_names = ", ".join(enabled)
                    yield _sse({"type": "token", "token": f"🔧 Using {tool_names}...\n", "done": False})

                    data = await _call_builtin_tools(client, req.message, enabled)

                    msg = data.get("choices", [{}])[0].get("message", {})
                    content = msg.get("content", "")
                    clean = strip_think_tags(content)

                    # Report which tools were executed
                    for et in msg.get("executed_tools", []):
                        yield _sse({
                            "type": "tool_call",
                            "server": "compound",
                            "tool": et.get("type", "unknown"),
                        })

                    for chunk in _stream_text(clean):
                        yield chunk
                    yield _final_event(session, session_id, req.message, clean)

                elif has_mcp:
                    # ── Route 2: llama for MCP tools ──
                    labels = ", ".join(s.label for s in req.mcp_servers)
                    yield _sse({"type": "token", "token": f"🔌 Connecting to {labels}...\n", "done": False})

                    data = await _call_mcp_tools(client, req.message, req.mcp_servers)

                    msg = data.get("choices", [{}])[0].get("message", {})
                    content = msg.get("content", "") or ""

                    # Report tool calls if any
                    for tc in msg.get("tool_calls", []):
                        fn = tc.get("function", {})
                        yield _sse({
                            "type": "tool_call",
                            "server": "mcp",
                            "tool": fn.get("name", "unknown"),
                        })

                    clean = strip_think_tags(content)
                    for chunk in _stream_text(clean):
                        yield chunk
                    yield _final_event(session, session_id, req.message, clean)

                else:
                    # No tools — should not reach here, but handle gracefully
                    yield _sse({
                        "type": "error",
                        "error": "No tools selected. Use the regular chat endpoint.",
                        "done": True,
                        "session_id": session_id,
                    })

        except httpx.HTTPStatusError as e:
            body = e.response.text[:400] if e.response else str(e)
            print(f"[ToolChat] HTTP {e.response.status_code}: {body}")
            yield _sse({
                "type": "error",
                "error": f"Groq API error ({e.response.status_code}): {body}",
                "done": True,
                "session_id": session_id,
            })
        except Exception as e:
            print(f"[ToolChat] Error: {e}")
            yield _sse({
                "type": "error",
                "error": str(e),
                "done": True,
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


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _stream_text(text: str):
    """Yield text in chunks for a streaming feel."""
    chunk_size = 80
    for i in range(0, len(text), chunk_size):
        yield _sse({
            "type": "token",
            "token": text[i:i+chunk_size],
            "done": False,
        })


def _final_event(session, session_id: str, user_msg: str, clean: str) -> str:
    """Build the final 'done' SSE event and save to session history."""
    html = md_to_html(clean)
    from langchain_core.messages import HumanMessage, AIMessage
    session.messages.append(HumanMessage(content=user_msg))
    session.messages.append(AIMessage(content=clean))
    session.trim_history()

    return _sse({
        "type": "done",
        "token": "",
        "done": True,
        "html": html,
        "session_id": session_id,
    })
