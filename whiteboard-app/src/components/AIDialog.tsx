import React, { useState, useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";

interface AIDialogProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

const DIAGRAM_STYLES = [
    { value: "flowchart", label: "Flowchart", example: "user login process" },
    { value: "sequence", label: "Sequence Diagram", example: "API request flow" },
    { value: "class", label: "Class Diagram", example: "User and Order classes" },
    { value: "mindmap", label: "Mind Map", example: "project planning ideas" },
];

const AI_SERVER_URL = "http://localhost:3002";

export const AIDialog: React.FC<AIDialogProps> = ({ isOpen, onClose, excalidrawAPI }) => {
    const [prompt, setPrompt] = useState("");
    const [style, setStyle] = useState("flowchart");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mermaidPreview, setMermaidPreview] = useState<string | null>(null);

    const generateDiagram = useCallback(async () => {
        if (!prompt.trim()) {
            setError("Please enter a description");
            return;
        }

        setLoading(true);
        setError(null);
        setMermaidPreview(null);

        try {
            // Call AI endpoint
            const response = await fetch(`${AI_SERVER_URL}/api/ai/generate-diagram`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, style }),
            });

            if (!response.ok) {
                const data = await response.json();
                console.error("API Error Response:", data);
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            const diagramCode = data.code || data.mermaid;
            setMermaidPreview(diagramCode);

            // Convert Mermaid to Excalidraw elements (works for all diagram types)
            const { elements: skeletonElements } = await parseMermaidToExcalidraw(diagramCode);
            const excalidrawElements = convertToExcalidrawElements(skeletonElements);

            // Add elements to canvas
            if (excalidrawAPI) {
                const currentElements = excalidrawAPI.getSceneElements();
                excalidrawAPI.updateScene({
                    elements: [...currentElements, ...excalidrawElements],
                });

                // Scroll to fit the new elements
                excalidrawAPI.scrollToContent(excalidrawElements, { fitToContent: true });
            }

            // Close dialog on success
            onClose();
            setPrompt("");
            setMermaidPreview(null);
        } catch (err) {
            console.error("AI generation error:", err);
            setError(err instanceof Error ? err.message : "Failed to generate diagram");
        } finally {
            setLoading(false);
        }
    }, [prompt, style, excalidrawAPI, onClose]);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.5)",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                zIndex: 9999,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: "var(--color-surface-high, #fff)",
                    borderRadius: "12px",
                    padding: "24px",
                    width: "500px",
                    maxWidth: "90vw",
                    maxHeight: "80vh",
                    overflow: "auto",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={{ margin: "0 0 16px 0", fontSize: "20px" }}>
                    🤖 Generate Diagram with AI
                </h2>

                <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontWeight: 500 }}>
                        Diagram Type
                    </label>
                    <select
                        value={style}
                        onChange={(e) => setStyle(e.target.value)}
                        style={{
                            width: "100%",
                            padding: "10px",
                            borderRadius: "8px",
                            border: "1px solid var(--color-border, #ccc)",
                            fontSize: "14px",
                        }}
                    >
                        {DIAGRAM_STYLES.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label} (e.g., {s.example})
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "8px", fontWeight: 500 }}>
                        Describe your diagram
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Create a flowchart for user registration with email verification"
                        style={{
                            width: "100%",
                            minHeight: "100px",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid var(--color-border, #ccc)",
                            fontSize: "14px",
                            resize: "vertical",
                            fontFamily: "inherit",
                        }}
                    />
                </div>

                {error && (
                    <div
                        style={{
                            padding: "12px",
                            backgroundColor: "#fee",
                            color: "#c00",
                            borderRadius: "8px",
                            marginBottom: "16px",
                            fontSize: "14px",
                        }}
                    >
                        ❌ {error}
                    </div>
                )}

                {mermaidPreview && (
                    <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", marginBottom: "8px", fontWeight: 500 }}>
                            Generated Mermaid Code
                        </label>
                        <pre
                            style={{
                                backgroundColor: "#f5f5f5",
                                padding: "12px",
                                borderRadius: "8px",
                                fontSize: "12px",
                                overflow: "auto",
                                maxHeight: "150px",
                            }}
                        >
                            {mermaidPreview}
                        </pre>
                    </div>
                )}

                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "10px 20px",
                            borderRadius: "8px",
                            border: "1px solid var(--color-border, #ccc)",
                            backgroundColor: "transparent",
                            cursor: "pointer",
                            fontSize: "14px",
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={generateDiagram}
                        disabled={loading || !prompt.trim()}
                        style={{
                            padding: "10px 20px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: loading ? "#ccc" : "#6366f1",
                            color: "#fff",
                            cursor: loading ? "wait" : "pointer",
                            fontSize: "14px",
                            fontWeight: 500,
                        }}
                    >
                        {loading ? "Generating..." : "✨ Generate"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AIDialog;
