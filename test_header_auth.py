import httpx

def test_header_sse():
    url = 'https://mcp.firecrawl.dev/v2/sse'
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    headers = {
        'Accept': 'text/event-stream',
        'Authorization': f'Bearer {api_key}'
    }
    print(f"Testing {url} with headers")
    try:
        with httpx.stream('GET', url, headers=headers, timeout=15) as r:
            print(f"Status: {r.status_code}")
            for line in r.iter_lines():
                if line.strip():
                    print(line)
                    if "event: endpoint" in line:
                        data = next(r.iter_lines())
                        print(f"!!! ENDPOINT: {data}")
                        break
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_header_sse()
