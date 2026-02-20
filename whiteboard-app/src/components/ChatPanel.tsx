/**
 * ChatPanel — AI Canvas Chat Assistant sidebar.
 *
 * A premium sliding panel with streaming AI responses,
 * server-side rendered HTML, and canvas-aware conversation.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useCanvasChat } from "../hooks/useCanvasChat";
import type { ChatMessage } from "../hooks/useCanvasChat";

// ─── Message Bubble ──────────────────────────────────────────────────────────

const MessageBubble = React.memo(({ message, isStreaming }: {
    message: ChatMessage;
    isStreaming: boolean;
}) => {
    const isUser = message.role === "user";

    return (
        <div className={`chat-message ${isUser ? "chat-message--user" : "chat-message--assistant"}`}>
            <div className="chat-message-avatar">
                {isUser ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </svg>
                ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M12 2a8 8 0 0 1 8 8v4a8 8 0 0 1-16 0v-4a8 8 0 0 1 8-8z" />
                        <path d="M9 12h.01M15 12h.01M10 16s1 1 2 1 2-1 2-1" />
                    </svg>
                )}
            </div>
            <div className="chat-message-content">
                {isUser ? (
                    <p>{message.content}</p>
                ) : message.html ? (
                    /* Server-rendered HTML from Python markdown library */
                    <div className="chat-rendered" dangerouslySetInnerHTML={{ __html: message.html }} />
                ) : message.content ? (
                    /* Raw text during streaming (before server sends HTML) */
                    <p className="chat-streaming-text">{message.content}</p>
                ) : isStreaming ? (
                    <div className="chat-typing">
                        <span /><span /><span />
                    </div>
                ) : null}
            </div>
        </div>
    );
});

MessageBubble.displayName = "MessageBubble";

// ─── Chat Panel ──────────────────────────────────────────────────────────────

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: any;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, excalidrawAPI }) => {
    const chat = useCanvasChat();
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chat.messages]);

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Sync canvas context when chat opens
    useEffect(() => {
        if (!isOpen || !excalidrawAPI) return;

        const elements = excalidrawAPI.getSceneElements?.() || [];
        if (elements.length > 0) {
            chat.syncCanvasContext(elements);
        }
    }, [isOpen]); // eslint-disable-line -- only sync when panel opens

    const handleSend = useCallback(() => {
        if (!input.trim() || chat.isStreaming) return;
        chat.sendMessage(input);
        setInput("");
    }, [input, chat]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    return (
        <div className={`chat-panel ${isOpen ? "chat-panel--open" : ""}`}>
            {/* Header */}
            <div className="chat-panel-header">
                <div className="chat-panel-title">
                    <div className="chat-panel-dot" />
                    <span>Canvas AI</span>
                </div>
                <div className="chat-panel-actions">
                    <button
                        className="chat-panel-action-btn"
                        onClick={chat.clearChat}
                        title="Clear chat"
                        disabled={chat.messages.length === 0}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                    </button>
                    <button className="chat-panel-action-btn" onClick={onClose} title="Close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div className="chat-panel-messages">
                {chat.messages.length === 0 && (
                    <div className="chat-empty-state">
                        <div className="chat-empty-icon">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                <path d="M12 2a8 8 0 0 1 8 8v4a8 8 0 0 1-16 0v-4a8 8 0 0 1 8-8z" />
                                <path d="M9 12h.01M15 12h.01M10 16s1 1 2 1 2-1 2-1" />
                            </svg>
                        </div>
                        <div className="chat-empty-title">Canvas AI</div>
                        <div className="chat-empty-subtitle">
                            Ask me anything about your whiteboard. I can help with diagrams, brainstorming, and more.
                        </div>
                        <div className="chat-suggestions">
                            {[
                                "Help me plan a system architecture",
                                "Create a flowchart for user auth",
                                "What's on my canvas?",
                                "Suggest improvements to my diagram",
                            ].map(s => (
                                <button
                                    key={s}
                                    className="chat-suggestion-chip"
                                    onClick={() => { setInput(s); inputRef.current?.focus(); }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {chat.messages.map((msg, i) => (
                    <MessageBubble
                        key={msg.id}
                        message={msg}
                        isStreaming={chat.isStreaming && i === chat.messages.length - 1}
                    />
                ))}

                {chat.error && (
                    <div className="chat-error">
                        {chat.error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="chat-panel-input">
                <textarea
                    ref={inputRef}
                    className="chat-input"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Canvas AI..."
                    rows={1}
                    disabled={chat.isStreaming}
                />
                {chat.isStreaming ? (
                    <button className="chat-send-btn chat-send-btn--stop" onClick={chat.stopStreaming} title="Stop">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                    </button>
                ) : (
                    <button
                        className="chat-send-btn"
                        onClick={handleSend}
                        disabled={!input.trim()}
                        title="Send (Enter)"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};
