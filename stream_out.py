import httpx
import sys

def get_endpoint():
    url = 'https://mcp.firecrawl.dev/fc-16adb169cf914c46bf8f96d5732ea9f8/v2/sse'
    with httpx.stream('GET', url, headers={'Accept': 'text/event-stream'}, timeout=30) as r:
        if r.status_code != 200:
            print(f"Error: {r.status_code}")
            return
        for line in r.iter_lines():
            sys.stdout.write(line + "\n")
            sys.stdout.flush()
            if "event: message" in line:
                pass
            if "event: endpoint" in line:
                # The very next line should be data
                pass

if __name__ == "__main__":
    get_endpoint()
