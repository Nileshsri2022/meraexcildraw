import httpx

def test_transport_flag():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/{api_key}/v2/mcp?transport=sse'
    print(f"Testing {url}")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
        print(f"Status: {r.status_code}")
        it = r.iter_lines()
        for _ in range(5):
            line = next(it)
            if line: print(f"RAW: {line}")

if __name__ == "__main__":
    test_transport_flag()
