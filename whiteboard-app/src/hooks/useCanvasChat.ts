/**
 * useCanvasChat — Hook for the AI Canvas Chat Assistant.
 *
 * Connects to the Python chat microservice via SSE streaming.
 * Manages conversation state, message history, and canvas context sync.
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

interface StreamChunk {
    token: string;
    done: boolean;
    html?: string;
    session_id?: string;
    error?: string;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCanvasChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    /**
     * Send a message and stream the response via SSE.
     */
    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim() || isStreaming) return;

        setError(null);

        // Add user message
        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: "user",
            content: content.trim(),
            timestamp: Date.now(),
        };

        // Add placeholder assistant message
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

                // Parse SSE events
                const lines = buffer.split("\n");
                buffer = lines.pop() || ""; // Keep incomplete line

                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;

                    try {
                        const chunk: StreamChunk = JSON.parse(line.slice(6));

                        if (chunk.error) {
                            setError(chunk.error);
                            break;
                        }

                        if (chunk.session_id) {
                            sessionIdRef.current = chunk.session_id;
                        }

                        if (chunk.token) {
                            // Append token to the assistant message
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantId
                                        ? { ...m, content: m.content + chunk.token }
                                        : m
                                )
                            );
                        }

                        // When done, swap in the server-rendered HTML
                        if (chunk.done && chunk.html) {
                            setMessages(prev =>
                                prev.map(m =>
                                    m.id === assistantId
                                        ? { ...m, html: chunk.html }
                                        : m
                                )
                            );
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                }
            }
        } catch (err) {
            if (err instanceof DOMException && err.name === "AbortError") {
                // User cancelled, no error needed
            } else {
                const msg = err instanceof Error ? err.message : "Chat failed";
                setError(msg);
                // Remove empty assistant placeholder on error
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
     * Clear conversation history (both local and server-side).
     */
    const clearChat = useCallback(async () => {
        setMessages([]);
        setError(null);

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
     * Sync canvas context to the chat service for canvas-aware responses.
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
        sessionId: sessionIdRef.current,
        sendMessage,
        stopStreaming,
        clearChat,
        syncCanvasContext,
    };
}
