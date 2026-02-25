import httpx

def get_first_event():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/{api_key}/v2/sse'
    print(f"Connecting to {url}")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
        for line in r.iter_lines():
            if line.startswith("event:"):
                print(f"FIRST EVENT: {line}")
                return

if __name__ == "__main__":
    get_first_event()
