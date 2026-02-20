import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// ─── OCR Tab Panel ───────────────────────────────────────────────────────────

interface OcrTabPanelProps {
    ocrImage: string | null;
    ocrResult: string | null;
    ocrMarkdownRef: React.Ref<HTMLDivElement>;
    onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onCapture: () => void;
    onAddAsImage: () => void;
    onAddAsText: () => void;
    onClear: () => void;
}

export const OcrTabPanel = ({
    ocrImage, ocrResult, ocrMarkdownRef,
    onUpload, onCapture, onAddAsImage, onAddAsText, onClear,
}: OcrTabPanelProps) => (
    <div style={{ maxWidth: "480px" }}>
        {/* Image Source Options */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
            <label
                style={{
                    flex: 1, padding: "10px 14px", borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: "#e4e4e7", cursor: "pointer", fontSize: "13px",
                    textAlign: "center", transition: "all 0.2s ease",
                }}
            >
                📁 Upload Image
                <input type="file" accept="image/*" onChange={onUpload} style={{ display: "none" }} />
            </label>
            <button
                onClick={onCapture}
                style={{
                    flex: 1, padding: "10px 14px", borderRadius: "8px",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                    color: "#e4e4e7", cursor: "pointer", fontSize: "13px",
                }}
            >
                📷 Capture Canvas
            </button>
        </div>

        {/* Image Preview */}
        {ocrImage && (
            <div style={{ marginBottom: "14px" }}>
                <img
                    src={ocrImage}
                    alt="OCR preview"
                    style={{
                        width: "100%", maxHeight: "150px", objectFit: "contain",
                        borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.15)",
                    }}
                />
            </div>
        )}

        {/* OCR Result */}
        {ocrResult && (
            <div style={{ marginBottom: "14px" }}>
                <label style={{
                    display: "block", marginBottom: "6px",
                    color: "#e4e4e7", fontSize: "13px", fontWeight: 500,
                }}>
                    Extracted Text:
                </label>
                <div
                    ref={ocrMarkdownRef}
                    style={{
                        padding: "12px 14px", borderRadius: "8px",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        backgroundColor: "#ffffff", color: "#1a1a1f",
                        fontSize: "14px", maxHeight: "200px", overflowY: "auto",
                        lineHeight: "1.6", minWidth: "500px",
                    }}
                    className="ocr-markdown-result"
                >
                    <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {ocrResult}
                    </ReactMarkdown>
                </div>
                <button
                    onClick={onAddAsImage}
                    style={{
                        marginTop: "8px", padding: "8px 14px", borderRadius: "6px",
                        border: "none", backgroundColor: "#10b981",
                        color: "#fff", cursor: "pointer", fontSize: "12px",
                        fontWeight: 500, marginRight: "8px",
                    }}
                >
                    📷 Add as Image
                </button>
                <button
                    onClick={onAddAsText}
                    style={{
                        marginTop: "8px", padding: "8px 14px", borderRadius: "6px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        backgroundColor: "transparent", color: "#e4e4e7",
                        cursor: "pointer", fontSize: "12px", fontWeight: 500,
                    }}
                >
                    📝 Add as Text
                </button>
                <button
                    onClick={onClear}
                    style={{
                        marginTop: "8px", marginLeft: "8px", padding: "8px 14px",
                        borderRadius: "6px", border: "none",
                        backgroundColor: "#ef4444", color: "#fff",
                        cursor: "pointer", fontSize: "12px", fontWeight: 500,
                    }}
                >
                    🗑️ Clear
                </button>
            </div>
        )}
    </div>
);
