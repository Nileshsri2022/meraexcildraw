/**
 * ChatPanel — AI Canvas Chat Assistant sidebar.
 *
 * A premium sliding panel with streaming AI responses,
 * server-side rendered HTML, and canvas-aware conversation.
 *
 * Canvas actions from the backend are executed automatically
 * via the useCanvasActions hook — no parsing needed.
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useCanvasChat } from "../hooks/useCanvasChat";
import type { ChatMessage, McpServerConfig } from "../hooks/useCanvasChat";
import { useCanvasActions } from "../hooks/useCanvasActions";
import { useAIGeneration } from "../hooks/useAIGeneration";
import { executeToolAction } from "../utils/executeToolAction";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

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
                    <div className="chat-rendered" dangerouslySetInnerHTML={{ __html: message.html }} />
                ) : message.content ? (
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
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ isOpen, onClose, excalidrawAPI }) => {
    const chat = useCanvasChat();
    const canvasActions = useCanvasActions(excalidrawAPI);
    const [input, setInput] = useState("");
    const [actionCount, setActionCount] = useState(0);
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

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [chat.messages, actionCount]);

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
    );
};
