import React, { useState, useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

interface ImageGeneratorDialogProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

const AI_SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3002";

export const ImageGeneratorDialog: React.FC<ImageGeneratorDialogProps> = ({ isOpen, onClose, excalidrawAPI }) => {
    const [prompt, setPrompt] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const generateImage = useCallback(async () => {
        if (!prompt.trim()) {
            setError("Please enter a description");
            return;
        }

        setLoading(true);
        setError(null);
        setPreviewUrl(null);

        try {
            const response = await fetch(`${AI_SERVER_URL}/api/ai/generate-image`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    width: 512,
                    height: 512
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();
            setPreviewUrl(data.imageUrl);

            // Add image to Excalidraw canvas
            if (excalidrawAPI && data.imageUrl) {
                const fileId = `ai-image-${Date.now()}`;

                // Add the image file
                await excalidrawAPI.addFiles([{
                    id: fileId as any,
                    dataURL: data.imageUrl as any,
                    mimeType: "image/png",
                    created: Date.now(),
                }]);

                // Create image element with all required properties
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

                // Scroll to the new image
                excalidrawAPI.scrollToContent([imageElement as any], { fitToContent: true });
            }

            // Close dialog on success
            onClose();
            setPrompt("");
            setPreviewUrl(null);
        } catch (err) {
            console.error("Image generation error:", err);
            setError(err instanceof Error ? err.message : "Failed to generate image");
        } finally {
            setLoading(false);
        }
    }, [prompt, excalidrawAPI, onClose]);

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
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    backgroundColor: "#1e1e2e",
                    padding: "24px",
                    borderRadius: "12px",
                    width: "450px",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <h2 style={{ margin: "0 0 20px 0", color: "#cdd6f4", fontSize: "20px" }}>
                    🎨 Generate Image with AI
                </h2>

                <div style={{ marginBottom: "16px" }}>
                    <label style={{ display: "block", marginBottom: "6px", color: "#a6adc8", fontSize: "14px" }}>
                        Describe the image you want to create:
                    </label>
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., A futuristic city skyline at sunset with flying cars"
                        style={{
                            width: "100%",
                            minHeight: "100px",
                            padding: "12px",
                            borderRadius: "8px",
                            border: "1px solid #45475a",
                            backgroundColor: "#313244",
                            color: "#cdd6f4",
                            fontSize: "14px",
                            resize: "vertical",
                            boxSizing: "border-box",
                        }}
                    />
                </div>

                {error && (
                    <div style={{
                        padding: "10px",
                        marginBottom: "16px",
                        backgroundColor: "#f38ba820",
                        border: "1px solid #f38ba8",
                        borderRadius: "6px",
                        color: "#f38ba8",
                        fontSize: "13px",
                    }}>
                        {error}
                    </div>
                )}

                {previewUrl && (
                    <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", marginBottom: "6px", color: "#a6adc8", fontSize: "14px" }}>
                            Preview:
                        </label>
                        <img
                            src={previewUrl}
                            alt="Generated"
                            style={{
                                width: "100%",
                                borderRadius: "8px",
                                border: "1px solid #45475a",
                            }}
                        />
                    </div>
                )}

                <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "10px 20px",
                            borderRadius: "6px",
                            border: "1px solid #45475a",
                            backgroundColor: "transparent",
                            color: "#cdd6f4",
                            cursor: "pointer",
                            fontSize: "14px",
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={generateImage}
                        disabled={loading || !prompt.trim()}
                        style={{
                            padding: "10px 20px",
                            borderRadius: "6px",
                            border: "none",
                            backgroundColor: loading ? "#45475a" : "#89b4fa",
                            color: loading ? "#6c7086" : "#1e1e2e",
                            cursor: loading ? "not-allowed" : "pointer",
                            fontSize: "14px",
                            fontWeight: "bold",
                        }}
                    >
                        {loading ? "🔄 Generating..." : "✨ Generate"}
                    </button>
                </div>

                <div style={{ marginTop: "16px", fontSize: "12px", color: "#6c7086", textAlign: "center" }}>
                    Powered by FLUX.1-dev • May take 10-30 seconds
                </div>
            </div>
        </div>
    );
};
