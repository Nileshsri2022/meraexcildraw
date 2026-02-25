import httpx
import sys

def test_key_sse_order():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/{api_key}/v2/sse'
    print(f"Testing {url}")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
        print(f"Status: {r.status_code}")
        count = 0
        for line in r.iter_lines():
            if line:
                print(f">> {line}")
                sys.stdout.flush()
                count += 1
            if count > 8:
                break

if __name__ == "__main__":
    test_key_sse_order()
