/**
 * ChatSidebar — Conversation list with search, delete, and clear.
 * Extracted from ChatPanel for Single Responsibility (Clean Code §8).
 */
import React, { useState, useCallback } from "react";
import type { Conversation } from "../services/chatDb";

interface ChatSidebarProps {
    conversations: Conversation[];
    activeConversationId: string | null;
    messages: { length: number };
    searchTerm: string;
    matchingSearchIds: string[];
    onSearchChange: (term: string) => void;
    onSelectConversation: (id: string) => void;
    onStartNewConversation: () => void;
    onDeleteConversation: (id: string) => void;
    onClearChat: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
    conversations,
    activeConversationId,
    messages,
    searchTerm,
    matchingSearchIds,
    onSearchChange,
    onSelectConversation,
    onStartNewConversation,
    onDeleteConversation,
    onClearChat,
}) => {
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);

    const handleDelete = useCallback((id: string) => {
        onDeleteConversation(id);
        setConfirmDeleteId(null);
    }, [onDeleteConversation]);

    const handleClear = useCallback(() => {
        onClearChat();
        setConfirmClear(false);
    }, [onClearChat]);

    const filtered = conversations
        .filter(conv => (conv.title !== "New Conversation" || activeConversationId === conv.id))
        .filter(conv => {
            if (!searchTerm) return true;
            const titleMatch = conv.title.toLowerCase().includes(searchTerm.toLowerCase());
            const contentMatch = matchingSearchIds.includes(conv.id);
            return titleMatch || contentMatch;
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);

    return (
        <>
            <div className="chat-sidebar-new-container">
                <button
                    className="chat-sidebar-btn chat-sidebar-btn--primary"
                    onClick={onStartNewConversation}
                    title="New conversation"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>New Chat</span>
                </button>
            </div>

            <div className="chat-sidebar-header">
                <span className="chat-sidebar-title">Recent Chats</span>
            </div>

            <div className="chat-sidebar-search">
                <div className="chat-search-input-wrapper">
                    <svg className="chat-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        className="chat-search-input"
                        placeholder="Search chats..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                </div>
            </div>

            <div className="chat-conv-list">
                {filtered.length === 0 && searchTerm ? (
                    <div className="chat-search-empty">No conversations found</div>
                ) : (
                    filtered.map(conv => (
                        <div
                            key={conv.id}
                            className={`chat-conv-item ${activeConversationId === conv.id ? 'chat-conv-item--active' : ''}`}
                            onClick={() => {
                                onSelectConversation(conv.id);
                                setConfirmDeleteId(null);
                            }}
                        >
                            <div className="chat-conv-title" title={conv.title}>
                                {conv.title}
                            </div>
                            {confirmDeleteId === conv.id ? (
                                <div className="chat-conv-confirm">
                                    <button
                                        className="chat-conv-confirm-btn chat-conv-confirm-btn--yes"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDelete(conv.id);
                                        }}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    </button>
                                    <button
                                        className="chat-conv-confirm-btn chat-conv-confirm-btn--no"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setConfirmDeleteId(null);
                                        }}
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                </div>
                            ) : (
                                <button
                                    className="chat-conv-delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmDeleteId(conv.id);
                                    }}
                                    title="Delete conversation"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M18 6L6 18M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    ))
                )}
            </div>

            <div className="chat-sidebar-footer">
                {confirmClear ? (
                    <div className="chat-sidebar-clear-confirm">
                        <span className="chat-clear-label">Clear this chat?</span>
                        <div className="chat-clear-actions">
                            <button
                                className="chat-sidebar-btn chat-sidebar-btn--danger"
                                onClick={handleClear}
                            >
                                Yes, clear
                            </button>
                            <button
                                className="chat-sidebar-btn"
                                onClick={() => setConfirmClear(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        className="chat-sidebar-btn"
                        onClick={() => setConfirmClear(true)}
                        disabled={messages.length === 0}
                        title="Clear messages in the current chat"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        </svg>
                        <span>Clear Chat</span>
                    </button>
                )}
            </div>
        </>
    );
};

ChatSidebar.displayName = "ChatSidebar";
