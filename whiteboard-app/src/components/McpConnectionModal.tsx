/**
 * McpConnectionModal — Add/test MCP server connections.
 * Extracted from ChatPanel for Single Responsibility (Clean Code §8).
 */
import React, { useState, useCallback, memo } from "react";
import type { McpServerConfig } from "../hooks/useCanvasChat";

const CHAT_SERVICE_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:3003";

/** Quick-fill helpers for common MCP providers */
const MCP_HELPERS: Record<string, { url: string; label?: string; headerKey?: string }> = {
    "huggingface": { url: "https://huggingface.co/mcp", label: "huggingface" },
    "hf": { url: "https://huggingface.co/mcp", label: "huggingface" },
    "zapier": { url: "https://mcp.zapier.com/<APIKEY>/mcp", label: "zapier" },
    "parallel": { url: "https://mcp.parallel.ai/v1beta/search_mcp/", label: "parallel_search", headerKey: "x-api-key" },
    "firecrawl.dev": { url: "https://mcp.firecrawl.dev/<APIKEY>/v2/mcp", label: "firecrawl" },
    "mcp.stripe.com": { url: "https://mcp.stripe.com", label: "stripe" },
};

interface McpFormState {
    label: string;
    url: string;
    apiKey: string;
    description: string;
    headerKey: string;
}

const EMPTY_FORM: McpFormState = { label: "", url: "", apiKey: "", description: "", headerKey: "" };

interface McpConnectionModalProps {
    onAdd: (config: McpServerConfig) => void;
    onClose: () => void;
}

export const McpConnectionModal: React.FC<McpConnectionModalProps> = memo(({ onAdd, onClose }) => {
    const [form, setForm] = useState<McpFormState>(EMPTY_FORM);
    const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
    const [testError, setTestError] = useState("");

    /** Build the final server URL, replacing <APIKEY> if present */
    const buildServerUrl = useCallback((rawUrl: string, apiKey: string): string => {
        if (apiKey && rawUrl.includes("<APIKEY>")) {
            return rawUrl.replace("<APIKEY>", apiKey);
        }
        return rawUrl;
    }, []);

    /** Build auth headers based on apiKey and headerKey */
    const buildHeaders = useCallback((serverUrl: string, apiKey: string, headerKey: string): Record<string, string> => {
        if (!apiKey || serverUrl.includes(apiKey)) return {};
        const key = headerKey || "Authorization";
        const value = headerKey ? apiKey : `Bearer ${apiKey}`;
        return { [key]: value };
    }, []);

    const handleTest = useCallback(async () => {
        if (!form.label.trim() || !form.url.trim()) return;
        setTestStatus("testing");
        setTestError("");

        const serverUrl = buildServerUrl(form.url, form.apiKey);

        try {
            const resp = await fetch(`${CHAT_SERVICE_URL}/chat/test-mcp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    label: form.label,
                    url: serverUrl,
                    headers: buildHeaders(serverUrl, form.apiKey, form.headerKey),
                }),
            });
            const data = await resp.json();
            if (data.ok) {
                setTestStatus("ok");
            } else {
                setTestStatus("error");
                setTestError(data.error?.slice(0, 150) || "Connection failed");
            }
        } catch (e) {
            setTestStatus("error");
            setTestError(e instanceof Error ? e.message : "Network error");
        }
    }, [form, buildServerUrl, buildHeaders]);

    const handleAdd = useCallback(() => {
        if (!form.label.trim() || !form.url.trim()) return;

        const serverUrl = buildServerUrl(form.url, form.apiKey);

        const config: McpServerConfig = {
            label: form.label.trim(),
            url: serverUrl,
            description: form.description.trim(),
            headers: buildHeaders(serverUrl, form.apiKey, form.headerKey),
        };
        onAdd(config);
    }, [form, buildServerUrl, buildHeaders, onAdd]);

    const handleUrlChange = useCallback((rawValue: string) => {
        let val = rawValue;

        for (const [domain, helper] of Object.entries(MCP_HELPERS)) {
            if (val.trim() === domain || (val.includes(domain) && !val.includes("<APIKEY>") && val.length < domain.length + 10)) {
                val = helper.url;
                if (helper.label && !form.label.trim()) {
                    setForm(p => ({ ...p, label: helper.label! }));
                }
                if (helper.headerKey) {
                    setForm(p => ({ ...p, headerKey: helper.headerKey! }));
                }
                break;
            }
        }

        setForm(p => ({ ...p, url: val }));
    }, [form.label]);

    return (
        <div className="mcp-modal-overlay" onClick={onClose}>
            <div className="mcp-modal" onClick={e => e.stopPropagation()}>
                <div className="mcp-modal-header">
                    <h3>Connect MCP Server</h3>
                    <button className="mcp-modal-close" onClick={onClose}>×</button>
                </div>
                <div className="mcp-modal-body">
                    <label className="mcp-field">
                        <span>Label *</span>
                        <input
                            value={form.label}
                            onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                            placeholder="e.g. firecrawl"
                        />
                    </label>
                    <label className="mcp-field">
                        <span>Server URL * <small>(Use {"<APIKEY>"} as a placeholder if needed)</small></span>
                        <input
                            value={form.url}
                            onChange={e => handleUrlChange(e.target.value)}
                            placeholder="https://example.com/<APIKEY>/v1/sse"
                        />
                    </label>
                    <label className="mcp-field">
                        <span>API Key <small>(replaces {'<APIKEY>'} in URL or sent as Bearer token)</small></span>
                        <input
                            type="password"
                            value={form.apiKey}
                            onChange={e => setForm(p => ({ ...p, apiKey: e.target.value }))}
                            placeholder="fc-..."
                        />
                    </label>
                    <label className="mcp-field">
                        <span>Description</span>
                        <input
                            value={form.description}
                            onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                            placeholder="Web scraping and content extraction"
                        />
                    </label>

                    <div className="mcp-test-row">
                        <button
                            className="mcp-test-btn"
                            onClick={handleTest}
                            disabled={!form.label.trim() || !form.url.trim() || testStatus === "testing"}
                        >
                            {testStatus === "testing" ? "Testing..." : "Test Connection"}
                        </button>
                        {testStatus === "ok" && <span className="mcp-status mcp-status--ok">✓ Connected</span>}
                        {testStatus === "error" && <span className="mcp-status mcp-status--error" title={testError}>✗ Failed</span>}
                    </div>
                </div>
                <div className="mcp-modal-footer">
                    <button className="mcp-cancel-btn" onClick={onClose}>Cancel</button>
                    <button
                        className="mcp-add-btn"
                        onClick={handleAdd}
                        disabled={!form.label.trim() || !form.url.trim()}
                    >
                        Add Server
                    </button>
                </div>
            </div>
        </div>
    );
});

McpConnectionModal.displayName = "McpConnectionModal";
