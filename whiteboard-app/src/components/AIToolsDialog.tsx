import React, { useState, useCallback, useRef, useEffect } from "react";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import html2canvas from "html2canvas";
import { normalizeLatexWithMathJax, extractTextFromOCRWithMathJax } from "../utils/mathJaxParser";
import { addImageToCanvas } from "../utils/addImageToCanvas";
import { saveAIResult } from "../data/LocalStorage";
import type { AIHistoryType } from "../data/LocalStorage";
import { useBlockExcalidrawKeys } from "../hooks/useBlockExcalidrawKeys";
import { useAIHistory } from "../hooks/useAIHistory";
import { useTTS } from "../hooks/useTTS";

interface AIToolsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
    initialTab?: "diagram" | "image" | "ocr" | "tts" | "sketch";
}

const AI_SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3002";

// ─── Extracted UI Components ───
import { IconDiagram, IconImage, IconSketch, IconOCR, IconTTS, IconSparkle, IconHistory } from "./Icons";
import { FormLabel, FormTextarea, FormSelect, FormSlider, FormInput, InfoBanner } from "./FormComponents";
import { PromptSection, ImageSettings, SketchSettings, DiagramSettings } from "./TabPanels";
import { TtsTabPanel, HistoryTabPanel } from "./TtsHistoryPanels";
import { OcrTabPanel } from "./OcrTabPanel";

