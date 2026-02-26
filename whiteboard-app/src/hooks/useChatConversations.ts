/**
 * useChatConversations — Conversation CRUD and message persistence.
 *
 * Manages: conversation list, active conversation, message state,
 * IndexedDB persistence, and session ID rotation.
 *
 * Extracted from useCanvasChat for Single Responsibility (Clean Code §2, §8).
 *
 * Fix #4: Uses refs for `conversations` and `activeConversationId` in callbacks
 * to prevent stale closures and unnecessary callback recreation (React §Dependencies).
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

    // ── Refs to avoid stale closures (React §Dependencies) ──
    // Callbacks that need conversations/activeConversationId read from refs,
    // so they are never recreated when those values change.
    const conversationsRef = useRef(conversations);
    conversationsRef.current = conversations;

    const activeConvIdRef = useRef(activeConversationId);
    activeConvIdRef.current = activeConversationId;

    const messagesRef = useRef(messages);
    messagesRef.current = messages;

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

    /** Persist messages and update conversation title */
    const persistMessages = useCallback((isStreaming: boolean) => {
        const convId = activeConvIdRef.current;
        const msgs = messagesRef.current;
        const convs = conversationsRef.current;

        if (convId && msgs.length > 0 && !isStreaming) {
            chatDb.saveMessages(convId, msgs, { skipTimestamp: true }).catch(err => {
                console.error("[ChatDB] Failed to save messages:", err);
            });

            const current = convs.find(c => c.id === convId);
            if (current && current.title === "New Conversation" && msgs.length > 0) {
                const firstUserMsg = msgs.find(m => m.role === "user");
                if (firstUserMsg) {
                    const newTitle = firstUserMsg.content.substring(0, 40) + (firstUserMsg.content.length > 40 ? "..." : "");
                    const updated = { ...current, title: newTitle, updatedAt: Date.now() };
                    chatDb.saveConversation(updated).then(() => {
                        chatDb.loadConversations().then(setConversations);
                    });
                }
            }
        }
    }, []); // No deps — reads from refs

    const selectConversation = useCallback(async (id: string) => {
        if (id === activeConvIdRef.current) return;
        try {
            const msgs = await chatDb.loadMessages(id);
            setMessages(msgs);
            setActiveConversationId(id);
            rotateSessionId();
        } catch (err) {
            console.error("[ChatDB] Failed to select conversation:", err);
        }
    }, [rotateSessionId]); // Removed activeConversationId — reads from ref

    const startNewConversation = useCallback(async () => {
        const id = crypto.randomUUID();
        setActiveConversationId(id);
        setMessages([]);
        rotateSessionId();
    }, [rotateSessionId]);

    const deleteConversation = useCallback(async (id: string) => {
        await chatDb.deleteConversation(id);
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConvIdRef.current === id) {
            setMessages([]);
            setActiveConversationId(null);
        }
    }, []); // Removed activeConversationId — reads from ref

    /** Ensure conversation exists in the list before sending a message */
    const ensureConversation = useCallback(async (content: string) => {
        const convId = activeConvIdRef.current;
        if (!convId) return;

        const now = Date.now();
        const currentConv = conversationsRef.current.find(c => c.id === convId);

        if (!currentConv) {
            const newConv: Conversation = {
                id: convId,
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
    }, []); // Removed conversations, activeConversationId — reads from refs

    const clearChat = useCallback(async () => {
        setMessages([]);
        setConversations([]);
        setActiveConversationId(null);
        setError(null);
        setPendingActions(null);

        try {
            await chatDb.clearAllConversations();
        } catch (err) {
            console.error("[ChatDB] clearChat DB error:", err);
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
    }, [rotateSessionId]);

    const appendAssistantMessage = useCallback((content: string) => {
        const now = Date.now();
        const msg: ChatMessage = {
            id: `tool-${now}`,
            role: "assistant",
            content,
            timestamp: now,
        };
        setMessages(prev => [...prev, msg]);

        const convId = activeConvIdRef.current;
        if (convId) {
            const current = conversationsRef.current.find(c => c.id === convId);
            if (current) {
                const updated = { ...current, updatedAt: now };
                chatDb.saveConversation(updated).then(() => {
                    chatDb.loadConversations().then(setConversations);
                });
            }
        }
    }, []); // Removed conversations, activeConversationId — reads from refs

    // ── Fix #10: Use refs so these callbacks never change ──
    const pendingActionsRef = useRef(pendingActions);
    pendingActionsRef.current = pendingActions;

    const pendingToolActionRef = useRef(pendingToolAction);
    pendingToolActionRef.current = pendingToolAction;

    const consumeActions = useCallback(() => {
        const actions = pendingActionsRef.current;
        setPendingActions(null);
        return actions;
    }, []);

    const consumeToolAction = useCallback(() => {
        const action = pendingToolActionRef.current;
        setPendingToolAction(null);
        return action;
    }, []);

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
