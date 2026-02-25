import httpx

def test_v1_sse():
    url = 'https://mcp.firecrawl.dev/v1/sse'
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
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_v1_sse()
