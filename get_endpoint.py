import httpx

def get_endpoint():
    url = 'https://mcp.firecrawl.dev/fc-16adb169cf914c46bf8f96d5732ea9f8/v2/sse'
    print(f"Opening stream: {url}")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=30) as r:
        print(f"Status: {r.status_code}")
        it = r.iter_lines()
        for line in it:
            print(f"LINE: {line}")
            if "event: endpoint" in line:
                data = next(it)
                print(f"!!! ENDPOINT DATA: {data}")
                break

if __name__ == "__main__":
    get_endpoint()
