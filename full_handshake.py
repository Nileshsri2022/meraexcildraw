import httpx
import json

def full_handshake():
    sse_url = 'https://mcp.firecrawl.dev/v2/sse'
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    auth_header = {'Authorization': f'Bearer {api_key}'}
    
    with httpx.Client() as client:
        with client.stream('GET', sse_url, headers={**auth_header, 'Accept': 'text/event-stream'}) as r:
            print(f"SSE Status: {r.status_code}")
            it = r.iter_lines()
            for line in it:
                if "event: endpoint" in line:
                    endpoint_path = next(it).replace("data: ", "").strip()
                    print(f"Endpoint: {endpoint_path}")
                    
                    # POST to the endpoint
                    # If endpoint starts with /, it's relative to root
                    full_post_url = f"https://mcp.firecrawl.dev{endpoint_path}"
                    print(f"POSTing to {full_post_url}")
                    
                    payload = {
                        "jsonrpc": "2.0",
                        "method": "initialize",
                        "id": 1,
                        "params": {
                            "protocolVersion": "2024-11-05",
                            "capabilities": {},
                            "clientInfo": {"name": "test", "version": "1.0"}
                        }
                    }
                    
                    resp = client.post(full_post_url, json=payload, headers=auth_header)
                    print(f"POST Status: {resp.status_code}")
                    print(f"POST Body: {resp.text}")
                    return

if __name__ == "__main__":
    full_handshake()
