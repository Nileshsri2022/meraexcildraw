import httpx

def test_v2_bare():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/{api_key}/v2'
    print(f"Testing {url}")
    try:
        with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
            print(f"Status: {r.status_code}")
            it = r.iter_lines()
            for _ in range(5):
                line = next(it)
                if line: print(line)
    except Exception as e:
        # Fallback to normal GET to see if it's HTML
        resp = httpx.get(url)
        print(f"GET Status: {resp.status_code}")
        print(f"GET Body: {resp.text[:100]}")

if __name__ == "__main__":
    test_v2_bare()
