import httpx
import time

def test_full_sse():
    url = 'https://mcp.firecrawl.dev/fc-16adb169cf914c46bf8f96d5732ea9f8/v2/sse'
    print(f"Connecting to {url}...")
    try:
        with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
            print(f"Status: {r.status_code}")
            print(f"Headers: {dict(r.headers)}")
            count = 0
            for line in r.iter_lines():
                if line:
                    print(f"Line: {line}")
                    count += 1
                if count > 5:  # Read a few lines
                    break
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_full_sse()
