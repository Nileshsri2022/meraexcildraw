# My Whiteboard

An AI-powered collaborative whiteboard built on [**@excalidraw/excalidraw**](https://www.npmjs.com/package/@excalidraw/excalidraw), featuring real-time collaboration, AI image/diagram/sketch generation, OCR, text-to-speech, voice commands, and an agentic canvas chat with MCP tool integration.

## Features

### Core Whiteboard (Excalidraw)
- 🎨 Infinite canvas with hand-drawn style elements (RoughJS)
- 🌓 Dark mode · 📷 Image support · 🖼️ Export to PNG/SVG/JSON
- ⚒️ 15+ drawing tools · ⌨️ 50+ keyboard shortcuts · 🔙 Undo/Redo
- 🔍 Zoom & panning · 🌍 58 languages (i18n) · 📱 Mobile support

### AI Tools
- 🖼️ **AI Image Generation** — text-to-image via Hugging Face / Gradio
- 📊 **Diagram Generation** — prompt → Mermaid → Excalidraw elements
- ✏️ **Sketch Generation** — freehand-style AI sketches
- 🔍 **OCR** — extract text/LaTeX from canvas or uploaded images
- 🔊 **Text-to-Speech** — ElevenLabs-powered TTS with voice selection
- 🎙️ **Voice Commands** — speak to generate images, diagrams, or sketches

### Chat Assistant
- 💬 **Canvas-aware AI chat** — streaming SSE chat with full canvas context
- 🛠️ **Tool use** — AI can draw shapes, generate diagrams, and modify the canvas
- 🔗 **MCP Server integration** — connect external tools (Firecrawl, Stripe, etc.)
- 📝 **Rich markdown** — tables, syntax highlighting (PrismLight), LaTeX, Mermaid
- 💾 **Conversation persistence** — IndexedDB-backed multi-conversation history

### Collaboration & Persistence
- 👥 **Real-time collaboration** — WebSocket-based multiplayer via Socket.IO
- 💾 **Auto-save** — debounced local persistence with save status indicator
- 🗂️ **Scene restore** — automatic scene + files restoration on reload

## Architecture

```
my-whiteboard/
├── whiteboard-app/              # React 18 + Vite 5 SPA
│   ├── src/
│   │   ├── App.tsx              # Main app — Excalidraw + lazy-loaded dialogs
│   │   ├── components/          # 12 components (ChatPanel, AIToolsDialog, etc.)
│   │   ├── hooks/               # 11 hooks + hooks/ai/ (4 AI-specific hooks)
│   │   ├── collab/              # WebSocket collaboration logic
│   │   ├── data/                # IndexedDB persistence (LocalStorage, chatDb)
│   │   ├── services/            # API service layer
│   │   ├── styles/              # 8 CSS modules (base, chat, AI, animations…)
│   │   ├── types/               # TypeScript type definitions
│   │   └── utils/               # Shared utilities (apiClient, mathJaxParser…)
│   ├── vite.config.ts           # Vite + manualChunks vendor splitting
│   └── package.json
├── server/                      # Express + Socket.IO collaboration server
│   ├── index.js                 # Collab relay, AI proxy endpoints
│   └── Dockerfile               # Railway deployment
├── chat-service/                # FastAPI + LangChain chat backend
│   ├── main.py                  # FastAPI app entry
│   ├── routes/                  # chat, tools_chat, canvas, health
│   ├── tools.py                 # Built-in tool definitions
│   ├── mcp_client.py            # MCP server connection manager
│   ├── sessions.py              # Conversation session management
│   └── Dockerfile               # Railway deployment
└── package.json                 # Bun workspace root
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript 5, Vite 5, Jotai (state) |
| **Whiteboard** | @excalidraw/excalidraw 0.18.0 |
| **Markdown** | react-markdown, PrismLight (syntax), KaTeX (math), Mermaid |
| **Collaboration** | Socket.IO client/server |
| **AI Backend** | Express, Groq, Hugging Face, ElevenLabs, Gradio |
| **Chat Backend** | FastAPI, LangChain, Groq LLM, MCP SDK |
| **Persistence** | IndexedDB (idb), localStorage |
| **Package Manager** | Bun 1.3.8 (workspaces) |
| **Deployment** | Vercel (frontend), Railway (server + chat-service) |

## Quick Start

### Prerequisites
- **Node.js** ≥ 18 · **Bun** ≥ 1.3
- API keys: `GROQ_API_KEY` (required), plus optional keys for HuggingFace, ElevenLabs

### Development

```bash
# Install dependencies
bun install

# Start frontend + server concurrently
bun run dev

# Or run individually:
bun run start          # Frontend on http://localhost:3000
bun run server         # Collab server on http://localhost:3001

# Chat service (Python)
cd chat-service
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Build

```bash
bun run build          # Production build (whiteboard-app/dist/)
bun run typecheck      # TypeScript checking
bun run lint           # ESLint
bun run fix            # Auto-fix lint + format
```

## Performance Optimizations

The codebase applies Vercel React Best Practices and aggressive bundle splitting:

- **Code splitting** — `manualChunks` for excalidraw, markdown, katex, mermaid vendors
- **Lazy loading** — `React.lazy` + `Suspense` for AIToolsDialog and ChatPanel
- **Dynamic imports** — mermaid-to-excalidraw (~2MB), html2canvas (~180KB) loaded on-demand
- **PrismLight** — only 8 registered languages instead of full Prism (~2MB → ~50KB)
- **React.memo** — ChatSidebar, ChatToolBar, ChatInputBar, McpConnectionModal, CodeBlock
- **Hoisted components** — 13 static ReactMarkdown overrides + plugin arrays at module level
- **No polling** — streaming state pushed directly from SSE handler (no setInterval)
- **Dead dep removal** — removed unused @capacitor/*, @elevenlabs/react, markmap-*

## License

MIT
