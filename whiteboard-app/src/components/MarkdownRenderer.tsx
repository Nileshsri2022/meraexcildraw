/**
 * MarkdownRenderer — renders markdown as React components.
 *
 * Uses react-markdown with remark-gfm for tables, strikethrough, etc.
 * and react-syntax-highlighter for code blocks.
 *
 * This replaces dangerouslySetInnerHTML for safe, responsive rendering.
 */
import React, { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownRendererProps {
    content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({ content }) => {
    return (
        <div className="chat-rendered">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    // ─── Tables ─────────────────────────────────────────
                    table: ({ children, ...props }) => (
                        <div className="table-wrapper">
                            <table {...props}>{children}</table>
                        </div>
                    ),

                    // ─── Code blocks ────────────────────────────────────
                    code: ({ className, children, ...props }) => {
                        const match = /language-(\w+)/.exec(className || "");
                        const codeStr = String(children).replace(/\n$/, "");

                        // Block code (has language or is multiline)
                        if (match || codeStr.includes("\n")) {
                            return (
                                <SyntaxHighlighter
                                    style={oneDark}
                                    language={match?.[1] || "text"}
                                    PreTag="div"
                                    customStyle={{
                                        margin: "8px 0",
                                        borderRadius: "8px",
                                        fontSize: "12px",
                                        lineHeight: "1.5",
                                        padding: "12px 14px",
                                    }}
                                    wrapLongLines
                                >
                                    {codeStr}
                                </SyntaxHighlighter>
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
                }}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});

MarkdownRenderer.displayName = "MarkdownRenderer";
export default MarkdownRenderer;
