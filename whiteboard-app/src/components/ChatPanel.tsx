/**
 * ChatPanel — AI Canvas Chat Assistant sidebar.
 *
 * A premium sliding panel with streaming AI responses,
 * server-side rendered HTML, and canvas-aware conversation.
 *
 * Canvas actions from the backend are executed automatically
 * via the useCanvasActions hook — no parsing needed.
 *
 * Refactored: UI split into focused sub-components (Clean Code §8).
 */
import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useCanvasChat } from "../hooks/useCanvasChat";
import type { ChatMessage, McpServerConfig } from "../hooks/useCanvasChat";
import { useCanvasActions } from "../hooks/useCanvasActions";
import { useAIGeneration } from "../hooks/useAIGeneration";
import { executeToolAction } from "../utils/executeToolAction";
import MarkdownRenderer from "./MarkdownRenderer";
import { ChatSidebar } from "./ChatSidebar";
import { ChatToolBar } from "./ChatToolBar";
import { McpConnectionModal } from "./McpConnectionModal";
import { ChatInputBar } from "./ChatInputBar";
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
                ) : message.content && !isStreaming ? (
                    <MarkdownRenderer content={message.content} />
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
    const [toolStatus, setToolStatus] = useState<string | null>(null);

    // ─── Tool Selection State ────────────────────────────────────────
    const [showToolBar, setShowToolBar] = useState(false);
    const [activeBuiltinTools, setActiveBuiltinTools] = useState<string[]>([]);
    const [connectedMcpServers, setConnectedMcpServers] = useState<McpServerConfig[]>([]);
    const [showMcpModal, setShowMcpModal] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [matchingSearchIds, setMatchingSearchIds] = useState<string[]>([]);

    const hasActiveTools = activeBuiltinTools.length > 0 || connectedMcpServers.length > 0;

    const toggleBuiltinTool = useCallback((id: string) => {
        setActiveBuiltinTools(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    }, []);

    const removeMcpServer = useCallback((label: string) => {
        setConnectedMcpServers(prev => prev.filter(s => s.label !== label));
    }, []);

    const handleAddMcpServer = useCallback((config: McpServerConfig) => {
        setConnectedMcpServers(prev => [...prev.filter(s => s.label !== config.label), config]);
        setShowMcpModal(false);
    }, []);

    // Search effect for message content
    useEffect(() => {
        if (!searchTerm.trim()) {
            setMatchingSearchIds([]);
            return;
        }

        const timer = setTimeout(async () => {
            const ids = await chatDb.searchConversations(searchTerm);
            setMatchingSearchIds(ids);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm]);

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
            forceScrollToBottom("auto");
        } else if (chat.messages.length > 0) {
            const timer = setTimeout(() => forceScrollToBottom("smooth"), 50);
            return () => clearTimeout(timer);
        }

        prevActiveId.current = chat.activeConversationId;
    }, [chat.messages, actionCount, chat.activeConversationId]);

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
                    <ChatSidebar
                        conversations={chat.conversations}
                        activeConversationId={chat.activeConversationId}
                        messages={chat.messages}
                        searchTerm={searchTerm}
                        matchingSearchIds={matchingSearchIds}
                        onSearchChange={setSearchTerm}
                        onSelectConversation={chat.selectConversation}
                        onStartNewConversation={chat.startNewConversation}
                        onDeleteConversation={chat.deleteConversation}
                        onClearChat={chat.clearChat}
                    />
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
                                            onClick={() => { setInput(s); }}
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
                        <McpConnectionModal
                            onAdd={handleAddMcpServer}
                            onClose={() => setShowMcpModal(false)}
                        />
                    )}

                    {/* Tools Bar */}
                    {showToolBar && (
                        <ChatToolBar
                            activeBuiltinTools={activeBuiltinTools}
                            connectedMcpServers={connectedMcpServers}
                            onToggleBuiltinTool={toggleBuiltinTool}
                            onRemoveMcpServer={removeMcpServer}
                            onOpenMcpModal={() => setShowMcpModal(true)}
                        />
                    )}

                    {/* Input */}
                    <ChatInputBar
                        input={input}
                        isStreaming={chat.isStreaming}
                        isOpen={isOpen}
                        hasActiveTools={hasActiveTools}
                        activeToolCount={activeBuiltinTools.length + connectedMcpServers.length}
                        showToolBar={showToolBar}
                        onInputChange={setInput}
                        onSend={handleSend}
                        onStop={chat.stopStreaming}
                        onToggleToolBar={() => setShowToolBar(prev => !prev)}
                    />
                </div>
            </div>
        </div>
    );
};
