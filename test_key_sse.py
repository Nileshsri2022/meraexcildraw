import httpx

def test_key_in_sse():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/{api_key}/v2/sse'
    print(f"Testing {url}")
    try:
        with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
            print(f"Status: {r.status_code}")
            it = r.iter_lines()
            for line in it:
                if line:
                    print(line)
                    if "event: endpoint" in line:
                        print(f"FOUND: {next(it)}")
                        break
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_key_in_sse()
