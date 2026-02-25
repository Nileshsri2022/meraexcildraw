import httpx

def test():
    url = 'https://mcp.firecrawl.dev/fc-16adb169cf914c46bf8f96d5732ea9f8/v2/sse'
    try:
        with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=10) as r:
            print(f"Status: {r.status_code}")
            print(f"Content-Type: {r.headers.get('Content-Type')}")
            for line in r.iter_lines():
                if line:
                    print(f"Stream: {line}")
                    break
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test()
