/**
 * useChatStreaming — Unified SSE streaming for chat and tools.
 *
 * Deduplicates the previously copy-pasted sendMessage / sendToolMessage logic.
 * Both endpoints share 90% of the same code; only the URL, payload, and
 * a few extra event types differ.
 *
 * Extracted from useCanvasChat for Single Responsibility (Clean Code §2).
 */
import { useRef, useCallback } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import type { ChatMessage, McpServerConfig, CanvasActionElement, ToolAction } from "./useCanvasChat";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const CHAT_SERVICE_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:3003";

// ─── SSE Discriminated Union Types (Fix #5) ──────────────────────────────────

interface SSETokenEvent {
    readonly type: "token";
    readonly token: string;
    readonly done: boolean;
}

interface SSEDoneEvent {
    readonly type: "done";
    readonly session_id?: string;
    readonly html?: string;
    readonly token?: string;
    readonly done: true;
}

interface SSEErrorEvent {
    readonly type: "error";
    readonly error: string;
    readonly done?: boolean;
}

interface SSECanvasActionEvent {
    readonly type: "canvas_action";
    readonly elements: CanvasActionElement[];
}

interface SSEToolActionEvent {
    readonly type: "tool_action";
    readonly tool: ToolAction["tool"];
    readonly prompt: string;
    readonly style?: string;
    readonly text?: string;
}

interface SSEToolInfoEvent {
    readonly type: "tool_info";
    readonly server: string;
    readonly tools: unknown[];
}

interface SSEToolCallEvent {
    readonly type: "tool_call";
    readonly tool: string;
    readonly server?: string;
}

/** All possible SSE event shapes from the chat service */
export type SSEEvent =
    | SSETokenEvent
    | SSEDoneEvent
    | SSEErrorEvent
    | SSECanvasActionEvent
    | SSEToolActionEvent
    | SSEToolInfoEvent
    | SSEToolCallEvent;

/** Minimal shape of ExcalidrawSceneElement for canvas context */
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

interface StreamingDeps {
    sessionIdRef: React.MutableRefObject<string | null>;
    excalidrawAPIRef: React.MutableRefObject<ExcalidrawImperativeAPI | null>;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
    setPendingActions: React.Dispatch<React.SetStateAction<CanvasActionElement[] | null>>;
    setPendingToolAction: React.Dispatch<React.SetStateAction<ToolAction | null>>;
    ensureConversation: (content: string) => Promise<void>;
    flushCanvasContext: (elements: readonly ExcalidrawSceneElement[]) => Promise<void>;
}

/**
 * SSE event handler configuration.
 * Maps event type names to handler functions, allowing
 * chat and tools endpoints to register different handlers.
 */
type EventHandlerMap = Record<string, (data: SSEEvent, assistantId: string) => void>;

export function useChatStreaming(deps: StreamingDeps) {
    const {
        sessionIdRef,
        excalidrawAPIRef,
        setMessages,
        setError,
        setPendingActions,
        setPendingToolAction,
        ensureConversation,
        flushCanvasContext,
    } = deps;

    const isStreamingRef = useRef(false);
    const abortRef = useRef<AbortController | null>(null);

    /**
     * Core streaming function used by both sendMessage and sendToolMessage.
     * Handles: message creation, SSE connection, event routing, error handling.
     */
    const streamSSE = useCallback(async (
        url: string,
        payload: Record<string, unknown>,
        content: string,
        imageBase64: string | undefined,
        extraHandlers: EventHandlerMap = {},
    ) => {
        if ((!content.trim() && !imageBase64) || isStreamingRef.current) return;

        setError(null);
        setPendingActions(null);
        setPendingToolAction(null);

        const now = Date.now();
        const userMsg: ChatMessage = {
            id: `u-${now}`,
            role: "user",
            content: content.trim(),
            imageBase64,
            timestamp: now,
        };

        const assistantId = `a-${now + 1}`;
        const assistantMsg: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: "",
            timestamp: now + 1,
        };

        await ensureConversation(content);

        setMessages(prev => [...prev, userMsg, assistantMsg]);
        isStreamingRef.current = true;

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            await fetchEventSource(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: controller.signal,

                onmessage(event: { data: string }) {
                    try {
                        const data = JSON.parse(event.data) as SSEEvent;

                        // Check for extra handlers first (e.g., tool_info, tool_call)
                        if (data.type && extraHandlers[data.type]) {
                            extraHandlers[data.type](data, assistantId);
                            return;
                        }

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

                                    if (isNewSession) {
                                        const els = excalidrawAPIRef.current?.getSceneElements?.() || [];
                                        if (els.length > 0) {
                                            flushCanvasContext(els as unknown as readonly ExcalidrawSceneElement[]);
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
                                if (data.elements.length > 0) {
                                    setPendingActions(data.elements as CanvasActionElement[]);
                                }
                                break;

                            case "tool_action":
                                setPendingToolAction({
                                    tool: data.tool,
                                    prompt: data.prompt,
                                    style: data.style,
                                    text: data.text,
                                });
                                break;

                            case "error":
                                setError(data.error || "Unknown error");
                                break;
                        }
                    } catch {
                        // Skip malformed JSON
                    }
                },

                onopen: async (response: Response) => {
                    if (!response.ok) {
                        throw new Error(`Chat service error: ${response.status}`);
                    }
                },

                onerror(err: unknown) {
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
            abortRef.current = null;
        }
    }, [sessionIdRef, excalidrawAPIRef, setMessages, setError, setPendingActions, setPendingToolAction, ensureConversation, flushCanvasContext]);

    /** Send a regular chat message (no tools) */
    const sendMessage = useCallback(async (content: string, imageBase64?: string) => {
        await streamSSE(
            `${CHAT_SERVICE_URL}/chat`,
            {
                message: content.trim(),
                session_id: sessionIdRef.current,
                image_data: imageBase64 || undefined,
            },
            content,
            imageBase64,
        );
    }, [streamSSE, sessionIdRef]);

    /** Send a message with tools (builtin + MCP) */
    const sendToolMessage = useCallback(async (
        content: string,
        builtinTools: string[],
        mcpServers: McpServerConfig[],
        imageBase64?: string,
    ) => {
        const extraHandlers: EventHandlerMap = {
            tool_info: (data) => {
                if (import.meta.env.DEV && data.type === "tool_info") {
                    console.log(`[ToolChat] ${data.server} tools:`, data.tools);
                }
            },
            tool_call: (data, assistantId) => {
                if (data.type !== "tool_call") return;
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
            },
        };

        await streamSSE(
            `${CHAT_SERVICE_URL}/chat/tools`,
            {
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
                image_data: imageBase64 || undefined,
            },
            content,
            imageBase64,
            extraHandlers,
        );
    }, [streamSSE, sessionIdRef, setMessages]);

    const stopStreaming = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    return {
        isStreamingRef,
        sendMessage,
        sendToolMessage,
        stopStreaming,
    };
}
