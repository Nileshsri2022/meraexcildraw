/**
 * ChatPanel — AI Canvas Chat Assistant sidebar.
 *
 * A premium sliding panel with streaming AI responses,
 * server-side rendered HTML, and canvas-aware conversation.
 *
 * Canvas actions from the backend are executed automatically
 * via the useCanvasActions hook — no parsing needed.
 */
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useCanvasChat } from "../hooks/useCanvasChat";
import type { ChatMessage, McpServerConfig } from "../hooks/useCanvasChat";
import { useCanvasActions } from "../hooks/useCanvasActions";
import { useAIGeneration } from "../hooks/useAIGeneration";
import { executeToolAction } from "../utils/executeToolAction";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { chatDb } from "../services/chatDb";

// ─── Message Bubble ──────────────────────────────────────────────────────────

const MessageBubble = React.memo(({ message, isStreaming }: {
    message: ChatMessage;
    isStreaming: boolean;
}) => {
    const isUser = message.role === "user";
    const [copied, setCopied] = useState(false);

    const handleCopy = useCallback(() => {
        const text = message.content;
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [message.content]);

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
                    <div className="chat-rendered" dangerouslySetInnerHTML={{ __html: message.html }} />
                ) : message.content ? (
                    <p className="chat-streaming-text">{message.content}</p>
                ) : isStreaming ? (
                    <div className="chat-typing">
                        <span /><span /><span />
                    </div>
                ) : null}

                {!isUser && message.content && (
                    <button
                        className={`chat-copy-btn ${copied ? 'chat-copy-btn--copied' : ''}`}
                        onClick={handleCopy}
                        title="Copy to clipboard"
                    >
                        {copied ? (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
});

MessageBubble.displayName = "MessageBubble";

// ─── Chat Panel ──────────────────────────────────────────────────────────────

interface ChatPanelProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, excalidrawAPI }) => {
    const chat = useCanvasChat();
    const canvasActions = useCanvasActions(excalidrawAPI);
    const [input, setInput] = useState("");
    const [actionCount, setActionCount] = useState(0);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const [toolStatus, setToolStatus] = useState<string | null>(null);

    // ─── Tool Selection State ────────────────────────────────────────
    const [showToolBar, setShowToolBar] = useState(false);
    const [activeBuiltinTools, setActiveBuiltinTools] = useState<string[]>([]);
    const [connectedMcpServers, setConnectedMcpServers] = useState<McpServerConfig[]>([]);
    const [showMcpModal, setShowMcpModal] = useState(false);
    const [mcpForm, setMcpForm] = useState({ label: "", url: "", apiKey: "", description: "" });
    const [mcpTestStatus, setMcpTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
    const [mcpTestError, setMcpTestError] = useState("");
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [confirmClear, setConfirmClear] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [matchingSearchIds, setMatchingSearchIds] = useState<string[]>([]);

    const CHAT_SERVICE_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:3003";

    const hasActiveTools = activeBuiltinTools.length > 0 || connectedMcpServers.length > 0;

    const toggleBuiltinTool = useCallback((id: string) => {
        setActiveBuiltinTools(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    }, []);

    const removeMcpServer = useCallback((label: string) => {
        setConnectedMcpServers(prev => prev.filter(s => s.label !== label));
    }, []);

    // Search effect for message content
    useEffect(() => {
        if (!searchTerm.trim()) {
            setMatchingSearchIds([]);
            return;
        }

        const runSearch = async () => {
            const ids = await chatDb.searchConversations(searchTerm);
            setMatchingSearchIds(ids);
        };

        const timer = setTimeout(runSearch, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleTestMcp = useCallback(async () => {
        if (!mcpForm.label.trim() || !mcpForm.url.trim()) return;
        setMcpTestStatus("testing");
        setMcpTestError("");
        try {
            // Build the actual URL (replace <APIKEY> placeholder if present)
            let serverUrl = mcpForm.url;
            if (mcpForm.apiKey && serverUrl.includes("<APIKEY>")) {
                serverUrl = serverUrl.replace("<APIKEY>", mcpForm.apiKey);
            }

            const resp = await fetch(`${CHAT_SERVICE_URL}/chat/test-mcp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: mcpForm.label,
                    url: serverUrl,
                    headers: mcpForm.apiKey && !serverUrl.includes(mcpForm.apiKey)
                        ? { "Authorization": `Bearer ${mcpForm.apiKey}` }
                        : {},
                }),
            });
            const data = await resp.json();
            if (data.ok) {
                setMcpTestStatus("ok");
            } else {
                setMcpTestStatus("error");
                setMcpTestError(data.error?.slice(0, 150) || "Connection failed");
            }
        } catch (e) {
            setMcpTestStatus("error");
            setMcpTestError(e instanceof Error ? e.message : "Network error");
        }
    }, [mcpForm, CHAT_SERVICE_URL]);

    const handleAddMcp = useCallback(() => {
        if (!mcpForm.label.trim() || !mcpForm.url.trim()) return;

        let serverUrl = mcpForm.url;
        if (mcpForm.apiKey && serverUrl.includes("<APIKEY>")) {
            serverUrl = serverUrl.replace("<APIKEY>", mcpForm.apiKey);
        }

        const config: McpServerConfig = {
            label: mcpForm.label.trim(),
            url: serverUrl,
            description: mcpForm.description.trim(),
            headers: mcpForm.apiKey && !serverUrl.includes(mcpForm.apiKey)
                ? { "Authorization": `Bearer ${mcpForm.apiKey}` }
                : {},
        };
        setConnectedMcpServers(prev => [...prev.filter(s => s.label !== config.label), config]);
        setShowMcpModal(false);
        setMcpForm({ label: "", url: "", apiKey: "", description: "" });
        setMcpTestStatus("idle");
    }, [mcpForm]);

    // AI generation hook — used when chatbot routes to real AI tools
    const aiGen = useAIGeneration(excalidrawAPI, () => {/* no-op: we don't close the chat panel */ });

    // Register excalidrawAPI with the chat hook so it can read canvas state
    useEffect(() => {
        if (excalidrawAPI) {
            chat.setExcalidrawAPI(excalidrawAPI);
        }
    }, [excalidrawAPI, chat.setExcalidrawAPI]);

    // Execute pending canvas actions from the backend
    useEffect(() => {
        if (chat.pendingActions && chat.pendingActions.length > 0) {
            const count = canvasActions.executeActions(chat.pendingActions) || 0;
            setActionCount(count);
            chat.consumeActions();

            // After drawing, re-sync canvas context so AI knows about new elements
            setTimeout(() => {
                const elements = excalidrawAPI?.getSceneElements?.() || [];
                if (elements.length > 0) {
                    chat.syncCanvasContext([...elements]);
                }
            }, 200);

            // Clear the badge after a few seconds
            const timer = setTimeout(() => setActionCount(0), 4000);
            return () => clearTimeout(timer);
        }
    }, [chat.pendingActions, canvasActions, chat, excalidrawAPI]);

    // Execute pending AI tool actions from the backend
    useEffect(() => {
        if (!chat.pendingToolAction) return;

        const action = chat.pendingToolAction;
        chat.consumeToolAction();

        const run = async () => {
            try {
                await executeToolAction({
                    action,
                    aiGen,
                    excalidrawAPI,
                    setToolStatus,
                    appendAssistantMessage: chat.appendAssistantMessage,
                });
            } catch (err) {
                console.error(`Tool ${action.tool} failed:`, err);
                setToolStatus(`❌ ${action.tool} failed`);
            }

            // Clear status after a few seconds
            setTimeout(() => setToolStatus(null), 4000);
        };

        run();
    }, [chat.pendingToolAction, chat, aiGen, excalidrawAPI]);

    // Auto-scroll logic
    const prevActiveId = useRef<string | null>(null);

    useLayoutEffect(() => {
        const isSwitchingChat = chat.activeConversationId !== prevActiveId.current;

        const forceScrollToBottom = (behavior: ScrollBehavior = "auto") => {
            if (messagesContainerRef.current) {
                messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
            messagesEndRef.current?.scrollIntoView({ behavior });
        };

        if (isSwitchingChat) {
            // When switching chats, we MUST scroll instantly before the next paint
            forceScrollToBottom("auto");
        } else if (chat.messages.length > 0) {
            // For new messages in the SAME chat, smooth scroll after a tiny delay
            const timer = setTimeout(() => forceScrollToBottom("smooth"), 50);
            return () => clearTimeout(timer);
        }

        prevActiveId.current = chat.activeConversationId;
    }, [chat.messages, actionCount, chat.activeConversationId]);

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // Sync canvas context when chat panel opens
    useEffect(() => {
        if (!isOpen || !excalidrawAPI) return;

        const elements = excalidrawAPI.getSceneElements?.() || [];
        chat.syncCanvasContext([...elements]);
    }, [isOpen, excalidrawAPI, chat.syncCanvasContext]);

    // ── Resizability ──
    const [panelWidth, setPanelWidth] = useState(() => {
        const saved = localStorage.getItem("chat-panel-width");
        return saved ? parseInt(saved, 10) : 600;
    });
    const isResizing = useRef(false);

    const startResizing = useCallback((e: React.MouseEvent) => {
        isResizing.current = true;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
    }, []);

    const stopResizing = useCallback(() => {
        isResizing.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
    }, []);

    const resize = useCallback((e: MouseEvent) => {
        if (!isResizing.current) return;
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth >= 450 && newWidth <= 1200) {
            setPanelWidth(newWidth);
            localStorage.setItem("chat-panel-width", newWidth.toString());
        }
    }, []);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    const handleSend = useCallback(() => {
        if (!input.trim() || chat.isStreaming) return;
        if (hasActiveTools) {
            chat.sendToolMessage(input, activeBuiltinTools, connectedMcpServers);
        } else {
            chat.sendMessage(input);
        }
        setInput("");
    }, [input, chat, hasActiveTools, activeBuiltinTools, connectedMcpServers]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    return (
        <div
            className={`chat-panel ${isOpen ? "chat-panel--open" : ""} ${isSidebarCollapsed ? "chat-panel--sidebar-collapsed" : ""}`}
            style={{ width: isOpen ? `${panelWidth}px` : "0" } as React.CSSProperties}
        >
            {/* Resize Handle */}
            <div className="chat-panel-resizer" onMouseDown={startResizing} />

            <div className="chat-panel-container">
                {/* Left Action Sidebar */}
                <div className={`chat-panel-sidebar ${isSidebarCollapsed ? "chat-panel-sidebar--collapsed" : ""}`}>
                    <div className="chat-sidebar-new-container">
                        <button
                            className="chat-sidebar-btn chat-sidebar-btn--primary"
                            onClick={chat.startNewConversation}
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
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="chat-conv-list">
                        {(() => {
                            const filtered = chat.conversations
                                .filter(conv => (conv.title !== "New Conversation" || chat.activeConversationId === conv.id))
                                .filter(conv => {
                                    if (!searchTerm) return true;
                                    const titleMatch = conv.title.toLowerCase().includes(searchTerm.toLowerCase());
                                    const contentMatch = matchingSearchIds.includes(conv.id);
                                    return titleMatch || contentMatch;
                                })
                                .sort((a, b) => b.updatedAt - a.updatedAt);

                            if (filtered.length === 0 && searchTerm) {
                                return <div className="chat-search-empty">No conversations found</div>;
                            }

                            return filtered.map(conv => (
                                <div
                                    key={conv.id}
                                    className={`chat-conv-item ${chat.activeConversationId === conv.id ? 'chat-conv-item--active' : ''}`}
                                    onClick={() => {
                                        chat.selectConversation(conv.id);
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
                                                    chat.deleteConversation(conv.id);
                                                    setConfirmDeleteId(null);
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
                            ));
                        })()}
                    </div>

                    <div className="chat-sidebar-footer">
                        {confirmClear ? (
                            <div className="chat-sidebar-clear-confirm">
                                <span className="chat-clear-label">Clear all?</span>
                                <div className="chat-clear-actions">
                                    <button
                                        className="chat-sidebar-btn chat-sidebar-btn--danger"
                                        onClick={() => {
                                            chat.clearChat();
                                            setConfirmClear(false);
                                        }}
                                    >
                                        Yes
                                    </button>
                                    <button
                                        className="chat-sidebar-btn"
                                        onClick={() => setConfirmClear(false)}
                                    >
                                        No
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button
                                className="chat-sidebar-btn"
                                onClick={() => setConfirmClear(true)}
                                disabled={chat.messages.length === 0}
                                title="Clear current history"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                </svg>
                                <span>Clear History</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="chat-panel-main">
                    {/* Header */}
                    <div className="chat-panel-header">
                        <div className="chat-panel-title">
                            <div className="chat-panel-dot" />
                            <span>Canvas AI</span>
                        </div>
                        <div className="chat-panel-actions">
                            <button
                                className={`chat-panel-action-btn ${isSidebarCollapsed ? '' : 'chat-panel-action-btn--active'}`}
                                onClick={() => setIsSidebarCollapsed(p => !p)}
                                title={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <line x1="9" y1="3" x2="9" y2="21" />
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
                    <div className="chat-panel-messages" ref={messagesContainerRef}>
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
                                    Ask me anything about your whiteboard. I can draw diagrams, brainstorm ideas, and more.
                                </div>
                                <div className="chat-suggestions">
                                    {[
                                        "Draw a login flowchart",
                                        "Add a blue box that says 'API Server'",
                                        "Create a system architecture diagram",
                                        "What's on my canvas?",
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

                        {/* Canvas action badge */}
                        {actionCount > 0 && (
                            <div className="canvas-action-badge">
                                ✅ {actionCount} element{actionCount !== 1 ? "s" : ""} added to canvas!
                            </div>
                        )}

                        {/* AI tool status badge */}
                        {toolStatus && (
                            <div className="canvas-action-badge">
                                {toolStatus}
                            </div>
                        )}

                        {chat.error && (
                            <div className="chat-error">
                                {chat.error}
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* MCP Connection Modal */}
                    {showMcpModal && (
                        <div className="mcp-modal-overlay" onClick={() => setShowMcpModal(false)}>
                            <div className="mcp-modal" onClick={e => e.stopPropagation()}>
                                <div className="mcp-modal-header">
                                    <h3>Connect MCP Server</h3>
                                    <button className="mcp-modal-close" onClick={() => setShowMcpModal(false)}>×</button>
                                </div>
                                <div className="mcp-modal-body">
                                    <label className="mcp-field">
                                        <span>Label *</span>
                                        <input
                                            value={mcpForm.label}
                                            onChange={e => setMcpForm(p => ({ ...p, label: e.target.value }))}
                                            placeholder="e.g. firecrawl"
                                        />
                                    </label>
                                    <label className="mcp-field">
                                        <span>Server URL *</span>
                                        <input
                                            value={mcpForm.url}
                                            onChange={e => setMcpForm(p => ({ ...p, url: e.target.value }))}
                                            placeholder="https://mcp.firecrawl.dev/<APIKEY>/v2/mcp"
                                        />
                                    </label>
                                    <label className="mcp-field">
                                        <span>API Key <small>(replaces {'<APIKEY>'} in URL or sent as Bearer token)</small></span>
                                        <input
                                            type="password"
                                            value={mcpForm.apiKey}
                                            onChange={e => setMcpForm(p => ({ ...p, apiKey: e.target.value }))}
                                            placeholder="fc-..."
                                        />
                                    </label>
                                    <label className="mcp-field">
                                        <span>Description</span>
                                        <input
                                            value={mcpForm.description}
                                            onChange={e => setMcpForm(p => ({ ...p, description: e.target.value }))}
                                            placeholder="Web scraping and content extraction"
                                        />
                                    </label>

                                    {/* Connection test status */}
                                    <div className="mcp-test-row">
                                        <button
                                            className="mcp-test-btn"
                                            onClick={handleTestMcp}
                                            disabled={!mcpForm.label.trim() || !mcpForm.url.trim() || mcpTestStatus === "testing"}
                                        >
                                            {mcpTestStatus === "testing" ? "Testing..." : "Test Connection"}
                                        </button>
                                        {mcpTestStatus === "ok" && <span className="mcp-status mcp-status--ok">✓ Connected</span>}
                                        {mcpTestStatus === "error" && <span className="mcp-status mcp-status--error" title={mcpTestError}>✗ Failed</span>}
                                    </div>
                                </div>
                                <div className="mcp-modal-footer">
                                    <button className="mcp-cancel-btn" onClick={() => setShowMcpModal(false)}>Cancel</button>
                                    <button
                                        className="mcp-add-btn"
                                        onClick={handleAddMcp}
                                        disabled={!mcpForm.label.trim() || !mcpForm.url.trim()}
                                    >
                                        Add Server
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tools Bar */}
                    {showToolBar && (
                        <div className="chat-tools-bar">
                            <div className="chat-tools-section">
                                <span className="chat-tools-label">Built-in Tools</span>
                                <div className="chat-tools-pills">
                                    <button
                                        className={`chat-tool-pill ${activeBuiltinTools.includes('web_search') ? 'chat-tool-pill--active' : ''}`}
                                        onClick={() => toggleBuiltinTool('web_search')}
                                        title="Search the web for current information"
                                    >
                                        🔍 Web Search
                                    </button>
                                    <button
                                        className={`chat-tool-pill ${activeBuiltinTools.includes('code_interpreter') ? 'chat-tool-pill--active' : ''}`}
                                        onClick={() => toggleBuiltinTool('code_interpreter')}
                                        title="Execute Python code for calculations"
                                    >
                                        💻 Code Exec
                                    </button>
                                    <button
                                        className={`chat-tool-pill ${activeBuiltinTools.includes('visit_website') ? 'chat-tool-pill--active' : ''}`}
                                        onClick={() => toggleBuiltinTool('visit_website')}
                                        title="Visit a URL and extract its content"
                                    >
                                        🌐 Visit URL
                                    </button>
                                    <button
                                        className={`chat-tool-pill ${activeBuiltinTools.includes('browser_automation') ? 'chat-tool-pill--active' : ''}`}
                                        onClick={() => toggleBuiltinTool('browser_automation')}
                                        title="Automate browser interactions"
                                    >
                                        🤖 Browser Auto
                                    </button>
                                    <button
                                        className={`chat-tool-pill ${activeBuiltinTools.includes('wolfram_alpha') ? 'chat-tool-pill--active' : ''}`}
                                        onClick={() => toggleBuiltinTool('wolfram_alpha')}
                                        title="Math, science, and data queries via Wolfram Alpha"
                                    >
                                        🧮 Wolfram
                                    </button>
                                </div>
                            </div>
                            <div className="chat-tools-section">
                                <span className="chat-tools-label">MCP Servers</span>
                                <div className="chat-tools-pills">
                                    {connectedMcpServers.map(srv => (
                                        <button
                                            key={srv.label}
                                            className="chat-tool-pill chat-tool-pill--mcp chat-tool-pill--active"
                                            onClick={() => removeMcpServer(srv.label)}
                                            title={`${srv.description || srv.url} — click to disconnect`}
                                        >
                                            <span className="mcp-connected-dot" />
                                            {srv.label}
                                            <span className="mcp-remove">×</span>
                                        </button>
                                    ))}
                                    <button
                                        className="chat-tool-pill chat-tool-pill--add"
                                        onClick={() => setShowMcpModal(true)}
                                        title="Connect an MCP server"
                                    >
                                        + Add MCP
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Input */}
                    <div className="chat-panel-input">
                        <button
                            className={`chat-tools-toggle ${hasActiveTools ? 'chat-tools-toggle--active' : ''}`}
                            onClick={() => setShowToolBar(prev => !prev)}
                            title={showToolBar ? 'Hide tools' : 'Show tools'}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                            {hasActiveTools && <span className="chat-tools-badge">{activeBuiltinTools.length + connectedMcpServers.length}</span>}
                        </button>
                        <textarea
                            ref={inputRef}
                            className="chat-input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={hasActiveTools ? 'Ask with tools enabled...' : 'Ask Canvas AI...'}
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
            </div>
        </div>
    );
};
