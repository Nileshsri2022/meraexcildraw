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
import { saveAIResult, getAIHistory, deleteAIHistoryEntry, clearAIHistory } from "../data/LocalStorage";
import type { AIHistoryEntry, AIHistoryType } from "../data/LocalStorage";

interface AIToolsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
    initialTab?: "diagram" | "image" | "ocr" | "tts" | "sketch";
}

const AI_SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3002";

// ─── Reusable Icon Components (module-scope to avoid re-render remounts) ───

const IconProps = { fill: "none" as const, stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const IconDiagram = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 17.5h7M17.5 14v7" /></svg>
);

const IconImage = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
);

const IconSketch = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
);

const IconOCR = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
);

const IconTTS = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 010 7.07" /><path d="M19.07 4.93a10 10 0 010 14.14" /></svg>
);

const IconSparkle = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" /></svg>
);

const IconHistory = ({ size = 16 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" {...IconProps}><polyline points="12 8 12 12 14 14" /><path d="M3.05 11a9 9 0 1 0 .5-4M3 3v5h5" /></svg>
);

// ─── Reusable Form Components (module-scope to preserve focus across re-renders) ───

const FormLabel = ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor} style={{
        display: "block",
        marginBottom: "6px",
        color: "#e4e4e7",
        fontSize: "13px",
        fontWeight: 500,
    }}>
        {children}
    </label>
);

const FormTextarea = ({ value, onChange, placeholder }: {
    value: string;
    onChange: (val: string) => void;
    placeholder: string;
}) => (
    <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
            width: "100%",
            maxWidth: "480px",
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
        onFocus={(e) => { e.currentTarget.style.borderColor = "#6366f1"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)"; }}
    />
);

const FormSelect = ({ value, onChange, children }: {
    value: string;
    onChange: (val: string) => void;
    children: React.ReactNode;
}) => (
    <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
            width: "100%",
            maxWidth: "480px",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            backgroundColor: "#2d2d35",
            color: "#e4e4e7",
            fontSize: "13px",
            cursor: "pointer",
            outline: "none",
            boxSizing: "border-box",
        }}
    >
        {children}
    </select>
);

const FormSlider = ({ label, value, onChange, min, max, step, accentColor = "#6366f1", hint }: {
    label: string;
    value: number;
    onChange: (val: number) => void;
    min: number;
    max: number;
    step: number;
    accentColor?: string;
    hint?: string;
}) => (
    <div style={{ marginBottom: "12px" }}>
        <label style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "6px",
            color: "#e4e4e7",
            fontSize: "12px",
            fontWeight: 500,
        }}>
            <span>{label}</span>
            <span style={{ color: accentColor }}>{value}{label.toLowerCase().includes("resolution") || label.toLowerCase().includes("height") || label.toLowerCase().includes("width") ? "px" : ""}</span>
        </label>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{ width: "100%", maxWidth: "480px", accentColor }}
        />
        {hint && <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>{hint}</div>}
    </div>
);

const FormInput = ({ type = "text", value, onChange, disabled, ...rest }: {
    type?: string;
    value: string | number;
    onChange: (val: string) => void;
    disabled?: boolean;
    min?: number;
    max?: number;
    placeholder?: string;
}) => (
    <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        min={rest.min}
        max={rest.max}
        placeholder={rest.placeholder}
        style={{
            width: "100%",
            maxWidth: "480px",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            backgroundColor: disabled ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)",
            color: disabled ? "#6b7280" : "#e4e4e7",
            fontSize: "13px",
            outline: "none",
            boxSizing: "border-box" as const,
            transition: "all 0.2s ease",
            cursor: disabled ? "not-allowed" : "text",
        }}
    />
);

