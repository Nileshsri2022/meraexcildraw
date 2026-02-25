import httpx

def test_groq_v2_sse():
    url = 'https://mcp.firecrawl.dev/groq/v2/sse'
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    print(f"Testing {url}")
    with httpx.stream('GET', url, headers={'Authorization': f'Bearer {api_key}', 'Accept': 'text/event-stream'}, timeout=15) as r:
        print(f"Status: {r.status_code}")
        it = r.iter_lines()
        for _ in range(5):
            line = next(it)
            if line: print(line)

if __name__ == "__main__":
    test_groq_v2_sse()
