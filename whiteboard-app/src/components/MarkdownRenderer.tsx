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
import React, { memo, useEffect, useRef, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { PrismLight as SyntaxHighlighter } from "react-syntax-highlighter/dist/esm/prism-light";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";

SyntaxHighlighter.registerLanguage("tsx", tsx);
SyntaxHighlighter.registerLanguage("typescript", typescript);
SyntaxHighlighter.registerLanguage("javascript", javascript);
SyntaxHighlighter.registerLanguage("python", python);
SyntaxHighlighter.registerLanguage("bash", bash);
SyntaxHighlighter.registerLanguage("json", json);
SyntaxHighlighter.registerLanguage("css", css);
SyntaxHighlighter.registerLanguage("markdown", markdown);
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

// ─── Static component overrides (hoisted — never re-created) ─────────────────

const MdTable = ({ children, ref: _ref, node: _node, ...props }: any) => (
    <div className="table-wrapper">
        <table {...props}>{children}</table>
    </div>
);

const MdLink = ({ children, href, ref: _ref, node: _node, ...props }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
        {children}
    </a>
);

const MdP = ({ children }: any) => <p>{children}</p>;
const MdH1 = ({ children }: any) => <h2>{children}</h2>;
const MdH2 = ({ children }: any) => <h2>{children}</h2>;
const MdH3 = ({ children }: any) => <h3>{children}</h3>;
const MdH4 = ({ children }: any) => <h4>{children}</h4>;
const MdUl = ({ children }: any) => <ul>{children}</ul>;
const MdOl = ({ children }: any) => <ol>{children}</ol>;
const MdLi = ({ children }: any) => <li>{children}</li>;
const MdBlockquote = ({ children }: any) => (
    <blockquote className="chat-blockquote">{children}</blockquote>
);
const MdHr = () => <hr className="chat-hr" />;
const MdImg = ({ src, alt, ref: _ref, node: _node, ...props }: any) => (
    <img src={src} alt={alt || ""} className="chat-image" loading="lazy" {...props} />
);

const CODE_BLOCK_STYLE = {
    margin: 0,
    borderRadius: "0 0 8px 8px",
    fontSize: "12px",
    lineHeight: "1.5",
    padding: "12px 14px",
} as const;

// ─── CodeBlock — memoized per block, avoids rebuilding the whole list ────────

interface CodeBlockProps {
    lang: string;
    code: string;
    index: number;
    copiedBlock: number | null;
    onCopy: (code: string, index: number) => void;
}

const CodeBlock: React.FC<CodeBlockProps> = memo(({ lang, code, index, copiedBlock, onCopy }) => (
    <div className="code-block-wrapper">
        <div className="code-block-header">
            <span className="code-block-lang">{lang || "text"}</span>
            <button
                className={`code-block-copy ${copiedBlock === index ? "code-block-copy--copied" : ""}`}
                onClick={() => onCopy(code, index)}
            >
                {copiedBlock === index ? "Copied!" : "Copy"}
            </button>
        </div>
        <SyntaxHighlighter
            style={oneDark}
            language={lang || "text"}
            PreTag="div"
            customStyle={CODE_BLOCK_STYLE}
            wrapLongLines
        >
            {code}
        </SyntaxHighlighter>
    </div>
));

CodeBlock.displayName = "CodeBlock";

// ─── Remark / Rehype plugin arrays (hoisted — stable references) ─────────────

const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

// ─── Main Markdown Renderer ──────────────────────────────────────────────────

interface MarkdownRendererProps {
    content: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({ content }) => {
    const [copiedBlock, setCopiedBlock] = useState<number | null>(null);
    const codeBlockIndexRef = useRef(0);

    const handleCopyCode = useCallback((code: string, index: number) => {
        navigator.clipboard.writeText(code).then(() => {
            setCopiedBlock(index);
            setTimeout(() => setCopiedBlock(null), 2000);
        });
    }, []);

    // Reset code block counter on each render
    codeBlockIndexRef.current = 0;

    const components = useMemo(() => ({
        table: MdTable,
        code: ({ className, children, ...props }: any) => {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match?.[1] || "";
            const codeStr = String(children).replace(/\n$/, "");

            if (lang === "mermaid") {
                return <MermaidDiagram chart={codeStr} />;
            }

            if (match || codeStr.includes("\n")) {
                const currentIndex = codeBlockIndexRef.current++;
                return (
                    <CodeBlock
                        lang={lang}
                        code={codeStr}
                        index={currentIndex}
                        copiedBlock={copiedBlock}
                        onCopy={handleCopyCode}
                    />
                );
            }

            return <code className="chat-inline-code">{children}</code>;
        },
        a: MdLink,
        p: MdP,
        h1: MdH1,
        h2: MdH2,
        h3: MdH3,
        h4: MdH4,
        ul: MdUl,
        ol: MdOl,
        li: MdLi,
        blockquote: MdBlockquote,
        hr: MdHr,
        img: MdImg,
    }), [copiedBlock, handleCopyCode]);

    return (
        <div className="chat-rendered">
            <ReactMarkdown
                remarkPlugins={REMARK_PLUGINS}
                rehypePlugins={REHYPE_PLUGINS}
                components={components}
            >
                {content}
            </ReactMarkdown>
        </div>
    );
});

MarkdownRenderer.displayName = "MarkdownRenderer";
export default MarkdownRenderer;
