import httpx

def test_header_sse():
    url = 'https://mcp.firecrawl.dev/v2/sse'
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    headers = {
        'Accept': 'text/event-stream',
        'Authorization': f'Bearer {api_key}'
    }
    with httpx.Client() as client:
        with client.stream('GET', url, headers=headers, timeout=15) as r:
            print(f"Status: {r.status_code}")
            it = r.iter_lines()
            for line in it:
                if line:
                    print(line)
                    if "event: endpoint" in line:
                        print(f"DONE: {next(it)}")
                        return

if __name__ == "__main__":
    test_header_sse()
