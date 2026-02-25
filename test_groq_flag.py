import httpx

def test_groq_flag():
    api_key = 'fc-16adb169cf914c46bf8f96d5732ea9f8'
    url = f'https://mcp.firecrawl.dev/{api_key}/v2/sse?groq=true'
    print(f"Testing {url}")
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=15) as r:
        it = r.iter_lines()
        for _ in range(5):
            print(f"RAW: {next(it)}")

if __name__ == "__main__":
    test_groq_flag()
