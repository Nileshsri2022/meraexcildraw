"""
routes/tools_chat.py — Tool-augmented chat endpoint.

Two modes:
  1. Built-in tools  → groq/compound-mini  (compound_custom.tools.enabled_tools)
  2. Remote MCP tools → openai/gpt-oss-120b via Groq Responses API (/openai/v1/responses)

Uses the Responses API for MCP (official Groq MCP gateway).
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
GROQ_RESPONSES_URL = "https://api.groq.com/openai/v1/responses"

# ─── Models ───────────────────────────────────────────────────────────────────
# compound-mini for built-in tools (web_search, code_interpreter, etc.)
# openai/gpt-oss-120b for MCP (required by Groq Responses API for remote MCP)
COMPOUND_MODEL = "groq/compound-mini"
MCP_MODEL = "openai/gpt-oss-120b"

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
    """Test if an MCP server is reachable using Groq's Responses API (official MCP gateway)."""
    if not GROQ_API_KEY:
        return {"ok": False, "error": "GROQ_API_KEY not set"}

    try:
        async with httpx.AsyncClient(timeout=45) as client:
            server_url = _format_mcp_url(req.url, req.headers)

            # Build MCP tool definition — key goes in URL path, NOT in headers
            tool_def: dict[str, Any] = {
                "type": "mcp",
                "server_label": req.label,
                "server_url": server_url,
                "require_approval": "never",
            }

            # Only add headers if there's no API key already in the URL path
            api_key = req.headers.get("Authorization", "").replace("Bearer ", "").strip() if req.headers else ""
            if api_key and api_key not in server_url:
                tool_def["headers"] = {"Authorization": f"Bearer {api_key}"}

            # Use the Responses API (official Groq MCP gateway)
            payload = {
                "model": MCP_MODEL,
                "input": "List available tools.",
                "tools": [tool_def],
                "stream": False,
            }

            print(f"[MCP] (Responses API) Testing connection with URL: {server_url}")
            print(f"[MCP] Payload sent to Groq: {json.dumps(payload, indent=2)}")

            resp = await client.post(
                GROQ_RESPONSES_URL,
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
                data = resp.json()
                # Check if tools were discovered
                output = data.get("output", [])
                tool_list = [o for o in output if o.get("type") == "mcp_list_tools"]
                if tool_list:
                    tools = tool_list[0].get("tools", [])
                    print(f"[MCP] Discovered {len(tools)} tools: {[t.get('name') for t in tools]}")
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

            body = resp.text[:200]
            return {"ok": False, "error": body, "status": resp.status_code}

    except Exception as e:
        return {"ok": False, "error": str(e)}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _format_mcp_url(url: str, headers: dict[str, str]) -> str:
    """Format MCP URL per Groq's official docs. Key goes in URL path for Firecrawl."""
    api_key = headers.get("Authorization", "").replace("Bearer ", "").strip()
    formatted_url = url
    
    # Standard template replacement
    if api_key and "<APIKEY>" in formatted_url:
        formatted_url = formatted_url.replace("<APIKEY>", api_key)
    
    # Official Firecrawl format: https://mcp.firecrawl.dev/<KEY>/v2/mcp
    # Per Groq docs: key goes in URL path, no Authorization header needed
    if "firecrawl.dev" in formatted_url and api_key and api_key not in formatted_url:
        formatted_url = f"https://mcp.firecrawl.dev/{api_key}/v2/mcp"
    
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
    """Execute an MCP tool call via Groq Responses API (official MCP gateway)."""
    tools: list[dict[str, Any]] = []
    for srv in mcp_servers:
        server_url = _format_mcp_url(srv.url, srv.headers)
        
        # Extract API key
        api_key = ""
        if srv.headers and "Authorization" in srv.headers:
            api_key = srv.headers["Authorization"].replace("Bearer ", "").strip()

        tool_def: dict[str, Any] = {
            "type": "mcp",
            "server_label": srv.label,
            "server_url": server_url,
            "require_approval": srv.require_approval,
        }
        
        # Only add headers if key is NOT already in URL path
        if api_key and api_key not in server_url:
            tool_def["headers"] = {"Authorization": f"Bearer {api_key}"}
            
        if srv.description:
            tool_def["server_description"] = srv.description
        
        tools.append(tool_def)

    payload = {
        "model": MCP_MODEL,
        "input": message,
        "tools": tools,
        "stream": False,
    }
    print(f"[MCP] (Responses API) Calling tools for: {message[:50]}...")
    print(f"[MCP] Tools payload: {json.dumps(payload, indent=2)}")

    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    resp = await client.post(GROQ_RESPONSES_URL, headers=headers, json=payload)
    
    print(f"[MCP] Tool call response status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"[MCP] Tool call error: {resp.text}")

    resp.raise_for_status()
    return resp.json()


@router.post("/chat/tools")
async def tools_chat(req: ToolChatRequest):
    """Chat with tools.

    Built-in tools → groq/compound-mini (compound_custom)
    MCP servers    → openai/gpt-oss-120b via Groq Responses API
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
                    # ── Route 2: Responses API for MCP tools ──
                    labels = ", ".join(s.label for s in req.mcp_servers)
                    yield _sse({"type": "token", "token": f"🔌 Connecting to {labels}...\n", "done": False})

                    data = await _call_mcp_tools(client, req.message, req.mcp_servers)

                    # Responses API returns { output: [ {type: "mcp_list_tools"}, {type: "mcp_call"}, {type: "message"} ] }
                    output_items = data.get("output", [])
                    content = ""

                    for item in output_items:
                        item_type = item.get("type", "")

                        if item_type == "mcp_list_tools":
                            tools = item.get("tools", [])
                            tool_names = [t.get("name", "?") for t in tools]
                            print(f"[MCP] Discovered tools: {tool_names}")
                            yield _sse({"type": "token", "token": f"📋 Found {len(tools)} tools\n", "done": False})

                        elif item_type == "mcp_call":
                            tool_name = item.get("name", "unknown")
                            yield _sse({
                                "type": "tool_call",
                                "server": item.get("server_label", "mcp"),
                                "tool": tool_name,
                            })
                            yield _sse({"type": "token", "token": f"⚡ Called `{tool_name}`\n", "done": False})

                        elif item_type == "message":
                            # Extract the final text from the assistant message
                            msg_content = item.get("content", [])
                            for part in msg_content:
                                if part.get("type") == "output_text":
                                    content += part.get("text", "")

                    # If no content from output items, try fallback formats
                    if not content:
                        # Fallback: Chat Completions format (in case model changes)
                        msg = data.get("choices", [{}])[0].get("message", {})
                        content = msg.get("content", "") or ""

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