export const AIToolsDialog: React.FC<AIToolsDialogProps> = ({
    isOpen,
    onClose,
    excalidrawAPI,
    initialTab = "diagram"
}) => {
    const [activeTab, setActiveTab] = useState<"diagram" | "image" | "ocr" | "tts" | "sketch" | "history">(initialTab as any);
    const { history: filteredHistory, allHistory, filter: historyFilter, setFilter: setHistoryFilter, deleteEntry: deleteHistoryEntry, clearAll: clearAllHistory } = useAIHistory(activeTab === "history" && isOpen);
    const [prompt, setPrompt] = useState("");
    const [style, setStyle] = useState("flowchart");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [ocrImage, setOcrImage] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<string | null>(null);
    const ocrMarkdownRef = useRef<HTMLDivElement>(null);

    // Sketch-to-Image (ControlNet) state
    const [sketchPipeline, setSketchPipeline] = useState("scribble");
    const [sketchResolution, setSketchResolution] = useState(512);
    const [sketchSteps, setSketchSteps] = useState(20);
    const [sketchGuidance, setSketchGuidance] = useState(9);
    const [sketchSeed, setSketchSeed] = useState(0);
    const [sketchPreprocessor, setSketchPreprocessor] = useState("HED");

    // Image Generation (Z-Image-Turbo) state
    const [imgWidth, setImgWidth] = useState(1024);
    const [imgHeight, setImgHeight] = useState(1024);
    const [imgSteps, setImgSteps] = useState(9);
    const [imgSeed, setImgSeed] = useState(42);
    const [imgRandomSeed, setImgRandomSeed] = useState(true);

    // Text-to-Speech (extracted hook)
    const tts = useTTS(activeTab === "tts" && isOpen, setLoading, setError);

    const generateSketchImage = useCallback(async () => {
        if (!prompt.trim()) {
            setError("Please enter a description");
            return;
        }

        if (!excalidrawAPI) {
            setError("Canvas not ready");
            return;
        }

        const elements = excalidrawAPI.getSceneElements();
        if (!elements || elements.length === 0) {
            setError("Draw something on the canvas first!");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // ─── Step 1: Export clean sketch from Excalidraw ───
            // Compute bounding box of all drawn elements
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const el of elements) {
                if ((el as any).isDeleted) continue;
                const ex = (el as any).x ?? 0;
                const ey = (el as any).y ?? 0;
                const ew = (el as any).width ?? 0;
                const eh = (el as any).height ?? 0;
                minX = Math.min(minX, ex);
                minY = Math.min(minY, ey);
                maxX = Math.max(maxX, ex + ew);
                maxY = Math.max(maxY, ey + eh);
            }

            const padding = 40; // px padding around elements
            minX -= padding;
            minY -= padding;
            maxX += padding;
            maxY += padding;

            const appState = excalidrawAPI.getAppState();
            const zoom = appState.zoom?.value ?? 1;
            const scrollX = appState.scrollX ?? 0;
            const scrollY = appState.scrollY ?? 0;

            // Get the DOM canvas
            const rawCanvas = document.querySelector(".excalidraw__canvas") as HTMLCanvasElement
                || document.querySelector(".excalidraw canvas") as HTMLCanvasElement;
            if (!rawCanvas) throw new Error("Could not capture canvas");

            // Convert scene coordinates to canvas pixel coordinates
            const cropX = (minX + scrollX) * zoom;
            const cropY = (minY + scrollY) * zoom;
            const cropW = (maxX - minX) * zoom;
            const cropH = (maxY - minY) * zoom;

            // Create a cropped canvas scaled to fit within 512x512
            const targetSize = 512;
            const aspect = cropW / cropH;
            let outW: number, outH: number;
            if (aspect >= 1) {
                outW = targetSize;
                outH = Math.round(targetSize / aspect);
            } else {
                outH = targetSize;
                outW = Math.round(targetSize * aspect);
            }

            const croppedCanvas = document.createElement("canvas");
            croppedCanvas.width = outW;
            croppedCanvas.height = outH;
            const ctx = croppedCanvas.getContext("2d")!;

            // White background
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, outW, outH);

            // Draw the cropped region onto the output canvas
            ctx.drawImage(
                rawCanvas,
                Math.max(0, cropX), Math.max(0, cropY), Math.max(1, cropW), Math.max(1, cropH),
                0, 0, outW, outH,
            );

            // Detect if we're in dark mode by sampling corner pixels
            const sampleData = ctx.getImageData(0, 0, 1, 1).data;
            const cornerBrightness = (sampleData[0] + sampleData[1] + sampleData[2]) / 3;
            const isDarkMode = cornerBrightness < 128;

            // Binarize for ControlNet scribble (MUST be black lines on white background)
            const imgData = ctx.getImageData(0, 0, outW, outH);
            const dataArr = imgData.data;
            for (let i = 0; i < dataArr.length; i += 4) {
                const gray = (dataArr[i] + dataArr[i + 1] + dataArr[i + 2]) / 3;
                let v: number;
                if (isDarkMode) {
                    // Dark mode: light pixels are strokes → make them BLACK, dark background → WHITE
                    v = gray > 100 ? 0 : 255;
                } else {
                    // Light mode: dark pixels are strokes → keep them BLACK, light background → WHITE
                    v = gray > 200 ? 255 : 0;
                }
                dataArr[i] = dataArr[i + 1] = dataArr[i + 2] = v;
                dataArr[i + 3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);

            const imageBase64 = croppedCanvas.toDataURL("image/png");


            // ─── Step 2: Send sketch + prompt to ControlNet ───
            const response = await fetch(`${AI_SERVER_URL}/api/ai/sketch-to-image`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt,
                    imageBase64,
                    width: 512,
                    height: 512,
                    pipeline: sketchPipeline,
                    image_resolution: sketchResolution,
                    num_steps: sketchSteps,
                    guidance_scale: sketchGuidance,
                    seed: sketchSeed,
                    preprocessor_name: sketchPreprocessor,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            // ─── Step 3: Add generated image to canvas (next to the sketch) ───
            if (data.imageUrl) {
                const imgW = data.width || 512;
                const imgH = data.height || 512;

                // Place the generated image to the RIGHT of the original sketch
                await addImageToCanvas(excalidrawAPI, data.imageUrl, {
                    x: maxX + 50,
                    y: minY,
                    width: imgW,
                    height: imgH,
                    idPrefix: "sketch-image",
                });
                excalidrawAPI.scrollToContent(undefined, { fitToContent: true });
            }

            // ── Save to history ──
            if (data.imageUrl) {
                saveAIResult({ type: "sketch", prompt, result: data.imageUrl, thumbnail: data.imageUrl, metadata: { pipeline: sketchPipeline, resolution: sketchResolution } }).catch(() => { });
            }

            onClose();
            setPrompt("");
        } catch (err) {
            console.error("Sketch-to-image generation error:", err);
            setError(err instanceof Error ? err.message : "Failed to generate image from sketch");
        } finally {
            setLoading(false);
        }
    }, [prompt, excalidrawAPI, onClose, sketchPipeline, sketchResolution, sketchSteps, sketchGuidance, sketchSeed, sketchPreprocessor]);

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

            // ── Save to history ──
            saveAIResult({ type: "diagram", prompt, result: diagramCode, metadata: { style } }).catch(() => { });

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
                body: JSON.stringify({
                    prompt,
                    width: imgWidth,
                    height: imgHeight,
                    num_inference_steps: imgSteps,
                    seed: imgSeed,
                    randomize_seed: imgRandomSeed,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            if (excalidrawAPI && data.imageUrl) {
                await addImageToCanvas(excalidrawAPI, data.imageUrl, {
                    width: data.width || imgWidth,
                    height: data.height || imgHeight,
                    idPrefix: "ai-image",
                });
            }

            // ── Save to history ──
            if (data.imageUrl) {
                saveAIResult({ type: "image", prompt, result: data.imageUrl, thumbnail: data.imageUrl, metadata: { width: imgWidth, height: imgHeight, steps: imgSteps, seed: data.seed } }).catch(() => { });
            }

            onClose();
            setPrompt("");
        } catch (err) {
            console.error("Image generation error:", err);
            setError(err instanceof Error ? err.message : "Failed to generate image");
        } finally {
            setLoading(false);
        }
    }, [prompt, excalidrawAPI, onClose, imgWidth, imgHeight, imgSteps, imgSeed, imgRandomSeed]);

    // Handle OCR image upload
    const handleOcrImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                setOcrImage(reader.result as string);
                setOcrResult(null);
                setError(null);
            };
            reader.readAsDataURL(file);
        }
    }, []);

    // Capture canvas as image for OCR
    const captureCanvas = useCallback(() => {
        if (!excalidrawAPI) return;

        const canvas = document.querySelector('.excalidraw canvas') as HTMLCanvasElement;
        if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            setOcrImage(dataUrl);
            setOcrResult(null);
            setError(null);
        }
    }, [excalidrawAPI]);

    // Perform OCR
    const performOcr = useCallback(async () => {
        if (!ocrImage) {
            setError("Please upload or capture an image first");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${AI_SERVER_URL}/api/ai/ocr`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageBase64: ocrImage }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            // Debug: Check raw OCR output and line breaks


            // Normalize LaTeX using MathJax-style normalization
            let processedText = data.text || "No text detected";
            processedText = normalizeLatexWithMathJax(processedText);

            setOcrResult(processedText);

            // ── Save to history ──
            saveAIResult({ type: "ocr", prompt: "Canvas / Uploaded Image", result: processedText, thumbnail: ocrImage ?? undefined }).catch(() => { });
        } catch (err) {
            console.error("OCR error:", err);
            setError(err instanceof Error ? err.message : "Failed to perform OCR");
        } finally {
            setLoading(false);
        }
    }, [ocrImage]);

    // Add OCR result as rendered image to canvas
    const addTextToCanvas = useCallback(async () => {
        if (!ocrResult || !excalidrawAPI || !ocrMarkdownRef.current) return;

        try {
            const element = ocrMarkdownRef.current;

            // Temporarily remove scroll constraints to capture full content
            const originalMaxHeight = element.style.maxHeight;
            const originalOverflow = element.style.overflowY;
            element.style.maxHeight = 'none';
            element.style.overflowY = 'visible';

            // Capture the rendered markdown as an image
            const canvas = await html2canvas(element, {
                backgroundColor: '#ffffff',
                scale: 2, // Higher quality
                scrollX: 0,
                scrollY: 0,
                windowWidth: element.scrollWidth,
                windowHeight: element.scrollHeight,
            });

            // Restore original constraints
            element.style.maxHeight = originalMaxHeight;
            element.style.overflowY = originalOverflow;


            const dataUrl = canvas.toDataURL('image/png');

            // Small delay to ensure file is fully registered
            await new Promise(resolve => setTimeout(resolve, 100));

            await addImageToCanvas(excalidrawAPI, dataUrl, {
                width: canvas.width / 2, // Compensate for scale: 2
                height: canvas.height / 2,
                idPrefix: "ocr-rendered",
            });

            onClose();
            setOcrImage(null);
            setOcrResult(null);
        } catch (err) {
            setError("Failed to render markdown as image");
        }
    }, [ocrResult, excalidrawAPI, onClose]);

    // Add OCR result as text elements to canvas
    const addOcrAsText = useCallback(() => {
        if (!ocrResult || !excalidrawAPI) return;

        const processedText = extractTextFromOCRWithMathJax(ocrResult);

        const wrapText = (text: string, maxWidth: number): string[] => {
            const words = text.split(' ');
            const lines: string[] = [];
            let cur = '';
            for (const word of words) {
                if ((cur + ' ' + word).trim().length <= maxWidth) {
                    cur = (cur + ' ' + word).trim();
                } else {
                    if (cur) lines.push(cur);
                    cur = word;
                }
            }
            if (cur) lines.push(cur);
            return lines;
        };

        const rawLines = processedText.split('\n');
        const allLines: string[] = [];
        for (const line of rawLines) {
            if (!line.trim()) continue;
            allLines.push(...(line.length > 60 ? wrapText(line.trim(), 60) : [line.trim()]));
        }

        const fontSize = 16;
        const lineSpacing = fontSize * 1.5;
        const groupId = `ocr-group-${Date.now()}`;

        const textElements = allLines.map((line, index) =>
            convertToExcalidrawElements([{
                type: "text", x: 100, y: 100 + (index * lineSpacing),
                text: line, fontSize, fontFamily: 1,
            }])
        ).flat().map(el => ({ ...el, groupIds: [groupId] }));

        const currentElements = excalidrawAPI.getSceneElements();
        excalidrawAPI.updateScene({ elements: [...currentElements, ...textElements] });
        excalidrawAPI.scrollToContent(textElements, { fitToContent: true });
        onClose();
    }, [ocrResult, excalidrawAPI, onClose]);

    const handleGenerate =
        activeTab === "diagram"
            ? generateDiagram
            : activeTab === "image"
                ? generateImage
                : activeTab === "sketch"
                    ? generateSketchImage
                    : performOcr;

    // Sidebar toggle state
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // Block Excalidraw keyboard shortcuts while dialog is open
    useBlockExcalidrawKeys(isOpen);

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
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .ai-dialog-scrollbar::-webkit-scrollbar { width: 6px; }
                .ai-dialog-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .ai-dialog-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
                .ai-dialog-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
            <div
                style={{
                    backgroundColor: "#232329",
                    borderRadius: "14px",
                    width: "min(680px, 90vw)",
                    height: "min(520px, 80vh)",
                    display: "flex",
                    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)",
                    overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ─── Left Sidebar ─── */}
                {sidebarOpen && (
                    <div style={{
                        width: "180px",
                        minWidth: "180px",
                        backgroundColor: "#1e1e24",
                        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
                        padding: "16px 0",
                        display: "flex",
                        flexDirection: "column",
                    }}>
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            margin: "0 0 16px 0",
                            padding: "0 16px",
                        }}>
                            <h2 style={{
                                margin: 0,
                                fontSize: "15px",
                                fontWeight: 600,
                                color: "#e4e4e7",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}>
                                <IconSparkle /> AI Tools
                            </h2>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                style={{
                                    width: "26px",
                                    height: "26px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    backgroundColor: "transparent",
                                    color: "#6b7280",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#e4e4e7"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#6b7280"; }}
                            >
                                ✕
                            </button>
                        </div>

                        <nav style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px" }}>
                            {([
                                { id: "diagram" as const, label: "Diagram", icon: <IconDiagram /> },
                                { id: "image" as const, label: "Image", icon: <IconImage /> },
                                { id: "sketch" as const, label: "Sketch", icon: <IconSketch /> },
                                { id: "ocr" as const, label: "OCR", icon: <IconOCR /> },
                                { id: "tts" as const, label: "TTS", icon: <IconTTS /> },
                            ]).map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id); setError(null); }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        border: "none",
                                        backgroundColor: activeTab === tab.id ? "rgba(99, 102, 241, 0.15)" : "transparent",
                                        color: activeTab === tab.id ? "#a5b4fc" : "#9ca3af",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                        fontWeight: activeTab === tab.id ? 600 : 400,
                                        transition: "all 0.15s ease",
                                        width: "100%",
                                        textAlign: "left" as const,
                                    }}
                                >
                                    <span style={{ display: "flex", alignItems: "center" }}>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                            {/* Divider */}
                            <div style={{ height: "1px", backgroundColor: "rgba(255,255,255,0.07)", margin: "6px 4px" }} />
                            {/* History Tab */}
                            <button
                                onClick={() => { setActiveTab("history"); setError(null); }}
                                style={{
                                    display: "flex", alignItems: "center", gap: "10px",
                                    padding: "8px 12px", borderRadius: "8px", border: "none",
                                    backgroundColor: activeTab === "history" ? "rgba(99, 102, 241, 0.15)" : "transparent",
                                    color: activeTab === "history" ? "#a5b4fc" : "#9ca3af",
                                    cursor: "pointer", fontSize: "13px",
                                    fontWeight: activeTab === "history" ? 600 : 400,
                                    transition: "all 0.15s ease", width: "100%", textAlign: "left" as const,
                                }}
                            >
                                <span style={{ display: "flex", alignItems: "center" }}><IconHistory /></span>
                                History
                            </button>
                        </nav>
                    </div>
                )}

                {/* ─── Right Content Panel ─── */}
                <div
                    className="ai-dialog-scrollbar"
                    style={{
                        flex: 1,
                        padding: "24px 32px",
                        overflowY: "auto",
                    }}
                >
                    {/* Section header */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "20px",
                    }}>
                        {!sidebarOpen && (
                            <button
                                onClick={() => setSidebarOpen(true)}
                                style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    backgroundColor: "transparent",
                                    color: "#9ca3af",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.15s ease",
                                    flexShrink: 0,
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#e4e4e7"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#9ca3af"; }}
                                title="Show sidebar"
                            >
                                ☰
                            </button>
                        )}
                        <h3 style={{
                            margin: 0,
                            fontSize: "16px",
                            fontWeight: 600,
                            color: "#e4e4e7",
                            textTransform: "capitalize" as const,
                        }}>
                            {activeTab === "ocr" ? "OCR" : activeTab === "tts" ? "Text to Speech" : activeTab}
                        </h3>
                    </div>

                    {(activeTab === "diagram" || activeTab === "image" || activeTab === "sketch") && (
                        <PromptSection activeTab={activeTab} prompt={prompt} setPrompt={setPrompt} />
                    )}

                    {activeTab === "image" && (
                        <ImageSettings
                            imgWidth={imgWidth} setImgWidth={setImgWidth}
                            imgHeight={imgHeight} setImgHeight={setImgHeight}
                            imgSteps={imgSteps} setImgSteps={setImgSteps}
                            imgSeed={imgSeed} setImgSeed={setImgSeed}
                            imgRandomSeed={imgRandomSeed} setImgRandomSeed={setImgRandomSeed}
                        />
                    )}

                    {activeTab === "sketch" && (
                        <SketchSettings
                            sketchPipeline={sketchPipeline} setSketchPipeline={setSketchPipeline}
                            sketchPreprocessor={sketchPreprocessor} setSketchPreprocessor={setSketchPreprocessor}
                            sketchResolution={sketchResolution} setSketchResolution={setSketchResolution}
                            sketchSteps={sketchSteps} setSketchSteps={setSketchSteps}
                            sketchGuidance={sketchGuidance} setSketchGuidance={setSketchGuidance}
                            sketchSeed={sketchSeed} setSketchSeed={setSketchSeed}
                        />
                    )}

                    {activeTab === "ocr" && (
                        <OcrTabPanel
                            ocrImage={ocrImage}
                            ocrResult={ocrResult}
                            ocrMarkdownRef={ocrMarkdownRef}
                            onUpload={handleOcrImageUpload}
                            onCapture={captureCanvas}
                            onAddAsImage={addTextToCanvas}
                            onAddAsText={addOcrAsText}
                            onClear={() => { setOcrImage(null); setOcrResult(null); setError(null); }}
                        />
                    )}

                    {activeTab === "tts" && (
                        <TtsTabPanel tts={tts} loading={loading} />
                    )}

                    {activeTab === "history" && (
                        <HistoryTabPanel
                            filteredHistory={filteredHistory}
                            allHistory={allHistory}
                            historyFilter={historyFilter}
                            setHistoryFilter={setHistoryFilter}
                            deleteEntry={deleteHistoryEntry}
                            clearAll={clearAllHistory}
                        />
                    )}

                    {/* Style selector (only for diagrams) */}
                    {activeTab === "diagram" && (
                        <DiagramSettings style={style} setStyle={setStyle} />
                    )}

                    {/* Error Display */}
                    {activeTab !== "history" && error && (
                        <div style={{
                            padding: "10px 12px",
                            marginBottom: "14px",
                            maxWidth: "480px",
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

                    {/* Action Buttons - Not shown for tts or history tabs */}
                    {activeTab !== "tts" && activeTab !== "history" && (
                        <div style={{ display: "flex", gap: "10px", maxWidth: "480px" }}>
                            <button
                                onClick={handleGenerate}
                                disabled={loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim())}
                                style={{
                                    flex: 1,
                                    padding: "12px 18px",
                                    borderRadius: "10px",
                                    border: "none",
                                    backgroundColor: loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim())
                                        ? "rgba(255, 255, 255, 0.06)"
                                        : "rgba(255, 255, 255, 0.08)",
                                    color: loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim()) ? "#6b7280" : "#e4e4e7",
                                    cursor: loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim()) ? "not-allowed" : "pointer",
                                    fontSize: "14px",
                                    fontWeight: 500,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "8px",
                                    transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                    const isDisabled = activeTab === "ocr" ? !ocrImage : !prompt.trim();
                                    if (!loading && !isDisabled) {
                                        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    const isDisabled = activeTab === "ocr" ? !ocrImage : !prompt.trim();
                                    if (!loading && !isDisabled) {
                                        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                                    }
                                }}
                            >
                                {loading ? (
                                    <>
                                        <span style={{
                                            width: "16px",
                                            height: "16px",
                                            border: "2px solid transparent",
                                            borderTopColor: "currentColor",
                                            borderRadius: "50%",
                                            animation: "spin 0.8s linear infinite",
                                            display: "inline-block",
                                        }} />
                                        {activeTab === "ocr" ? "Extracting..." : "Generating..."}
                                    </>
                                ) : (
                                    <>
                                        {activeTab === "ocr" ? "📝 Extract Text" : "◆ Generate " + (activeTab === "diagram" ? "Diagram" : activeTab === "image" ? "Image" : "from Sketch")}
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Footer */}
                    <div style={{
                        marginTop: "20px",
                        fontSize: "12px",
                        color: "#6b7280",
                        textAlign: "center",
                        maxWidth: "480px",
                    }}>
                        {activeTab === "diagram" && "Powered by Kimi-K2 + Mermaid-to-Excalidraw"}
                        {activeTab === "image" && "Powered by Z-Image-Turbo • Ultra-fast generation"}
                        {activeTab === "sketch" && "Powered by ControlNet v1.1 • May take 30-60s on cold start"}
                        {activeTab === "ocr" && "Powered by PaddleOCR-VL"}
                        {activeTab === "tts" && "Powered by ElevenLabs Text-to-Speech"}
                    </div>
                </div>
            </div>
        </div>
    );
};

