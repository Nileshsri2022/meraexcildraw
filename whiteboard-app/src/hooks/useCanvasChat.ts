/**
 * useCanvasChat — Hook for the AI Canvas Chat Assistant.
 *
 * Connects to the Python chat microservice via typed SSE events
 * using @microsoft/fetch-event-source (no manual SSE parsing).
 *
 * Refactored: Split into focused sub-hooks (Clean Code §2, §8):
 *   - useChatConversations: conversation CRUD, persistence, session
 *   - useChatStreaming: unified SSE streaming (deduplicates two endpoints)
 *   - useCanvasChat: thin orchestrator that composes the above
 */
import { useState, useRef, useEffect, useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useChatConversations } from "./useChatConversations";
import { useChatStreaming } from "./useChatStreaming";

const CHAT_SERVICE_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:3003";

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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    /** Server-rendered HTML (populated when streaming completes) */
    html?: string;
    /** Optional Base64 encoded image string attached to user message */
    imageBase64?: string;
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
    const [isStreaming, setIsStreaming] = useState(false);

    /**
     * Ref to an Excalidraw API instance for reading current canvas state.
     * Set via setExcalidrawAPI() from the ChatPanel.
     */
    const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);

    const setExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI | null) => {
        excalidrawAPIRef.current = api;
    }, []);

    // ── Conversation management ──
    const convos = useChatConversations();

    // ── Canvas context sync ──
    const flushCanvasContext = useCallback(async (elements: readonly ExcalidrawSceneElement[]) => {
        if (!convos.sessionIdRef.current) return;

        const activeElements = elements.filter(el => !el.isDeleted);
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
                    session_id: convos.sessionIdRef.current,
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
                        fileId: el.fileId || null,
                        label: el.text?.substring(0, 50) || el.type,
                    })),
                }),
            });
        } catch {
            // Non-critical
        }
    }, [convos.sessionIdRef]);

    const syncCanvasContext = useCallback(async (elements?: readonly ExcalidrawSceneElement[]) => {
        const els = elements || (excalidrawAPIRef.current?.getSceneElements?.() as unknown as readonly ExcalidrawSceneElement[]) || [];
        if (!convos.sessionIdRef.current) return;
        await flushCanvasContext(els);
    }, [flushCanvasContext, convos.sessionIdRef]);

    // ── Streaming ──
    const streaming = useChatStreaming({
        sessionIdRef: convos.sessionIdRef,
        excalidrawAPIRef,
        setMessages: convos.setMessages,
        setError: convos.setError,
        setPendingActions: convos.setPendingActions,
        setPendingToolAction: convos.setPendingToolAction,
        ensureConversation: convos.ensureConversation,
        flushCanvasContext,
    });

    // Sync the isStreaming state from the ref
    useEffect(() => {
        const interval = setInterval(() => {
            setIsStreaming(streaming.isStreamingRef.current);
        }, 100);
        return () => clearInterval(interval);
    }, [streaming.isStreamingRef]);

    // Auto-persist messages when streaming completes
    useEffect(() => {
        convos.persistMessages(isStreaming);
    }, [convos.messages, isStreaming, convos.persistMessages]);

    /** Send a message with a fresh canvas sync */
    const sendMessageWithSync = useCallback(async (content: string, imageBase64?: string) => {
        if (convos.sessionIdRef.current) {
            const els = excalidrawAPIRef.current?.getSceneElements?.() || [];
            await flushCanvasContext(els as unknown as readonly ExcalidrawSceneElement[]);
        }
        return streaming.sendMessage(content, imageBase64);
    }, [streaming.sendMessage, flushCanvasContext, convos.sessionIdRef]);

    return {
        messages: convos.messages,
        conversations: convos.conversations,
        activeConversationId: convos.activeConversationId,
        isStreaming,
        error: convos.error,
        pendingActions: convos.pendingActions,
        pendingToolAction: convos.pendingToolAction,
        sessionId: convos.sessionIdRef.current,
        sendMessage: sendMessageWithSync,
        sendToolMessage: streaming.sendToolMessage,
        stopStreaming: streaming.stopStreaming,
        clearChat: convos.clearChat,
        startNewConversation: convos.startNewConversation,
        selectConversation: convos.selectConversation,
        deleteConversation: convos.deleteConversation,
        syncCanvasContext,
        consumeActions: convos.consumeActions,
        consumeToolAction: convos.consumeToolAction,
        setExcalidrawAPI,
        appendAssistantMessage: convos.appendAssistantMessage,
    };
}
