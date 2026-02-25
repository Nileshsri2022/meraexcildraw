import httpx

def get_first_no_key():
    url = f'https://mcp.firecrawl.dev/v2/sse'
    print(f"Connecting to {url} (NO KEY)")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
        for line in r.iter_lines():
            if line.startswith("event:"):
                print(f"FIRST EVENT: {line}")
                return

if __name__ == "__main__":
    get_first_no_key()
