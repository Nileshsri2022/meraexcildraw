import httpx

def test_query_sse():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/v2/sse?apiKey={api_key}'
    print(f"Testing {url}")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
        print(f"Status: {r.status_code}")
        it = r.iter_lines()
        for _ in range(5):
            line = next(it)
            if line: print(line)

if __name__ == "__main__":
    test_query_sse()
