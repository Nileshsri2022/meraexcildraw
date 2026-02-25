import httpx

def test_stream_detailed():
    url = 'https://mcp.firecrawl.dev/fc-16adb169cf914c46bf8f96d5732ea9f8/v2/sse'
    print(f"Testing {url}")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
        print(f"Status: {r.status_code}")
        for line in r.iter_lines():
            if line.strip():
                print(f"RAW: {line}")
            if "endpoint" in line:
                # Read the next line which should be the data
                data_line = next(r.iter_lines())
                print(f"ENDPOINT DATA: {data_line}")
                break

if __name__ == "__main__":
    test_stream_detailed()
