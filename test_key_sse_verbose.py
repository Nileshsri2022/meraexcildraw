import httpx

def test_key_sse_verbose():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/{api_key}/v2/sse'
    print(f"Testing {url}")
    try:
        with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
            print(f"Status: {r.status_code}")
            count = 0
            for line in r.iter_lines():
                if line:
                    print(f"LINE: {line}")
                    count += 1
                if count > 10: break
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_key_sse_verbose()
