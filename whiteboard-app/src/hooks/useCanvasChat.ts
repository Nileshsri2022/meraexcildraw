/**
 * useCanvasChat — Hook for the AI Canvas Chat Assistant.
 *
 * Connects to the Python chat microservice via typed SSE events
 * using @microsoft/fetch-event-source (no manual SSE parsing).
 *
 * Manages conversation state, message history, and canvas context sync.
 * Syncs canvas context before EVERY message so the AI always knows
 * the current state of the canvas.
 *
 * SSE Event Types:
 *   { type: "token",  token: "...", done: false }
 *   { type: "done",   html: "...", session_id: "..." }
 *   { type: "canvas_action", elements: [...] }
 *   { type: "error",  error: "..." }
 */
import { useState, useRef, useCallback, useEffect } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { chatDb } from "../services/chatDb";

/**
 * Minimal shape of an Excalidraw scene element for canvas context sync.
 * Avoids `any` while only referencing the properties we actually read.
 */
interface ExcalidrawSceneElement {
    readonly id: string;
    readonly type: string;
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly isDeleted: boolean;
    readonly text?: string;
    readonly originalText?: string;
    readonly strokeColor?: string;
    readonly backgroundColor?: string;
    readonly fillStyle?: string;
    readonly fileId?: string | null;
}

const CHAT_SERVICE_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:3003";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    /** Server-rendered HTML (populated when streaming completes) */
    html?: string;
    timestamp: number;
}

/** Structured canvas element from the backend */
export interface CanvasActionElement {
    id?: string;
    type: "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line";
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    text?: string;
    backgroundColor?: string;
    strokeColor?: string;
    fontSize?: number;
    startId?: string;
    endId?: string;
}

/** AI tool action from the backend — routes to real AI tools */
export interface ToolAction {
    tool: "diagram" | "image" | "sketch" | "ocr" | "tts";
    prompt: string;
    style?: string;   // for diagram tool
    text?: string;    // for TTS tool
}

