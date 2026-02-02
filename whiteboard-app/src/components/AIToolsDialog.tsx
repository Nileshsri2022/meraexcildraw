import React, { useState, useCallback } from "react";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

interface AIToolsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
    initialTab?: "diagram" | "image";
}

const AI_SERVER_URL = "http://localhost:3002";

export const AIToolsDialog: React.FC<AIToolsDialogProps> = ({
    isOpen,
    onClose,
    excalidrawAPI,
    initialTab = "diagram"
}) => {
    const [activeTab, setActiveTab] = useState<"diagram" | "image">(initialTab);
    const [prompt, setPrompt] = useState("");
    const [style, setStyle] = useState("flowchart");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Generate Diagram
    const generateDiagram = useCallback(async () => {
        if (!prompt.trim()) {
            setError("Please enter a description");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${AI_SERVER_URL}/api/ai/generate-diagram`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, style }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            const diagramCode = data.code || data.mermaid;

            const { elements: skeletonElements } = await parseMermaidToExcalidraw(diagramCode);
            const excalidrawElements = convertToExcalidrawElements(skeletonElements);

            if (excalidrawAPI) {
                const currentElements = excalidrawAPI.getSceneElements();
                excalidrawAPI.updateScene({
                    elements: [...currentElements, ...excalidrawElements],
                });
                excalidrawAPI.scrollToContent(excalidrawElements, { fitToContent: true });
            }

            onClose();
            setPrompt("");
        } catch (err) {
            console.error("Diagram generation error:", err);
            setError(err instanceof Error ? err.message : "Failed to generate diagram");
        } finally {
            setLoading(false);
        }
    }, [prompt, style, excalidrawAPI, onClose]);

    // Generate Image
    const generateImage = useCallback(async () => {
        if (!prompt.trim()) {
            setError("Please enter a description");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${AI_SERVER_URL}/api/ai/generate-image`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prompt, width: 512, height: 512 }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            if (excalidrawAPI && data.imageUrl) {
                const fileId = `ai-image-${Date.now()}`;

                await excalidrawAPI.addFiles([{
                    id: fileId as any,
                    dataURL: data.imageUrl as any,
                    mimeType: "image/png",
                    created: Date.now(),
                }]);

                const imageElement = {
                    type: "image" as const,
                    id: `ai-image-element-${Date.now()}`,
                    x: 100,
                    y: 100,
                    width: data.width || 512,
                    height: data.height || 512,
                    angle: 0,
                    strokeColor: "transparent",
                    backgroundColor: "transparent",
                    fillStyle: "solid" as const,
                    strokeWidth: 0,
                    strokeStyle: "solid" as const,
                    roughness: 0,
                    opacity: 100,
                    groupIds: [] as string[],
                    frameId: null,
                    index: "a0" as any,
                    roundness: null,
                    seed: Math.floor(Math.random() * 100000),
                    version: 1,
                    versionNonce: Math.floor(Math.random() * 100000),
                    isDeleted: false,
                    boundElements: null,
                    updated: Date.now(),
                    link: null,
                    locked: false,
                    fileId: fileId as any,
                    status: "saved" as const,
                    scale: [1, 1] as [number, number],
                };

                const currentElements = excalidrawAPI.getSceneElements();
                excalidrawAPI.updateScene({
                    elements: [...currentElements, imageElement as any],
                });
                excalidrawAPI.scrollToContent([imageElement as any], { fitToContent: true });
            }

            onClose();
            setPrompt("");
        } catch (err) {
            console.error("Image generation error:", err);
            setError(err instanceof Error ? err.message : "Failed to generate image");
        } finally {
            setLoading(false);
        }
    }, [prompt, excalidrawAPI, onClose]);

    const handleGenerate = activeTab === "diagram" ? generateDiagram : generateImage;

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: "#232329",
                    padding: "20px",
                    borderRadius: "12px",
                    width: "400px",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    boxShadow: "0 12px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={{
                    margin: "0 0 16px 0",
                    color: "#e4e4e7",
                    fontSize: "18px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                }}>
                    <span>✨</span> AI Generation Tools
                </h2>

                {/* Tabs */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                    <button
                        onClick={() => { setActiveTab("diagram"); setError(null); }}
                        style={{
                            flex: 1,
                            padding: "10px 14px",
                            borderRadius: "8px",
                            border: activeTab === "diagram"
                                ? "2px solid #6366f1"
                                : "1px solid rgba(255, 255, 255, 0.15)",
                            backgroundColor: activeTab === "diagram"
                                ? "rgba(99, 102, 241, 0.15)"
                                : "transparent",
                            color: activeTab === "diagram" ? "#a5b4fc" : "#9ca3af",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500,
                            transition: "all 0.2s ease",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                        }}
                    >
                        <span style={{ fontSize: "14px" }}></span> Diagram
                    </button>
                    <button
                        onClick={() => { setActiveTab("image"); setError(null); }}
                        style={{
                            flex: 1,
                            padding: "10px 14px",
                            borderRadius: "8px",
                            border: activeTab === "image"
                                ? "2px solid #6366f1"
                                : "1px solid rgba(255, 255, 255, 0.15)",
                            backgroundColor: activeTab === "image"
                                ? "rgba(99, 102, 241, 0.15)"
                                : "transparent",
                            color: activeTab === "image" ? "#a5b4fc" : "#9ca3af",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500,
                            transition: "all 0.2s ease",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                        }}
                    >
                        <span style={{ fontSize: "14px" }}></span> Image
                    </button>
                </div>

                {/* Prompt Input */}
                <div style={{ marginBottom: "14px" }}>
                    <label style={{
                        display: "block",
                        marginBottom: "6px",
                        color: "#e4e4e7",
                        fontSize: "13px",
                        fontWeight: 500
                    }}>
                        {activeTab === "diagram" ? "Describe your diagram:" : "Describe the image:"}
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder={activeTab === "diagram"
                            ? "e.g., User login authentication flow with error handling"
                            : "e.g., A futuristic city skyline at sunset with flying cars"
                        }
                        style={{
                            width: "100%",
                            minHeight: "70px",
                            padding: "10px 12px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            color: "#e4e4e7",
                            fontSize: "13px",
                            lineHeight: "1.5",
                            resize: "vertical",
                            boxSizing: "border-box",
                            outline: "none",
                            fontFamily: "inherit",
                            transition: "border-color 0.2s ease",
                        }}
                        onFocus={(e) => {
                            e.currentTarget.style.borderColor = "#6366f1";
                        }}
                        onBlur={(e) => {
                            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
                        }}
                    />
                </div>

                {/* Style selector (only for diagrams) */}
                {activeTab === "diagram" && (
                    <div style={{ marginBottom: "14px" }}>
                        <label style={{
                            display: "block",
                            marginBottom: "6px",
                            color: "#e4e4e7",
                            fontSize: "13px",
                            fontWeight: 500
                        }}>
                            Diagram Type:
                        </label>
                        <select
                            value={style}
                            onChange={(e) => setStyle(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                backgroundColor: "#2d2d35",
                                color: "#e4e4e7",
                                fontSize: "13px",
                                cursor: "pointer",
                                outline: "none",
                                appearance: "none",
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                backgroundRepeat: "no-repeat",
                                backgroundPosition: "right 12px center",
                            }}
                        >
                            <option value="flowchart">Flowchart</option>
                            <option value="sequence">Sequence Diagram</option>
                            <option value="class">Class Diagram</option>
                            <option value="mindmap">Mind Map</option>
                        </select>
                    </div>
                )}

                {/* Error Display */}
                {error && (
                    <div style={{
                        padding: "10px 12px",
                        marginBottom: "14px",
                        backgroundColor: "rgba(239, 68, 68, 0.15)",
                        border: "1px solid rgba(239, 68, 68, 0.4)",
                        borderRadius: "8px",
                        color: "#fca5a5",
                        fontSize: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                    }}>
                        <span>⚠️</span> {error}
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "10px 18px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255, 255, 255, 0.15)",
                            backgroundColor: "rgba(255, 255, 255, 0.05)",
                            color: "#e4e4e7",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 500,
                            transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.05)";
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={loading || !prompt.trim()}
                        style={{
                            padding: "10px 18px",
                            borderRadius: "8px",
                            border: "none",
                            backgroundColor: loading || !prompt.trim()
                                ? "rgba(99, 102, 241, 0.3)"
                                : "#6366f1",
                            color: loading || !prompt.trim() ? "#9ca3af" : "#ffffff",
                            cursor: loading || !prompt.trim() ? "not-allowed" : "pointer",
                            fontSize: "13px",
                            fontWeight: 500,
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                            transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                            if (!loading && prompt.trim()) {
                                e.currentTarget.style.backgroundColor = "#4f46e5";
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!loading && prompt.trim()) {
                                e.currentTarget.style.backgroundColor = "#6366f1";
                            }
                        }}
                    >
                        {loading ? (
                            <>
                                <span className="spinner" style={{
                                    width: "14px",
                                    height: "14px",
                                    border: "2px solid transparent",
                                    borderTopColor: "#9ca3af",
                                    borderRadius: "50%",
                                    animation: "spin 0.8s linear infinite",
                                }}></span>
                                Generating...
                            </>
                        ) : (
                            <>✨ Generate</>
                        )}
                    </button>
                </div>

                {/* Footer */}
                <div style={{
                    marginTop: "20px",
                    fontSize: "12px",
                    color: "#6b7280",
                    textAlign: "center"
                }}>
                    {activeTab === "diagram"
                        ? "Powered by Mermaid-to-Excalidraw"
                        : "Powered by Stable Diffusion XL • May take 10-30 seconds"
                    }
                </div>
            </div>
        </div>
    );
};