const InfoBanner = ({ color, children }: { color: "indigo" | "amber"; children: React.ReactNode }) => {
    const colors = color === "amber"
        ? { bg: "rgba(234, 179, 8, 0.1)", border: "rgba(234, 179, 8, 0.2)", text: "#fbbf24" }
        : { bg: "rgba(99, 102, 241, 0.1)", border: "rgba(99, 102, 241, 0.2)", text: "#a5b4fc" };
    return (
        <div style={{
            padding: "10px 12px",
            borderRadius: "8px",
            backgroundColor: colors.bg,
            border: `1px solid ${colors.border}`,
            marginBottom: "14px",
            fontSize: "12px",
            color: colors.text,
            lineHeight: "1.5",
            maxWidth: "480px",
        }}>
            {children}
        </div>
    );
};

export const AIToolsDialog: React.FC<AIToolsDialogProps> = ({
    isOpen,
    onClose,
    excalidrawAPI,
    initialTab = "diagram"
}) => {
    const [activeTab, setActiveTab] = useState<"diagram" | "image" | "ocr" | "tts" | "sketch" | "history">(initialTab as any);
    const [history, setHistory] = useState<AIHistoryEntry[]>([]);
    const [historyFilter, setHistoryFilter] = useState<AIHistoryType | "all">("all");
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

    // Text-to-Speech state
    const [ttsText, setTtsText] = useState<string>("");
    const [ttsAudio, setTtsAudio] = useState<string | null>(null);
    const [ttsVoice, setTtsVoice] = useState<string>(""); // Will be set after fetching voices
    const [ttsVoices, setTtsVoices] = useState<Array<{ id: string, name: string, category: string }>>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

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
            console.log(`[Sketch] Cropped & binarized sketch: ${outW}x${outH}, darkMode=${isDarkMode}`);

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
                const fileId = `sketch-image-${Date.now()}`;
                const imgW = data.width || 512;
                const imgH = data.height || 512;

                // Place the generated image to the RIGHT of the original sketch
                const imageX = maxX + 50; // 50px gap to the right of sketch
                const imageY = minY; // Align top with the sketch

                await excalidrawAPI.addFiles([
                    {
                        id: fileId as any,
                        dataURL: data.imageUrl as any,
                        mimeType: "image/png",
                        created: Date.now(),
                    },
                ]);

                const imageElement = {
                    type: "image" as const,
                    id: `sketch-image-element-${Date.now()}`,
                    x: imageX,
                    y: imageY,
                    width: imgW,
                    height: imgH,
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
                // Scroll to show both the sketch AND the generated image
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
                    width: data.width || imgWidth,
                    height: data.height || imgHeight,
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
            console.log('[OCR] Raw text:', JSON.stringify(data.text));
            console.log('[OCR] Has newlines:', data.text?.includes('\n'));

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
            const fileId = `ocr-rendered-${Date.now()}`;

            console.log(`[OCR] Adding file with ID: ${fileId}, canvas size: ${canvas.width}x${canvas.height}`);

            // Add the image file first and wait for it to be registered
            await excalidrawAPI.addFiles([{
                id: fileId as any,
                dataURL: dataUrl as any,
                mimeType: "image/png",
                created: Date.now(),
            }]);

            // Small delay to ensure file is fully registered
            await new Promise(resolve => setTimeout(resolve, 100));

            console.log(`[OCR] File registered, creating element...`);

            // Create image element - use simple object, not convertToExcalidrawElements
            const imageElement = {
                type: "image" as const,
                id: `ocr-image-${Date.now()}`,
                x: 100,
                y: 100,
                width: canvas.width / 2, // Compensate for scale: 2
                height: canvas.height / 2,
                angle: 0,
                strokeColor: "#000000",
                backgroundColor: "transparent",
                fillStyle: "solid" as const,
                strokeWidth: 1,
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

            console.log(`[OCR] Element created:`, imageElement);

            const currentElements = excalidrawAPI.getSceneElements();
            excalidrawAPI.updateScene({
                elements: [...currentElements, imageElement as any],
            });
            excalidrawAPI.scrollToContent([imageElement as any], { fitToContent: true });

            onClose();
            setOcrImage(null);
            setOcrResult(null);
        } catch (err) {
            console.error("Error rendering markdown to image:", err);
            setError("Failed to render markdown as image");
        }
    }, [ocrResult, excalidrawAPI, onClose]);

    // ===== Text-to-Speech Functions =====

    // Fetch available voices when TTS tab is opened
    useEffect(() => {
        const fetchVoices = async () => {
            if (activeTab === "tts" && isOpen && ttsVoices.length === 0) {
                setLoadingVoices(true);
                try {
                    const response = await fetch(`${AI_SERVER_URL}/api/ai/voices`);
                    if (response.ok) {
                        const data = await response.json();
                        setTtsVoices(data.voices);
                        // Set default voice to first one
                        if (data.voices.length > 0 && !ttsVoice) {
                            setTtsVoice(data.voices[0].id);
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch voices:", err);
                }
                setLoadingVoices(false);
            }
        };
        fetchVoices();
    }, [activeTab, isOpen, ttsVoices.length, ttsVoice]);

    // Auto-read clipboard when TTS tab is opened
    useEffect(() => {
        const readClipboard = async () => {
            if (activeTab === "tts" && isOpen) {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text && text.trim()) {
                        setTtsText(text);
                    }
                } catch (err) {
                    console.log("Clipboard read not available:", err);
                    // Clipboard API might not be available or permission denied
                }
            }
        };
        readClipboard();
    }, [activeTab, isOpen]);

    const speakText = useCallback(async () => {
        if (!ttsText.trim()) {
            setError("Please enter or paste text to speak");
            return;
        }

        setLoading(true);
        setError(null);
        setTtsAudio(null);

        try {
            const response = await fetch(`${AI_SERVER_URL}/api/ai/text-to-speech`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    text: ttsText,
                    voiceId: ttsVoice,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Failed to generate speech");
            }

            const data = await response.json();
            setTtsAudio(data.audio);

            // ── Save to history ──
            saveAIResult({ type: "tts", prompt: ttsText, result: data.audio, metadata: { voiceId: ttsVoice } }).catch(() => { });

            // Auto-play the audio
            if (audioRef.current) {
                audioRef.current.src = data.audio;
                audioRef.current.play();
            }
        } catch (err) {
            console.error("TTS error:", err);
            setError(err instanceof Error ? err.message : "Failed to generate speech");
        } finally {
            setLoading(false);
        }
    }, [ttsText, ttsVoice]);

    const handleGenerate =
        activeTab === "diagram"
            ? generateDiagram
            : activeTab === "image"
                ? generateImage
                : activeTab === "sketch"
                    ? generateSketchImage
                    : performOcr;

    // Load history when switching to history tab
    useEffect(() => {
        if (activeTab === "history" && isOpen) {
            getAIHistory().then(setHistory).catch(() => setHistory([]));
        }
    }, [activeTab, isOpen]);

    // Sidebar toggle state
    const [sidebarOpen, setSidebarOpen] = useState(true);


    // ─── Block Excalidraw keyboard shortcuts while dialog is open ───
    // Excalidraw uses capture-phase document listeners, so we need our own
    // capture-phase listener registered BEFORE theirs to intercept events.
    useEffect(() => {
        if (!isOpen) return;

        const blockKeyboard = (e: KeyboardEvent) => {
            // Allow Escape to close the dialog
            if (e.key === "Escape") return;
            // Stop ALL other handlers from seeing this event
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        // Register on capture phase so it fires before Excalidraw's handlers
        document.addEventListener("keydown", blockKeyboard, true);
        document.addEventListener("keyup", blockKeyboard, true);
        document.addEventListener("keypress", blockKeyboard, true);

        return () => {
            document.removeEventListener("keydown", blockKeyboard, true);
            document.removeEventListener("keyup", blockKeyboard, true);
            document.removeEventListener("keypress", blockKeyboard, true);
        };
    }, [isOpen]);

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
                        <div style={{ marginBottom: "14px", maxWidth: "480px" }}>
                            <FormLabel>
                                {activeTab === "diagram"
                                    ? "Describe your diagram:"
                                    : activeTab === "image"
                                        ? "✨ Your Prompt:"
                                        : "Describe the final image style:"}
                            </FormLabel>
                            <FormTextarea
                                value={prompt}
                                onChange={setPrompt}
                                placeholder={
                                    activeTab === "diagram"
                                        ? "e.g., User login authentication flow with error handling"
                                        : activeTab === "image"
                                            ? "e.g., A futuristic city skyline at sunset with flying cars"
                                            : "e.g., High-quality anime style, vibrant colors, clean lines"
                                }
                            />
                        </div>
                    )}

                    {/* Z-Image-Turbo Advanced Settings */}
                    {activeTab === "image" && (
                        <div style={{ marginBottom: "14px", maxWidth: "480px" }}>
                            <InfoBanner color="amber">
                                ⚡ <strong>Z-Image-Turbo</strong> — Ultra-fast AI image generation. Generate stunning images in just 8 steps.
                            </InfoBanner>

                            {/* Height & Width in a row */}
                            <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                                <div style={{ flex: 1 }}>
                                    <FormSlider label="Height" value={imgHeight} onChange={setImgHeight} min={512} max={2048} step={64} accentColor="#eab308" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <FormSlider label="Width" value={imgWidth} onChange={setImgWidth} min={512} max={2048} step={64} accentColor="#eab308" />
                                </div>
                            </div>

                            <FormSlider label="Inference Steps" value={imgSteps} onChange={setImgSteps} min={1} max={20} step={1} accentColor="#eab308" hint="9 steps = 8 DiT forwards (recommended)" />

                            {/* Seed + Random Seed */}
                            <div style={{ marginBottom: "4px" }}>
                                <div style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: "6px",
                                }}>
                                    <FormLabel>Seed</FormLabel>
                                    <label style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                        cursor: "pointer",
                                        fontSize: "12px",
                                        color: "#9ca3af",
                                    }}>
                                        <input
                                            type="checkbox"
                                            checked={imgRandomSeed}
                                            onChange={(e) => setImgRandomSeed(e.target.checked)}
                                            style={{ accentColor: "#eab308", cursor: "pointer" }}
                                        />
                                        🎲 Random Seed
                                    </label>
                                </div>
                                <FormInput
                                    type="number"
                                    value={imgSeed}
                                    onChange={(v) => setImgSeed(Number(v))}
                                    disabled={imgRandomSeed}
                                    min={0}
                                    max={2147483647}
                                />
                            </div>
                        </div>
                    )}

                    {/* ControlNet Sketch Controls */}
                    {activeTab === "sketch" && (
                        <div style={{ marginBottom: "14px", maxWidth: "480px" }}>
                            <InfoBanner color="indigo">
                                💡 <strong>ControlNet</strong> — Draw a sketch on the canvas, choose a pipeline, then describe what you want. The AI preserves your sketch's structure.
                            </InfoBanner>

                            {/* Pipeline */}
                            <div style={{ marginBottom: "12px" }}>
                                <FormLabel>Pipeline:</FormLabel>
                                <FormSelect value={sketchPipeline} onChange={setSketchPipeline}>
                                    <option value="scribble">✏️ Scribble (rough freehand sketches)</option>
                                    <option value="canny">🔲 Canny (clean edge outlines)</option>
                                    <option value="softedge">🌊 SoftEdge (smooth edges)</option>
                                    <option value="lineart">🖊️ Lineart (clean line drawings)</option>
                                    <option value="depth">📐 Depth (depth-based generation)</option>
                                    <option value="normal">🗺️ Normal Map</option>
                                    <option value="mlsd">📏 MLSD (straight lines / architecture)</option>
                                    <option value="segmentation">🎨 Segmentation (semantic maps)</option>
                                </FormSelect>
                            </div>

                            {/* Preprocessor */}
                            <div style={{ marginBottom: "12px" }}>
                                <FormLabel>Preprocessor:</FormLabel>
                                <FormSelect value={sketchPreprocessor} onChange={setSketchPreprocessor}>
                                    <option value="HED">HED (Soft edges — best for rough sketches)</option>
                                    <option value="None">None (Direct — best for clean line art)</option>
                                </FormSelect>
                            </div>

                            <FormSlider label="Image Resolution" value={sketchResolution} onChange={setSketchResolution} min={256} max={768} step={128} />

                            {/* Steps & Guidance in a row */}
                            <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                                <div style={{ flex: 1 }}>
                                    <FormSlider label="Steps" value={sketchSteps} onChange={setSketchSteps} min={10} max={40} step={5} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <FormSlider label="Guidance" value={sketchGuidance} onChange={setSketchGuidance} min={1} max={20} step={0.5} />
                                </div>
                            </div>

                            {/* Seed */}
                            <div style={{ marginBottom: "4px" }}>
                                <div style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginBottom: "6px",
                                }}>
                                    <FormLabel>Seed</FormLabel>
                                    <button
                                        onClick={() => setSketchSeed(Math.floor(Math.random() * 2147483647))}
                                        style={{
                                            padding: "2px 8px",
                                            borderRadius: "4px",
                                            border: "1px solid rgba(255, 255, 255, 0.15)",
                                            backgroundColor: "transparent",
                                            color: "#9ca3af",
                                            cursor: "pointer",
                                            fontSize: "11px",
                                        }}
                                    >
                                        🎲 Random
                                    </button>
                                </div>
                                <FormInput
                                    type="number"
                                    value={sketchSeed}
                                    onChange={(v) => setSketchSeed(Number(v))}
                                    min={0}
                                    max={2147483647}
                                />
                            </div>
                        </div>
                    )}

                    {/* OCR Tab Content */}
                    {activeTab === "ocr" && (
                        <div style={{ maxWidth: "480px" }}>
                            {/* Image Source Options */}
                            <div style={{ display: "flex", gap: "8px", marginBottom: "14px" }}>
                                <label
                                    style={{
                                        flex: 1,
                                        padding: "10px 14px",
                                        borderRadius: "8px",
                                        border: "1px solid rgba(255, 255, 255, 0.15)",
                                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                                        color: "#e4e4e7",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                        textAlign: "center",
                                        transition: "all 0.2s ease",
                                    }}
                                >
                                    📁 Upload Image
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleOcrImageUpload}
                                        style={{ display: "none" }}
                                    />
                                </label>
                                <button
                                    onClick={captureCanvas}
                                    style={{
                                        flex: 1,
                                        padding: "10px 14px",
                                        borderRadius: "8px",
                                        border: "1px solid rgba(255, 255, 255, 0.15)",
                                        backgroundColor: "rgba(255, 255, 255, 0.05)",
                                        color: "#e4e4e7",
                                        cursor: "pointer",
                                        fontSize: "13px",
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
                                            width: "100%",
                                            maxHeight: "150px",
                                            objectFit: "contain",
                                            borderRadius: "8px",
                                            border: "1px solid rgba(255, 255, 255, 0.15)",
                                        }}
                                    />
                                </div>
                            )}

                            {/* OCR Result */}
                            {ocrResult && (
                                <div style={{ marginBottom: "14px" }}>
                                    <label style={{
                                        display: "block",
                                        marginBottom: "6px",
                                        color: "#e4e4e7",
                                        fontSize: "13px",
                                        fontWeight: 500
                                    }}>
                                        Extracted Text:
                                    </label>
                                    <div
                                        ref={ocrMarkdownRef}
                                        style={{
                                            padding: "12px 14px",
                                            borderRadius: "8px",
                                            border: "1px solid rgba(255, 255, 255, 0.15)",
                                            backgroundColor: "#ffffff",
                                            color: "#1a1a1f",
                                            fontSize: "14px",
                                            maxHeight: "200px",
                                            overflowY: "auto",
                                            lineHeight: "1.6",
                                            minWidth: "500px"
                                        }}
                                        className="ocr-markdown-result"
                                    >
                                        <ReactMarkdown
                                            remarkPlugins={[remarkMath]}
                                            rehypePlugins={[rehypeKatex]}
                                        >
                                            {ocrResult}
                                        </ReactMarkdown>
                                    </div>
                                    <button
                                        onClick={addTextToCanvas}
                                        style={{
                                            marginTop: "8px",
                                            padding: "8px 14px",
                                            borderRadius: "6px",
                                            border: "none",
                                            backgroundColor: "#10b981",
                                            color: "#fff",
                                            cursor: "pointer",
                                            fontSize: "12px",
                                            fontWeight: 500,
                                            marginRight: "8px",
                                        }}
                                    >
                                        📷 Add as Image
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (!ocrResult || !excalidrawAPI) return;

                                            // Use MathJax parser to extract clean text
                                            const processedText = extractTextFromOCRWithMathJax(ocrResult);

                                            // Wrap long lines at ~60 characters
                                            const wrapText = (text: string, maxWidth: number): string[] => {
                                                const words = text.split(' ');
                                                const wrappedLines: string[] = [];
                                                let currentLine = '';

                                                for (const word of words) {
                                                    if ((currentLine + ' ' + word).trim().length <= maxWidth) {
                                                        currentLine = (currentLine + ' ' + word).trim();
                                                    } else {
                                                        if (currentLine) wrappedLines.push(currentLine);
                                                        currentLine = word;
                                                    }
                                                }
                                                if (currentLine) wrappedLines.push(currentLine);
                                                return wrappedLines;
                                            };

                                            // Split by existing newlines, then wrap each long line
                                            const rawLines = processedText.split('\n');
                                            const allLines: string[] = [];
                                            for (const line of rawLines) {
                                                if (line.trim().length === 0) continue;
                                                if (line.length > 60) {
                                                    allLines.push(...wrapText(line.trim(), 60));
                                                } else {
                                                    allLines.push(line.trim());
                                                }
                                            }

                                            const fontSize = 16;
                                            const lineSpacing = fontSize * 1.5;
                                            const groupId = `ocr-group-${Date.now()}`;

                                            const textElements = allLines.map((line, index) =>
                                                convertToExcalidrawElements([{
                                                    type: "text",
                                                    x: 100,
                                                    y: 100 + (index * lineSpacing),
                                                    text: line,
                                                    fontSize: fontSize,
                                                    fontFamily: 1,
                                                }])
                                            ).flat().map(el => ({
                                                ...el,
                                                groupIds: [groupId],
                                            }));

                                            const currentElements = excalidrawAPI.getSceneElements();
                                            excalidrawAPI.updateScene({
                                                elements: [...currentElements, ...textElements],
                                            });
                                            excalidrawAPI.scrollToContent(textElements, { fitToContent: true });
                                            onClose();
                                        }}
                                        style={{
                                            marginTop: "8px",
                                            padding: "8px 14px",
                                            borderRadius: "6px",
                                            border: "1px solid rgba(255,255,255,0.2)",
                                            backgroundColor: "transparent",
                                            color: "#e4e4e7",
                                            cursor: "pointer",
                                            fontSize: "12px",
                                            fontWeight: 500,
                                        }}
                                    >
                                        📝 Add as Text
                                    </button>
                                    <button
                                        onClick={() => {
                                            setOcrImage(null);
                                            setOcrResult(null);
                                            setError(null);
                                        }}
                                        style={{
                                            marginTop: "8px",
                                            marginLeft: "8px",
                                            padding: "8px 14px",
                                            borderRadius: "6px",
                                            border: "none",
                                            backgroundColor: "#ef4444",
                                            color: "#fff",
                                            cursor: "pointer",
                                            fontSize: "12px",
                                            fontWeight: 500,
                                        }}
                                    >
                                        🗑️ Clear
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TTS Tab Content */}
                    {activeTab === "tts" && (
                        <div style={{ marginBottom: "14px", maxWidth: "480px" }}>
                            {/* Hidden audio element for playback */}
                            <audio ref={audioRef} style={{ display: "none" }} />

                            {/* Instructions */}
                            <InfoBanner color="indigo">
                                💡 <strong>Tip:</strong> Copy text from canvas (Ctrl+C), then open this tab. Text will auto-fill.
                            </InfoBanner>

                            {/* Text Input */}
                            <FormLabel>Text to speak:</FormLabel>
                            <FormTextarea
                                value={ttsText}
                                onChange={(val) => setTtsText(val)}
                                placeholder="Enter or paste text here to convert to speech..."
                            />

                            {/* Voice Selector */}
                            <div style={{ marginTop: "12px" }}>
                                <FormLabel>Voice:</FormLabel>
                                <FormSelect
                                    value={ttsVoice}
                                    onChange={(val) => setTtsVoice(val)}
                                >
                                    {loadingVoices ? (
                                        <option>Loading voices...</option>
                                    ) : ttsVoices.length === 0 ? (
                                        <option>No voices available</option>
                                    ) : (
                                        ttsVoices.map((voice) => (
                                            <option key={voice.id} value={voice.id}>
                                                {voice.name} ({voice.category})
                                            </option>
                                        ))
                                    )}
                                </FormSelect>
                            </div>

                            {/* Speak Button */}
                            <button
                                onClick={speakText}
                                disabled={loading || !ttsText.trim()}
                                style={{
                                    marginTop: "14px",
                                    width: "100%",
                                    padding: "12px 20px",
                                    borderRadius: "8px",
                                    border: "none",
                                    backgroundColor: (loading || !ttsText.trim()) ? "#4b5563" : "#10b981",
                                    color: "#ffffff",
                                    cursor: (loading || !ttsText.trim()) ? "not-allowed" : "pointer",
                                    fontSize: "14px",
                                    fontWeight: 500,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "8px",
                                }}
                            >
                                {loading ? (
                                    <>
                                        <span style={{
                                            width: "14px",
                                            height: "14px",
                                            border: "2px solid transparent",
                                            borderTopColor: "#fff",
                                            borderRadius: "50%",
                                            animation: "spin 0.8s linear infinite",
                                        }}></span>
                                        Generating speech...
                                    </>
                                ) : "🔊 Speak Text"}
                            </button>

                            {/* Audio Player (visible after generation) */}
                            {ttsAudio && (
                                <div style={{ marginTop: "16px" }}>
                                    <label style={{
                                        display: "block",
                                        marginBottom: "8px",
                                        color: "#10b981",
                                        fontSize: "13px",
                                        fontWeight: 500,
                                    }}>✅ Audio Generated:</label>
                                    <audio
                                        controls
                                        src={ttsAudio}
                                        style={{ width: "100%", borderRadius: "8px" }}
                                    />
                                    <button
                                        onClick={() => {
                                            setTtsAudio(null);
                                            setTtsText("");
                                        }}
                                        style={{
                                            marginTop: "8px",
                                            padding: "8px 14px",
                                            borderRadius: "6px",
                                            border: "1px solid rgba(255,255,255,0.2)",
                                            backgroundColor: "transparent",
                                            color: "#9ca3af",
                                            cursor: "pointer",
                                            fontSize: "12px",
                                        }}
                                    >
                                        🔄 New
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* History Tab Content */}
                    {activeTab === "history" && (() => {
                        const TYPE_META: Record<string, { label: string; color: string }> = {
                            diagram: { label: "Diagram", color: "#818cf8" },
                            image: { label: "Image", color: "#34d399" },
                            sketch: { label: "Sketch", color: "#f472b6" },
                            ocr: { label: "OCR", color: "#fbbf24" },
                            tts: { label: "TTS", color: "#60a5fa" },
                        };
                        const filters: Array<AIHistoryType | "all"> = ["all", "diagram", "image", "sketch", "ocr", "tts"];
                        const filtered = historyFilter === "all" ? history : history.filter(e => e.type === historyFilter);

                        return (
                            <div style={{ maxWidth: "560px" }}>
                                {/* Filter bar */}
                                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
                                    {filters.map(f => (
                                        <button key={f} onClick={() => setHistoryFilter(f)} style={{
                                            padding: "4px 12px", borderRadius: "20px", border: "none", cursor: "pointer",
                                            fontSize: "11px", fontWeight: 500,
                                            backgroundColor: historyFilter === f ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)",
                                            color: historyFilter === f ? "#a5b4fc" : "#9ca3af",
                                            transition: "all 0.15s ease",
                                        }}>
                                            {f === "all" ? "All" : TYPE_META[f].label}
                                        </button>
                                    ))}
                                    {history.length > 0 && (
                                        <button onClick={async () => { await clearAIHistory(); setHistory([]); }} style={{
                                            marginLeft: "auto", padding: "4px 12px", borderRadius: "20px",
                                            border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer",
                                            fontSize: "11px", backgroundColor: "transparent", color: "#f87171",
                                        }}>
                                            Clear all
                                        </button>
                                    )}
                                </div>

                                {/* Empty state */}
                                {filtered.length === 0 && (
                                    <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
                                        <div style={{ fontSize: "36px", marginBottom: "10px" }}>🕐</div>
                                        <div style={{ fontSize: "13px" }}>No history yet.</div>
                                        <div style={{ fontSize: "12px", marginTop: "4px" }}>Generated content will appear here.</div>
                                    </div>
                                )}

                                {/* History list */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    {filtered.map(entry => {
                                        const meta = TYPE_META[entry.type];
                                        const date = new Date(entry.timestamp);
                                        const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                                        const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });

                                        return (
                                            <div key={entry.id} style={{
                                                display: "flex", alignItems: "center", gap: "10px",
                                                padding: "8px 10px", borderRadius: "8px",
                                                backgroundColor: "rgba(255,255,255,0.03)",
                                                border: "1px solid rgba(255,255,255,0.06)",
                                            }}>
                                                {/* Type badge */}
                                                <span style={{
                                                    fontSize: "10px", fontWeight: 600, padding: "2px 8px",
                                                    borderRadius: "10px", backgroundColor: `${meta.color}22`,
                                                    color: meta.color, flexShrink: 0, whiteSpace: "nowrap",
                                                }}>
                                                    {meta.label}
                                                </span>
                                                {/* Prompt — truncated */}
                                                <span style={{
                                                    flex: 1, minWidth: 0, fontSize: "12px", color: "#d1d5db",
                                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                }}>
                                                    {entry.prompt}
                                                </span>
                                                {/* Timestamp */}
                                                <span style={{ fontSize: "10px", color: "#6b7280", flexShrink: 0, whiteSpace: "nowrap" }}>
                                                    {dateStr} {timeStr}
                                                </span>
                                                {/* Delete */}
                                                <button title="Delete" onClick={async () => {
                                                    await deleteAIHistoryEntry(entry.id);
                                                    setHistory(prev => prev.filter(e => e.id !== entry.id));
                                                }} style={{
                                                    padding: "2px 6px", borderRadius: "4px", border: "none", cursor: "pointer",
                                                    fontSize: "11px", backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171",
                                                    flexShrink: 0, lineHeight: 1,
                                                }}>✕</button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    {/* Style selector (only for diagrams) */}
                    {activeTab === "diagram" && (
                        <div style={{ marginBottom: "14px", maxWidth: "480px" }}>
                            <FormLabel>Diagram Type:</FormLabel>
                            <FormSelect value={style} onChange={(val) => setStyle(val)}>
                                <option value="flowchart">Flowchart</option>
                                <option value="sequence">Sequence Diagram</option>
                                <option value="class">Class Diagram</option>
                                <option value="mindmap">Mind Map</option>
                            </FormSelect>
                        </div>
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

