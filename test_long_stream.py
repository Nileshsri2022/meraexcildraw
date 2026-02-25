import httpx

def test_long_stream():
    url = 'https://mcp.firecrawl.dev/fc-16adb169cf914c46bf8f96d5732ea9f8/v2/sse'
    print(f"Testing {url}")
    try:
        with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=20) as r:
            print(f"Status: {r.status_code}")
            for line in r.iter_lines():
                if line.strip():
                    print(line)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_long_stream()
