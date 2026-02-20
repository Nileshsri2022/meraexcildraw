/**
 * useCanvasChat — Hook for the AI Canvas Chat Assistant.
 *
 * Connects to the Python chat microservice via typed SSE events.
 * Manages conversation state, message history, and canvas context sync.
 *
 * SSE Event Types:
 *   { type: "token",  token: "...", done: false }
 *   { type: "done",   html: "...", session_id: "..." }
 *   { type: "canvas_action", elements: [...] }
 *   { type: "error",  error: "..." }
 */
import { useState, useRef, useCallback } from "react";

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

interface SSEEvent {
    type: "token" | "done" | "canvas_action" | "error";
    token?: string;
    done?: boolean;
    html?: string;
    session_id?: string;
    error?: string;
    elements?: CanvasActionElement[];
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
     * Send a message and stream the response via typed SSE events.
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

        try {
            const controller = new AbortController();
            abortRef.current = controller;

            const response = await fetch(`${CHAT_SERVICE_URL}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: content.trim(),
                    session_id: sessionIdRef.current,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Chat service error: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response stream");

            const decoder = new TextDecoder();
            let buffer = "";

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split("\n");
                buffer = lines.pop() || "";

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;

                    try {
                        const event: SSEEvent = JSON.parse(line.slice(6));

                        // Handle each event type
                        switch (event.type) {
                            case "token":
                                if (event.token) {
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, content: m.content + event.token }
                                                : m
                                        )
                                    );
                                }
                                break;

                            case "done":
                                if (event.session_id) {
                                    sessionIdRef.current = event.session_id;
                                }
                                if (event.html) {
                                    setMessages(prev =>
                                        prev.map(m =>
                                            m.id === assistantId
                                                ? { ...m, html: event.html }
                                                : m
                                        )
                                    );
                                }
                                break;

                            case "canvas_action":
                                if (event.elements && event.elements.length > 0) {
                                    // Set pending actions — the ChatPanel will execute them
                                    setPendingActions(event.elements);
                                }
                                break;

                            case "error":
                                setError(event.error || "Unknown error");
                                break;
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                // User cancelled
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
    }, [isStreaming]);

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

    /**
     * Sync canvas context to the chat service.
     */
    const syncCanvasContext = useCallback(async (elements: any[]) => {
        if (!sessionIdRef.current) return;

        try {
            await fetch(`${CHAT_SERVICE_URL}/chat/context`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    session_id: sessionIdRef.current,
                    elements: elements.map(el => ({
                        type: el.type,
                        text: el.text || "",
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

    return {
        messages,
        isStreaming,
        error,
        pendingActions,
        sessionId: sessionIdRef.current,
        sendMessage,
        stopStreaming,
        clearChat,
        syncCanvasContext,
        consumeActions,
    };
}
