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
import { useState, useRef, useCallback } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";

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

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCanvasChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingActions, setPendingActions] = useState<CanvasActionElement[] | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    /**
     * Ref to an Excalidraw API instance for reading current canvas state.
     * Set via setExcalidrawAPI() from the ChatPanel.
     */
    const excalidrawAPIRef = useRef<any>(null);

    /**
     * Register the Excalidraw API so the hook can read canvas state
     * before every message.
     */
    const setExcalidrawAPI = useCallback((api: any) => {
        excalidrawAPIRef.current = api;
    }, []);

    /**
     * Internal: send canvas context to the server (requires active session).
     */
    const flushCanvasContext = useCallback(async (elements: any[]) => {
        if (!sessionIdRef.current || elements.length === 0) return;

        try {
            await fetch(`${CHAT_SERVICE_URL}/chat/context`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionIdRef.current,
                    elements: elements.map(el => ({
                        type: el.type,
                        text: el.text || el.originalText || "",
                        x: el.x,
                        y: el.y,
                        width: el.width,
                        height: el.height,
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
    const syncCanvasContext = useCallback(async (elements?: any[]) => {
        const els = elements || excalidrawAPIRef.current?.getSceneElements?.() || [];
        if (!sessionIdRef.current || els.length === 0) return;
        await flushCanvasContext(els);
    }, [flushCanvasContext]);

    /**
     * Send a message and stream the response via typed SSE events.
     *
     * Before sending, automatically syncs the current canvas state
     * so the AI always has up-to-date context.
     */
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || isStreaming) return;

        setError(null);
        setPendingActions(null);

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
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [isStreaming, flushCanvasContext]);

    /**
     * Send a message with a fresh canvas sync.
     * Called by ChatPanel which has access to excalidrawAPI.
     */
    const sendMessageWithSync = useCallback(async (content: string) => {
        // Sync canvas context right before sending (if session exists)
        if (sessionIdRef.current) {
            const els = excalidrawAPIRef.current?.getSceneElements?.() || [];
            if (els.length > 0) {
                await flushCanvasContext(els);
            } else {
                // Canvas is empty — tell the server
                try {
                    await fetch(`${CHAT_SERVICE_URL}/chat/context`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            session_id: sessionIdRef.current,
                            elements: [],
                        }),
                    });
                } catch {
                    // Non-critical
                }
            }
        }
        return sendMessage(content);
    }, [sendMessage, flushCanvasContext]);

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
     * Clear conversation history (both local and server-side).
     * Also resets canvas context on the server.
     */
    const clearChat = useCallback(async () => {
        setMessages([]);
        setError(null);
        setPendingActions(null);

        if (sessionIdRef.current) {
            try {
                await fetch(`${CHAT_SERVICE_URL}/chat/clear`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ session_id: sessionIdRef.current }),
                });
            } catch {
                // Non-critical
            }
        }
    }, []);

    return {
        messages,
        isStreaming,
        error,
        pendingActions,
        sessionId: sessionIdRef.current,
        sendMessage: sendMessageWithSync,
        stopStreaming,
        clearChat,
        syncCanvasContext,
        consumeActions,
        setExcalidrawAPI,
    };
}