/** MCP server connection config sent to /chat/tools */
export interface McpServerConfig {
    label: string;
    url: string;
    description?: string;
    headers?: Record<string, string>;
    require_approval?: string;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCanvasChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const isStreamingRef = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingActions, setPendingActions] = useState<CanvasActionElement[] | null>(null);
    const [pendingToolAction, setPendingToolAction] = useState<ToolAction | null>(null);
    const sessionIdRef = useRef<string | null>(
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null
    );
    const abortRef = useRef<AbortController | null>(null);

    /**
     * Ref to an Excalidraw API instance for reading current canvas state.
     * Set via setExcalidrawAPI() from the ChatPanel.
     */
    const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);

    /**
     * Register the Excalidraw API so the hook can read canvas state
     * before every message.
     */
    const setExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI | null) => {
        excalidrawAPIRef.current = api;
    }, []);

    /**
     * Load messages from IndexedDB on mount.
     */
    useEffect(() => {
        const load = async () => {
            try {
                const stored = await chatDb.loadMessages();
                if (stored && stored.length > 0) {
                    setMessages(stored);
                }
            } catch (err) {
                console.error("[ChatDB] Failed to load messages:", err);
            }
        };
        load();
    }, []);

    /**
     * Save messages to IndexedDB whenever they change.
     */
    useEffect(() => {
        if (messages.length > 0 && !isStreaming) {
            chatDb.saveMessages(messages).catch(err => {
                console.error("[ChatDB] Failed to save messages:", err);
            });
        }
    }, [messages, isStreaming]);

    /**
     * Internal: send canvas context to the server (requires active session).
     */
    const flushCanvasContext = useCallback(async (elements: readonly ExcalidrawSceneElement[]) => {
        if (!sessionIdRef.current) return;

        // Excalidraw keeps deleted elements in memory for undo/redo. Filter them out!
        const activeElements = elements.filter(el => !el.isDeleted);

        // Get currently selected elements for "this" / "that" references
        const selectedIds = new Set(
            excalidrawAPIRef.current?.getAppState?.()?.selectedElementIds
                ? Object.keys(excalidrawAPIRef.current.getAppState().selectedElementIds)
                : []
        );

        try {
            await fetch(`${CHAT_SERVICE_URL}/chat/context`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionIdRef.current,
                    elements: activeElements.map(el => ({
                        id: el.id,
                        type: el.type,
                        text: el.text || el.originalText || "",
                        x: Math.round(el.x),
                        y: Math.round(el.y),
                        width: Math.round(el.width),
                        height: Math.round(el.height),
                        strokeColor: el.strokeColor || "",
                        backgroundColor: el.backgroundColor || "",
                        fillStyle: el.fillStyle || "",
                        isSelected: selectedIds.has(el.id),
                        fileId: el.fileId || null,       // for images
                        label: el.text?.substring(0, 50) || el.type, // human-readable label
                    })),
                }),
            });
        } catch {
            // Non-critical
        }
    }, []);

    /**
     * Sync current canvas context to the server.
     * If no session exists yet, it's a no-op (context will be synced
     * right before the first message via sendMessage).
     */
    const syncCanvasContext = useCallback(async (elements?: readonly ExcalidrawSceneElement[]) => {
        const els = elements || (excalidrawAPIRef.current?.getSceneElements?.() as unknown as readonly ExcalidrawSceneElement[]) || [];
        if (!sessionIdRef.current) return;
        await flushCanvasContext(els);
    }, [flushCanvasContext]);

    /**
     * Send a message and stream the response via typed SSE events.
     *
     * Before sending, automatically syncs the current canvas state
     * so the AI always has up-to-date context.
     */
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || isStreamingRef.current) return;

        setError(null);
        setPendingActions(null);
        setPendingToolAction(null);

        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: "user",
            content: content.trim(),
            timestamp: Date.now(),
        };

        const assistantId = `a-${Date.now()}`;
        const assistantMsg: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        isStreamingRef.current = true;
        setIsStreaming(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            await fetchEventSource(`${CHAT_SERVICE_URL}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: content.trim(),
                    session_id: sessionIdRef.current,
                }),
                signal: controller.signal,

                // Called for each SSE event — data is already extracted
                onmessage(event) {
                    try {
                        const data = JSON.parse(event.data);

                        switch (data.type) {
                            case "token":
                                if (data.token) {
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, content: m.content + data.token }
                                                : m
                                        )
                                    );
                                }
                                break;

                            case "done":
                                if (data.session_id) {
                                    const isNewSession = !sessionIdRef.current;
                                    sessionIdRef.current = data.session_id;

                                    // If this is a brand-new session, sync canvas context now
                                    if (isNewSession) {
                                        const els = excalidrawAPIRef.current?.getSceneElements?.() || [];
                                        if (els.length > 0) {
                                            flushCanvasContext(els);
                                        }
                                    }
                                }
                                if (data.html) {
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, html: data.html }
                                                : m
                                        )
                                    );
                                }
                                break;

                            case "canvas_action":
                                if (data.elements && data.elements.length > 0) {
                                    setPendingActions(data.elements);
                                }
                                break;

                            case "tool_action":
                                // Route to a real AI tool (diagram, image, sketch, ocr, tts)
                                if (data.tool) {
                                    setPendingToolAction({
                                        tool: data.tool,
                                        prompt: data.prompt || "",
                                        style: data.style,
                                        text: data.text,
                                    });
                                }
                                break;

                            case "error":
                                setError(data.error || "Unknown error");
                                break;
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                },

                // Connection opened successfully
                onopen: async (response) => {
                    if (!response.ok) {
                        throw new Error(`Chat service error: ${response.status}`);
                    }
                },

                // Handle errors — don't retry on abort
                onerror(err) {
                    if (err instanceof DOMException && err.name === "AbortError") {
                        throw err;
                    }
                    setError(err instanceof Error ? err.message : "Chat failed");
                    throw err;
                },

                openWhenHidden: true,
            });
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                // User cancelled — silent
            } else {
                const msg = err instanceof Error ? err.message : "Chat failed";
                setError(msg);
                setMessages(prev =>
                    prev.filter(m => m.id !== assistantId || m.content.length > 0)
                );
            }
        } finally {
            isStreamingRef.current = false;
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [flushCanvasContext]);

    /**
     * Send a message with a fresh canvas sync.
     * Called by ChatPanel which has access to excalidrawAPI.
     */
    const sendMessageWithSync = useCallback(async (content: string) => {
        // Sync canvas context right before sending (if session exists)
        if (sessionIdRef.current) {
            const els = excalidrawAPIRef.current?.getSceneElements?.() || [];
            await flushCanvasContext(els);
        }
        return sendMessage(content);
    }, [sendMessage, flushCanvasContext]);

    /**
     * Send a message using the tools-augmented endpoint.
     * Uses Groq's built-in tools and/or remote MCP servers.
     */
    const sendToolMessage = useCallback(async (
        content: string,
        builtinTools: string[],
        mcpServers: McpServerConfig[],
    ) => {
        if (!content.trim() || isStreamingRef.current) return;

        setError(null);
        setPendingActions(null);
        setPendingToolAction(null);

        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: "user",
            content: content.trim(),
            timestamp: Date.now(),
        };

        const assistantId = `a-${Date.now()}`;
        const assistantMsg: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        isStreamingRef.current = true;
        setIsStreaming(true);

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            await fetchEventSource(`${CHAT_SERVICE_URL}/chat/tools`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: content.trim(),
                    session_id: sessionIdRef.current,
                    builtin_tools: builtinTools,
                    mcp_servers: mcpServers.map(s => ({
                        label: s.label,
                        url: s.url,
                        description: s.description || "",
                        headers: s.headers || {},
                        require_approval: s.require_approval || "never",
                    })),
                }),
                signal: controller.signal,

                onmessage(event) {
                    try {
                        const data = JSON.parse(event.data);

                        switch (data.type) {
                            case "token":
                                if (data.token) {
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, content: m.content + data.token }
                                                : m
                                        )
                                    );
                                }
                                break;

                            case "tool_info":
                                // MCP server discovered tools
                                if (import.meta.env.DEV) {
                                    console.log(`[ToolChat] ${data.server} tools:`, data.tools);
                                }
                                break;

                            case "tool_call":
                                // A tool was executed
                                setMessages(prev =>
                                    prev.map(m =>
                                        m.id === assistantId
                                            ? {
                                                ...m,
                                                content: m.content +
                                                    `\n🔧 *Used ${data.tool}*` +
                                                    (data.server ? ` (${data.server})` : "") +
                                                    "\n",
                                            }
                                            : m
                                    )
                                );
                                break;

                            case "done":
                                if (data.session_id) {
                                    sessionIdRef.current = data.session_id;
                                }
                                if (data.html) {
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, html: data.html }
                                                : m
                                        )
                                    );
                                }
                                break;

                            case "error":
                                setError(data.error || "Tool error");
                                break;
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                },

                onopen: async (response) => {
                    if (!response.ok) {
                        throw new Error(`Tool chat error: ${response.status}`);
                    }
                },

                onerror(err) {
                    if (err instanceof DOMException && err.name === "AbortError") {
                        throw err;
                    }
                    setError(err instanceof Error ? err.message : "Tool chat failed");
                    throw err;
                },

                openWhenHidden: true,
            });
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                // User cancelled
            } else {
                const msg = err instanceof Error ? err.message : "Tool chat failed";
                setError(msg);
                setMessages(prev =>
                    prev.filter(m => m.id !== assistantId || m.content.length > 0)
                );
            }
        } finally {
            isStreamingRef.current = false;
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, []);

    /**
     * Stop the current stream.
     */
    const stopStreaming = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    /**
     * Consume and clear pending canvas actions.
     */
    const consumeActions = useCallback(() => {
        const actions = pendingActions;
        setPendingActions(null);
        return actions;
    }, [pendingActions]);

    /**
     * Consume and clear pending tool action.
     */
    const consumeToolAction = useCallback(() => {
        const action = pendingToolAction;
        setPendingToolAction(null);
        return action;
    }, [pendingToolAction]);

    /**
     * Clear conversation history (both local and server-side).
     * Also resets canvas context on the server.
     */
    const clearChat = useCallback(async () => {
        setMessages([]);
        setError(null);
        setPendingActions(null);
        await chatDb.clearMessages();

        if (sessionIdRef.current) {
            try {
                await fetch(`${CHAT_SERVICE_URL}/chat/clear`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ session_id: sessionIdRef.current }),
                });

                // Clear the session ID locally as well to rotate the session
                if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                    sessionIdRef.current = crypto.randomUUID();
                } else {
                    sessionIdRef.current = null;
                }
            } catch {
                // Non-critical
            }
        }
    }, []);

    /**
     * Programmatically append an assistant message to the chat.
     * Used by tool actions (OCR, etc.) to show results in the conversation.
     */
    const appendAssistantMessage = useCallback((content: string) => {
        const msg: ChatMessage = {
            id: `tool-${Date.now()}`,
            role: "assistant",
            content,
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, msg]);
    }, []);

    return {
        messages,
        isStreaming,
        error,
        pendingActions,
        pendingToolAction,
        sessionId: sessionIdRef.current,
        sendMessage: sendMessageWithSync,
        sendToolMessage,
        stopStreaming,
        clearChat,
        syncCanvasContext,
        consumeActions,
        consumeToolAction,
        setExcalidrawAPI,
        appendAssistantMessage,
    };
}
