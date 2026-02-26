"""
mcp_client.py — Direct MCP client for remote MCP servers.

Bypasses Groq's MCP gateway to avoid timeout issues.
Connects directly to MCP servers (Zapier, Firecrawl, etc.)
using the Streamable HTTP transport (JSON-RPC 2.0).

Flow:
  1. list_tools()  → GET available tools from MCP server
  2. call_tool()   → Execute a specific tool on MCP server
"""
from __future__ import annotations

import json
from typing import Any
import httpx


MCP_TIMEOUT = 120  # seconds — generous timeout for slow MCP servers


def _build_headers(server_headers: dict[str, str] | None) -> dict[str, str]:
    """Build request headers for MCP server, merging auth headers."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if server_headers:
        for k, v in server_headers.items():
            if k.lower() != "content-type":
                headers[k] = v
    return headers


def _jsonrpc(method: str, params: dict | None = None, req_id: int = 1) -> dict:
    """Build a JSON-RPC 2.0 request."""
    msg: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": method,
    }
    if params:
        msg["params"] = params
    return msg


def _parse_sse_response(text: str) -> dict | None:
    """Parse SSE-style response to extract JSON data.
    
    Some MCP servers respond with SSE format even for POST requests.
    Example: "event: message\ndata: {...}\n\n"
    """
    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("data: "):
            try:
                return json.loads(line[6:])
            except json.JSONDecodeError:
                continue
    return None


async def _mcp_request(
    client: httpx.AsyncClient,
    server_url: str,
    server_headers: dict[str, str] | None,
    method: str,
    params: dict | None = None,
    req_id: int = 1,
) -> dict[str, Any]:
    """Send a JSON-RPC request to an MCP server and parse the response."""
    headers = _build_headers(server_headers)
    body = _jsonrpc(method, params, req_id)

    print(f"[MCP-Direct] {method} → {server_url}")

    resp = await client.post(server_url, headers=headers, json=body)

    # Some servers return 202 Accepted or redirect
    if resp.status_code in (301, 302, 307, 308):
        location = resp.headers.get("location", "")
        if location:
            print(f"[MCP-Direct] Redirected to: {location}")
            resp = await client.post(location, headers=headers, json=body)

    resp.raise_for_status()

    content_type = resp.headers.get("content-type", "")

    # Handle SSE response format
    if "text/event-stream" in content_type:
        result = _parse_sse_response(resp.text)
        if result:
            return result
        raise ValueError(f"Failed to parse SSE response: {resp.text[:200]}")

    # Standard JSON response
    return resp.json()


async def list_tools(
    client: httpx.AsyncClient,
    server_url: str,
    server_headers: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """List available tools from a remote MCP server.
    
    Returns a list of tool definitions in MCP format:
    [{ "name": "...", "description": "...", "inputSchema": {...} }, ...]
    """
    try:
        data = await _mcp_request(client, server_url, server_headers, "tools/list")
        result = data.get("result", {})
        tools = result.get("tools", [])
        print(f"[MCP-Direct] Discovered {len(tools)} tools")
        return tools
    except Exception as e:
        print(f"[MCP-Direct] list_tools error: {e}")
        raise


async def call_tool(
    client: httpx.AsyncClient,
    server_url: str,
    server_headers: dict[str, str] | None,
    tool_name: str,
    arguments: dict[str, Any],
) -> str:
    """Call a specific tool on the MCP server and return the result text.
    
    Returns the text content from the tool's response.
    """
    try:
        data = await _mcp_request(
            client,
            server_url,
            server_headers,
            "tools/call",
            params={"name": tool_name, "arguments": arguments},
        )
        result = data.get("result", {})

        # MCP tool results come as content array
        content_parts = result.get("content", [])
        texts = []
        for part in content_parts:
            if part.get("type") == "text":
                texts.append(part.get("text", ""))
            elif part.get("type") == "image":
                texts.append(f"[Image: {part.get('mimeType', 'image')}]")
            elif part.get("type") == "resource":
                texts.append(f"[Resource: {part.get('uri', '')}]")
            else:
                texts.append(json.dumps(part))

        result_text = "\n".join(texts)

        # Check if there was an error
        if result.get("isError"):
            print(f"[MCP-Direct] Tool returned error: {result_text[:200]}")

        print(f"[MCP-Direct] call_tool '{tool_name}' returned {len(result_text)} chars")
        return result_text

    except Exception as e:
        print(f"[MCP-Direct] call_tool error: {e}")
        raise


def mcp_tools_to_openai_functions(mcp_tools: list[dict]) -> list[dict]:
    """Convert MCP tool definitions to OpenAI function-calling format.
    
    MCP format:
        { "name": "...", "description": "...", "inputSchema": { "type": "object", "properties": {...} } }
    
    OpenAI format:
        { "type": "function", "function": { "name": "...", "description": "...", "parameters": {...} } }
    """
    functions = []
    for tool in mcp_tools:
        fn = {
            "type": "function",
            "function": {
                "name": tool.get("name", "unknown"),
                "description": tool.get("description", ""),
                "parameters": tool.get("inputSchema", {"type": "object", "properties": {}}),
            },
        }
        functions.append(fn)
    return functions
