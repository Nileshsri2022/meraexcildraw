import httpx

def test_key_sse_v3():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/{api_key}/v2/sse'
    print(f"Testing {url}")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
        it = r.iter_lines()
        for _ in range(10):
            line = next(it)
            if line:
                print(f"Line: {line}")

if __name__ == "__main__":
    test_key_sse_v3()
