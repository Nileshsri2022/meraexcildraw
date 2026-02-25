/**
 * useChatConversations — Conversation CRUD and message persistence.
 *
 * Manages: conversation list, active conversation, message state,
 * IndexedDB persistence, and session ID rotation.
 *
 * Extracted from useCanvasChat for Single Responsibility (Clean Code §2, §8).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { chatDb, type Conversation } from "../services/chatDb";
import type { ChatMessage, CanvasActionElement, ToolAction } from "./useCanvasChat";

const CHAT_SERVICE_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:3003";

export function useChatConversations() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pendingActions, setPendingActions] = useState<CanvasActionElement[] | null>(null);
    const [pendingToolAction, setPendingToolAction] = useState<ToolAction | null>(null);

    const sessionIdRef = useRef<string | null>(
        typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null
    );

    /** Generate a new session ID */
    const rotateSessionId = useCallback(() => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            sessionIdRef.current = crypto.randomUUID();
        } else {
            sessionIdRef.current = null;
        }
    }, []);

    /** Load conversations and last active chat on mount */
    useEffect(() => {
        const init = async () => {
            try {
                const convs = await chatDb.loadConversations();
                setConversations(convs);
                if (convs.length > 0) {
                    const last = convs[0];
                    setActiveConversationId(last.id);
                    const msgs = await chatDb.loadMessages(last.id);
                    setMessages(msgs);
                }
            } catch (err) {
                console.error("[ChatDB] Init failed:", err);
            }
        };
        init();
    }, []);

    /** Auto-save messages to DB when streaming completes */
    useEffect(() => {
        // This is controlled externally via the `isStreaming` flag from streaming hook
        // For now, we expose setters so the streaming hook can trigger saves
    }, []);

    /** Persist messages and update conversation title */
    const persistMessages = useCallback((isStreaming: boolean) => {
        if (activeConversationId && messages.length > 0 && !isStreaming) {
            chatDb.saveMessages(activeConversationId, messages, { skipTimestamp: true }).catch(err => {
                console.error("[ChatDB] Failed to save messages:", err);
            });

            const current = conversations.find(c => c.id === activeConversationId);
            if (current && current.title === "New Conversation" && messages.length > 0) {
                const firstUserMsg = messages.find(m => m.role === "user");
                if (firstUserMsg) {
                    const newTitle = firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "");
                    const updated = { ...current, title: newTitle, updatedAt: Date.now() };
                    chatDb.saveConversation(updated).then(() => {
                        chatDb.loadConversations().then(setConversations);
                    });
                }
            }
        }
    }, [activeConversationId, messages, conversations]);

    const selectConversation = useCallback(async (id: string) => {
        if (id === activeConversationId) return;
        try {
            const msgs = await chatDb.loadMessages(id);
            setMessages(msgs);
            setActiveConversationId(id);
            rotateSessionId();
        } catch (err) {
            console.error("[ChatDB] Failed to select conversation:", err);
        }
    }, [activeConversationId, rotateSessionId]);

    const startNewConversation = useCallback(async () => {
        const id = crypto.randomUUID();
        setActiveConversationId(id);
        setMessages([]);
        rotateSessionId();
    }, [rotateSessionId]);

    const deleteConversation = useCallback(async (id: string) => {
        await chatDb.deleteConversation(id);
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConversationId === id) {
            setMessages([]);
            setActiveConversationId(null);
        }
    }, [activeConversationId]);

    /** Ensure conversation exists in the list before sending a message */
    const ensureConversation = useCallback(async (content: string) => {
        if (!activeConversationId) return;
        const now = Date.now();
        const currentConv = conversations.find(c => c.id === activeConversationId);

        if (!currentConv) {
            const newConv: Conversation = {
                id: activeConversationId,
                title: content.trim().substring(0, 40) + (content.length > 40 ? "..." : ""),
                updatedAt: now,
            };
            await chatDb.saveConversation(newConv);
            setConversations(prev => [newConv, ...prev]);
        } else {
            const updated = { ...currentConv, updatedAt: now };
            await chatDb.saveConversation(updated);
            chatDb.loadConversations().then(setConversations);
        }
    }, [activeConversationId, conversations]);

    const clearChat = useCallback(async () => {
        setMessages([]);
        setError(null);
        setPendingActions(null);

        if (activeConversationId) {
            try {
                await chatDb.clearConversation(activeConversationId);

                const conv = conversations.find(c => c.id === activeConversationId);
                if (conv) {
                    const updated = { ...conv, updatedAt: Date.now() };
                    await chatDb.saveConversation(updated);
                    const freshConvs = await chatDb.loadConversations();
                    setConversations(freshConvs);
                }
            } catch (err) {
                console.error("[ChatDB] clearChat DB error:", err);
            }
        }

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
            rotateSessionId();
        }
    }, [activeConversationId, conversations, rotateSessionId]);

    const appendAssistantMessage = useCallback((content: string) => {
        const now = Date.now();
        const msg: ChatMessage = {
            id: `tool-${now}`,
            role: "assistant",
            content,
            timestamp: now,
        };
        setMessages(prev => [...prev, msg]);

        if (activeConversationId) {
            const current = conversations.find(c => c.id === activeConversationId);
            if (current) {
                const updated = { ...current, updatedAt: now };
                chatDb.saveConversation(updated).then(() => {
                    chatDb.loadConversations().then(setConversations);
                });
            }
        }
    }, [activeConversationId, conversations]);

    const consumeActions = useCallback(() => {
        const actions = pendingActions;
        setPendingActions(null);
        return actions;
    }, [pendingActions]);

    const consumeToolAction = useCallback(() => {
        const action = pendingToolAction;
        setPendingToolAction(null);
        return action;
    }, [pendingToolAction]);

    return {
        messages,
        setMessages,
        conversations,
        activeConversationId,
        error,
        setError,
        pendingActions,
        setPendingActions,
        pendingToolAction,
        setPendingToolAction,
        sessionIdRef,
        selectConversation,
        startNewConversation,
        deleteConversation,
        ensureConversation,
        clearChat,
        appendAssistantMessage,
        consumeActions,
        consumeToolAction,
        persistMessages,
    };
}
