"""
prompts.py — LangChain prompt templates and LCEL chain definitions.
"""
from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableLambda

from config import chat_llm, canvas_llm, vision_llm

# ─── Prompts ──────────────────────────────────────────────────────────────────

chat_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are **Canvas AI**, an intelligent assistant embedded in a collaborative whiteboard application (Excalidraw-based).

## Your Capabilities
- **Generate Images**: You CAN generate realistic or stylized images directly onto the canvas.
- **Convert Sketches**: You CAN turn user's rough sketches into realistic images.
- **Generate Diagrams**: You CAN generate Mermaid-based diagrams (flowcharts, mind maps, sequence diagrams, etc.).
- **Draw Shapes**: You CAN draw basic shapes, diagrams, and text directly on the canvas.
- **OCR text**: You CAN read and extract text from images on the canvas.
- **Text-to-Speech**: You CAN speak aloud.

**IMPORTANT:** The system automatically intercepts your responses to execute these specific tasks using specialized AI tools in the background. Therefore, if a user asks for an image, diagram, or any of the above, NEVER apologize or say you cannot do it. Instead, enthusiastically acknowledge the request and briefly state what you are generating.

## Response Guidelines
1. **Be concise** — Users are working visually. Keep responses focused and actionable.
2. **Use formatting** — Use markdown with headers, lists, and code blocks.
3. **When drawing/generating** — Briefly describe what you're creating. Do NOT include the actual image URL or diagram code, as the system handles it automatically.
4. **Canvas awareness** — Reference specific elements the user has drawn when context is available.
5. **Friendly tone** — Be a collaborative partner, not a formal assistant."""),
    MessagesPlaceholder(variable_name="history"),
    ("human", "{input}"),
])

canvas_prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a canvas element generator for an Excalidraw whiteboard.
Generate a JSON array of elements based on the user's request.

RULES:
- Output ONLY a JSON array — no markdown, no explanation
- Each element must have: type, x, y
- Supported types: rectangle, ellipse, diamond, text, arrow, line
- Text elements MUST include "text" field
- Arrows connecting elements use "startId" and "endId"
- Use reasonable spacing (150-200px between elements)
- Use vibrant colors like #a855f7, #3b82f6, #10b981, #f59e0b, #ef4444
- Generate unique IDs prefixed with "ai-"
- Keep coordinates positive (100-1200 range)

Canvas context: {canvas_context}"""),
    ("human", "{input}"),
])

# ─── LCEL Chains ─────────────────────────────────────────────────────────────

# Chat chain: prompt → LLM (streams) — no parser so we can stream raw chunks
chat_chain = chat_prompt | chat_llm

# Vision chain: builds a proper multimodal message list so the vision LLM
# receives the image as an image_url block (not a stringified list).
# The `input` from sessions.py is already a list like:
#   [{"type": "text", "text": "..."}, {"type": "image_url", "image_url": {"url": "data:..."}}]

_VISION_SYSTEM_MSG = chat_prompt.messages[0]  # reuse the same system prompt

def _build_vision_messages(chain_input: dict):
    """Convert chain_input into a proper multimodal message list for the vision LLM."""
    from langchain_core.messages import SystemMessage

    # Render the system prompt template into a concrete SystemMessage
    try:
        rendered = _VISION_SYSTEM_MSG.format()
        system_text = rendered.content
    except Exception:
        # Fallback: extract the template string directly
        system_text = _VISION_SYSTEM_MSG.prompt.template if hasattr(_VISION_SYSTEM_MSG, 'prompt') else str(_VISION_SYSTEM_MSG)

    messages = [SystemMessage(content=system_text)]

    # Add conversation history
    history = chain_input.get("history", [])
    messages.extend(history)

    # Add the current user message as a proper multimodal HumanMessage
    user_input = chain_input["input"]
    if isinstance(user_input, list):
        # Already multimodal: [{"type": "text", ...}, {"type": "image_url", ...}]
        messages.append(HumanMessage(content=user_input))
    else:
        # Fallback: plain text
        messages.append(HumanMessage(content=str(user_input)))

    return messages

vision_chain = RunnableLambda(_build_vision_messages) | vision_llm

# Canvas chain: prompt → LLM (deterministic) → string parser
canvas_chain = canvas_prompt | canvas_llm | StrOutputParser()
