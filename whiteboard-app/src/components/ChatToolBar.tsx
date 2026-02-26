/**
 * ChatToolBar — Built-in tools and MCP server selection pills.
 * Extracted from ChatPanel for Single Responsibility (Clean Code §8).
 */
import React, { memo } from "react";
import type { McpServerConfig } from "../hooks/useCanvasChat";

/** Tool definition for rendering pills */
interface BuiltinToolDef {
    id: string;
    label: string;
    icon: string;
    description: string;
}

const BUILTIN_TOOLS: BuiltinToolDef[] = [
    { id: "web_search", label: "Web Search", icon: "🔍", description: "Search the web for current information" },
    { id: "code_interpreter", label: "Code Exec", icon: "💻", description: "Execute Python code for calculations" },
    { id: "visit_website", label: "Visit URL", icon: "🌐", description: "Visit a URL and extract its content" },
    { id: "browser_automation", label: "Browser Auto", icon: "🤖", description: "Automate browser interactions" },
    { id: "wolfram_alpha", label: "Wolfram", icon: "🧮", description: "Math, science, and data queries via Wolfram Alpha" },
];

interface ChatToolBarProps {
    activeBuiltinTools: string[];
    connectedMcpServers: McpServerConfig[];
    onToggleBuiltinTool: (id: string) => void;
    onRemoveMcpServer: (label: string) => void;
    onOpenMcpModal: () => void;
}

export const ChatToolBar: React.FC<ChatToolBarProps> = memo(({
    activeBuiltinTools,
    connectedMcpServers,
    onToggleBuiltinTool,
    onRemoveMcpServer,
    onOpenMcpModal,
}) => {
    return (
        <div className="chat-tools-bar">
            <div className="chat-tools-section">
                <span className="chat-tools-label">Built-in Tools</span>
                <div className="chat-tools-pills">
                    {BUILTIN_TOOLS.map(tool => (
                        <button
                            key={tool.id}
                            className={`chat-tool-pill ${activeBuiltinTools.includes(tool.id) ? 'chat-tool-pill--active' : ''}`}
                            onClick={() => onToggleBuiltinTool(tool.id)}
                            title={tool.description}
                        >
                            {tool.icon} {tool.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="chat-tools-section">
                <span className="chat-tools-label">MCP Servers</span>
                <div className="chat-tools-pills">
                    {connectedMcpServers.map(srv => (
                        <button
                            key={srv.label}
                            className="chat-tool-pill chat-tool-pill--mcp chat-tool-pill--active"
                            title={`${srv.description || srv.url}`}
                            style={{ cursor: "default" }}
                        >
                            <span className="mcp-connected-dot" />
                            {srv.label}
                            <span
                                className="mcp-remove"
                                onClick={(e) => { e.stopPropagation(); onRemoveMcpServer(srv.label); }}
                                title="Disconnect"
                                style={{ cursor: "pointer" }}
                            >×</span>
                        </button>
                    ))}
                    <button
                        className="chat-tool-pill chat-tool-pill--add"
                        onClick={onOpenMcpModal}
                        title="Connect an MCP server"
                    >
                        + Add MCP
                    </button>
                </div>
            </div>
        </div>
    );
});

ChatToolBar.displayName = "ChatToolBar";
