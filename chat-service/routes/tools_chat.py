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
from mcp_client import list_tools, call_tool, mcp_tools_to_openai_functions, MCP_TIMEOUT

router = APIRouter()


def _sse(data: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(data, separators=(',', ':'))}\n\n"

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

            # Forward any auth headers to the MCP server via Groq
            # Supports: Authorization (Bearer), x-api-key, etc.
            if req.headers:
                # Filter out content-type, only keep auth-related headers
                tool_headers = {k: v for k, v in req.headers.items() 
                               if k.lower() not in ("content-type",)}
                # Don't send headers if the API key is already in the URL path
                api_key_vals = [v.replace("Bearer ", "").strip() for v in tool_headers.values()]
                if not any(val in server_url for val in api_key_vals if val):
                    tool_def["headers"] = tool_headers

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


@traceable(name="Direct MCP Tool Call")
async def _call_mcp_direct(client: httpx.AsyncClient, message: str, mcp_servers: list[McpServerConfig], emit_sse):
    """Execute MCP tool calls via direct connection (bypasses Groq's MCP gateway).
    
    Flow:
      1. Connect directly to each MCP server and list available tools
      2. Convert to OpenAI function-calling format and send to Groq
      3. When Groq picks a tool, execute it directly on the MCP server
      4. Send the result back to Groq for formatting
    """

    # ── Step 1: List tools from all MCP servers ──
    all_tools: list[dict] = []
    tool_server_map: dict[str, tuple[str, dict | None]] = {}  # tool_name → (server_url, headers)

    for srv in mcp_servers:
        server_url = _format_mcp_url(srv.url, srv.headers)
        # Build headers for direct connection
        srv_headers = None
        if srv.headers:
            srv_headers = {k: v for k, v in srv.headers.items()
                         if k.lower() not in ("content-type",)}
            # Don't send headers if key is already in URL
            api_key_vals = [v.replace("Bearer ", "").strip() for v in srv_headers.values()]
            if any(val in server_url for val in api_key_vals if val):
                srv_headers = None

        try:
            tools = await list_tools(client, server_url, srv_headers)
            yield _sse({"type": "token", "token": f"📋 Found {len(tools)} tools from {srv.label}\n", "done": False})
            
            # Convert and map tools to their server
            openai_fns = mcp_tools_to_openai_functions(tools)
            for fn in openai_fns:
                fn_name = fn["function"]["name"]
                tool_server_map[fn_name] = (server_url, srv_headers)
            all_tools.extend(openai_fns)
        except Exception as e:
            print(f"[MCP-Direct] Failed to list tools from {srv.label}: {e}")
            yield _sse({"type": "token", "token": f"⚠️ Could not reach {srv.label}: {str(e)[:100]}\n", "done": False})

    if not all_tools:
        yield _sse({"type": "error", "error": "No tools discovered from MCP servers.", "done": True})
        return

    # ── Step 2: Ask Groq to pick the right tool ──
    groq_headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    # Use a model that supports function calling 
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant with access to external tools. Use the provided tools to answer the user's request. Always call a tool when available and relevant."},
            {"role": "user", "content": message},
        ],
        "tools": all_tools,
        "tool_choice": "auto",
        "temperature": 0.2,
    }

    print(f"[MCP-Direct] Asking Groq to pick tool for: {message[:60]}...")
    resp = await client.post(GROQ_CHAT_URL, headers=groq_headers, json=payload)
    resp.raise_for_status()
    data = resp.json()

    choice = data.get("choices", [{}])[0]
    msg = choice.get("message", {})
    tool_calls = msg.get("tool_calls", [])

    # If Groq responded with text (no tool call needed)
    if not tool_calls:
        content = msg.get("content", "")
        yield {"__content__": content or "I couldn't determine which tool to use for your request."}
        return

    # ── Step 3: Execute tool calls directly on MCP servers ──
    tool_results = []
    for tc in tool_calls:
        fn = tc.get("function", {})
        tool_name = fn.get("name", "unknown")
        try:
            arguments = json.loads(fn.get("arguments", "{}"))
        except json.JSONDecodeError:
            arguments = {}

        yield _sse({
            "type": "tool_call",
            "server": "mcp",
            "tool": tool_name,
        })
        yield _sse({"type": "token", "token": f"⚡ Calling `{tool_name}`...\n", "done": False})

        # Find which server has this tool
        server_url, srv_headers = tool_server_map.get(tool_name, (None, None))
        if not server_url:
            tool_results.append({
                "tool_call_id": tc.get("id", ""),
                "role": "tool",
                "content": f"Error: tool '{tool_name}' not found on any MCP server.",
            })
            continue

        try:
            # Direct call with generous timeout — no Groq gateway limit!
            result_text = await call_tool(client, server_url, srv_headers, tool_name, arguments)
            tool_results.append({
                "tool_call_id": tc.get("id", ""),
                "role": "tool",
                "content": result_text[:8000],  # Limit to avoid token overflow
            })
            yield _sse({"type": "token", "token": f"✅ Got result from `{tool_name}`\n", "done": False})
        except Exception as e:
            error_msg = str(e)[:300]
            print(f"[MCP-Direct] Tool call '{tool_name}' failed: {error_msg}")
            tool_results.append({
                "tool_call_id": tc.get("id", ""),
                "role": "tool",
                "content": f"Error calling {tool_name}: {error_msg}",
            })
            yield _sse({"type": "token", "token": f"⚠️ Error from `{tool_name}`: {error_msg[:80]}\n", "done": False})

    # ── Step 4: Send results back to Groq for formatting ──
    format_payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant. Format the tool results into a clear, readable response for the user. Use markdown formatting when appropriate."},
            {"role": "user", "content": message},
            msg,  # The assistant's tool_call message
            *tool_results,
        ],
        "temperature": 0.3,
    }

    yield _sse({"type": "token", "token": "📝 Formatting response...\n", "done": False})
    
    format_resp = await client.post(GROQ_CHAT_URL, headers=groq_headers, json=format_payload)
    format_resp.raise_for_status()
    format_data = format_resp.json()

    content = format_data.get("choices", [{}])[0].get("message", {}).get("content", "")
    yield {"__content__": content}


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
                    # ── Route 2: Direct MCP client (no Groq gateway timeout) ──
                    labels = ", ".join(s.label for s in req.mcp_servers)
                    yield _sse({"type": "token", "token": f"🔌 Connecting to {labels}...\n", "done": False})

                    content = ""
                    async for event in _call_mcp_direct(client, req.message, req.mcp_servers, _sse):
                        if isinstance(event, str):
                            # SSE event strings from yields
                            yield event
                        elif isinstance(event, dict) and "__content__" in event:
                            # Final content from the generator
                            content = event["__content__"]

                    if not content:
                        content = "I processed your request but received no content."

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
