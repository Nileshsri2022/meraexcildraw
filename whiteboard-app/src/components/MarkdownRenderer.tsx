/**
 * MarkdownRenderer — renders markdown as React components.
 *
 * Capabilities:
 *   ✅ GFM tables, strikethrough, task lists    (remark-gfm)
 *   ✅ Math/LaTeX: $inline$ and $$block$$       (remark-math + rehype-katex)
 *   ✅ Syntax-highlighted code blocks           (react-syntax-highlighter)
 *   ✅ Mermaid diagrams                          (mermaid)
 *   ✅ Links, lists, blockquotes, headings, hr
 *
 * This replaces dangerouslySetInnerHTML for safe, responsive rendering.
 */
import React, { memo, useEffect, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import "katex/dist/katex.min.css";

// ─── Mermaid Diagram Component ───────────────────────────────────────────────

const MermaidDiagram: React.FC<{ chart: string }> = memo(({ chart }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState<string>("");
    const [error, setError] = useState<string>("");

    useEffect(() => {
        let cancelled = false;

        const renderMermaid = async () => {
            try {
                const mermaid = (await import("mermaid")).default;
                mermaid.initialize({
                    startOnLoad: false,
                    theme: "dark",
                    themeVariables: {
                        primaryColor: "#8b5cf6",
                        primaryTextColor: "#e2e8f0",
                        primaryBorderColor: "#6d28d9",
                        lineColor: "#64748b",
                        secondaryColor: "#1e293b",
                        tertiaryColor: "#0f172a",
                        fontFamily: "'Outfit', sans-serif",
                        fontSize: "13px",
                    },
                    flowchart: { curve: "basis", htmlLabels: true },
                    sequence: { actorMargin: 50, messageMargin: 40 },
                });

                const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
                const { svg: rendered } = await mermaid.render(id, chart.trim());

                if (!cancelled) {
                    setSvg(rendered);
                    setError("");
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err instanceof Error ? err.message : "Failed to render diagram");
                    setSvg("");
                }
            }
        };

        renderMermaid();
        return () => { cancelled = true; };
    }, [chart]);

    if (error) {
        return (
            <div className="mermaid-error">
                <span>⚠️ Mermaid diagram error</span>
                <pre>{error}</pre>
                <details>
                    <summary>Source</summary>
                    <pre>{chart}</pre>
                </details>
            </div>
        );
    }

    if (!svg) {
        return (
            <div className="mermaid-loading">
                <span>Loading diagram...</span>
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            className="mermaid-container"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
});

MermaidDiagram.displayName = "MermaidDiagram";

// ─── Main Markdown Renderer ──────────────────────────────────────────────────

interface MarkdownRendererProps {
    content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({ content }) => {
    const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
    let codeBlockIndex = 0;

    const handleCopyCode = useCallback((code: string, index: number) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedBlock(index);
            setTimeout(() => setCopiedBlock(null), 2000);
        });
    }, []);

    return (
        <div className="chat-rendered">
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex]}
                components={{
                    // ─── Tables ─────────────────────────────────────────
                    table: ({ children, ...props }) => (
                        <div className="table-wrapper">
                            <table {...props}>{children}</table>
                        </div>
                    ),

                    // ─── Code blocks + Mermaid ──────────────────────────
                    code: ({ className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || "");
                        const lang = match?.[1] || "";
                        const codeStr = String(children).replace(/\n$/, "");

                        // Mermaid diagrams
                        if (lang === "mermaid") {
                            return <MermaidDiagram chart={codeStr} />;
                        }

                        // Block code (has language or is multiline)
                        if (match || codeStr.includes("\n")) {
                            const currentIndex = codeBlockIndex++;
                            return (
                                <div className="code-block-wrapper">
                                    <div className="code-block-header">
                                        <span className="code-block-lang">{lang || "text"}</span>
                                        <button
                                            className={`code-block-copy ${copiedBlock === currentIndex ? "code-block-copy--copied" : ""}`}
                                            onClick={() => handleCopyCode(codeStr, currentIndex)}
                                        >
                                            {copiedBlock === currentIndex ? "Copied!" : "Copy"}
                                        </button>
                                    </div>
                                    <SyntaxHighlighter
                                        style={oneDark}
                                        language={lang || "text"}
                                        PreTag="div"
                                        customStyle={{
                                            margin: 0,
                                            borderRadius: "0 0 8px 8px",
                                            fontSize: "12px",
                                            lineHeight: "1.5",
                                            padding: "12px 14px",
                                        }}
                                        wrapLongLines
                                    >
                                        {codeStr}
                                    </SyntaxHighlighter>
                                </div>
                            );
                        }

                        // Inline code
                        return (
                            <code className="chat-inline-code" {...props}>
                                {children}
                            </code>
                        );
                    },

                    // ─── Links ──────────────────────────────────────────
                    a: ({ children, href, ...props }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
                            {children}
                        </a>
                    ),

                    // ─── Paragraphs ─────────────────────────────────────
                    p: ({ children }) => <p>{children}</p>,

                    // ─── Headings ────────────────────────────────────────
                    h1: ({ children }) => <h2>{children}</h2>,
                    h2: ({ children }) => <h2>{children}</h2>,
                    h3: ({ children }) => <h3>{children}</h3>,
                    h4: ({ children }) => <h4>{children}</h4>,

                    // ─── Lists ──────────────────────────────────────────
                    ul: ({ children }) => <ul>{children}</ul>,
                    ol: ({ children }) => <ol>{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,

                    // ─── Blockquote ─────────────────────────────────────
                    blockquote: ({ children }) => (
                        <blockquote className="chat-blockquote">{children}</blockquote>
                    ),

                    // ─── Horizontal rule ────────────────────────────────
                    hr: () => <hr className="chat-hr" />,

                    // ─── Images ─────────────────────────────────────────
                    img: ({ src, alt, ...props }) => (
                        <img
                            src={src}
                            alt={alt || ""}
                            className="chat-image"
                            loading="lazy"
                            {...props}
                        />
                    ),
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});

MarkdownRenderer.displayName = "MarkdownRenderer";
export default MarkdownRenderer;
