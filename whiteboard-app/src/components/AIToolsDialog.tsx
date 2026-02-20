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

interface AIToolsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
    initialTab?: "diagram" | "image" | "ocr" | "tts" | "sketch";
}

const AI_SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3002";

export const AIToolsDialog: React.FC<AIToolsDialogProps> = ({
    isOpen,
    onClose,
    excalidrawAPI,
    initialTab = "diagram"
}) => {
    const [activeTab, setActiveTab] = useState<"diagram" | "image" | "ocr" | "tts" | "sketch">(initialTab as any);
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

    if (!isOpen) return null;

    // Tab accent color mapping
    const tabAccent = {
        diagram: { primary: "#818cf8", bg: "rgba(129, 140, 248, 0.12)", border: "rgba(129, 140, 248, 0.4)" },
        image: { primary: "#fbbf24", bg: "rgba(251, 191, 36, 0.12)", border: "rgba(251, 191, 36, 0.4)" },
        sketch: { primary: "#34d399", bg: "rgba(52, 211, 153, 0.12)", border: "rgba(52, 211, 153, 0.4)" },
        ocr: { primary: "#22d3ee", bg: "rgba(34, 211, 238, 0.12)", border: "rgba(34, 211, 238, 0.4)" },
        tts: { primary: "#f472b6", bg: "rgba(244, 114, 182, 0.12)", border: "rgba(244, 114, 182, 0.4)" },
    };
    const accent = tabAccent[activeTab];

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.55)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
                animation: "fadeIn 0.2s ease-out",
            }}
            onClick={onClose}
        >
            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(24px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes shimmer { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
                .ai-dialog-scrollbar::-webkit-scrollbar { width: 6px; }
                .ai-dialog-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .ai-dialog-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
                .ai-dialog-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
            <div
                className="ai-dialog-scrollbar"
                style={{
                    backgroundColor: "#1a1a22",
                    padding: "24px",
                    borderRadius: "16px",
                    width: "420px",
                    maxHeight: "90vh",
                    overflowY: "auto",
                    boxShadow: `0 24px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.06), 0 0 80px -20px ${accent.primary}22`,
                    animation: "slideUp 0.3s ease-out",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "18px",
                }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: "18px",
                        fontWeight: 700,
                        background: `linear-gradient(135deg, ${accent.primary}, #e4e4e7)`,
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}>
                        <span style={{ WebkitTextFillColor: "initial" }}>✨</span> AI Tools
                    </h2>
                    <button
                        onClick={onClose}
                        style={{
                            width: "28px",
                            height: "28px",
                            borderRadius: "8px",
                            border: "1px solid rgba(255,255,255,0.1)",
                            backgroundColor: "transparent",
                            color: "#6b7280",
                            cursor: "pointer",
                            fontSize: "14px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            transition: "all 0.2s ease",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#e4e4e7"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#6b7280"; }}
                    >
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: "6px", marginBottom: "18px", padding: "4px", backgroundColor: "rgba(255,255,255,0.03)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.06)" }}>
                    {([
                        { id: "diagram" as const, icon: "📊", label: "Diagram", color: tabAccent.diagram },
                        { id: "image" as const,   icon: "🖼️", label: "Image",   color: tabAccent.image },
                        { id: "sketch" as const,  icon: "✏️",  label: "Sketch",  color: tabAccent.sketch },
                        { id: "ocr" as const,     icon: "📝",  label: "OCR",     color: tabAccent.ocr },
                        { id: "tts" as const,     icon: "🔊",  label: "TTS",     color: tabAccent.tts },
                    ]).map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => { setActiveTab(tab.id); setError(null); }}
                            style={{
                                flex: 1,
                                padding: "8px 6px",
                                borderRadius: "8px",
                                border: "none",
                                backgroundColor: activeTab === tab.id ? tab.color.bg : "transparent",
                                color: activeTab === tab.id ? tab.color.primary : "#6b7280",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: activeTab === tab.id ? 600 : 500,
                                transition: "all 0.2s ease",
                                display: "flex",
                                flexDirection: "column" as const,
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "4px",
                                position: "relative" as const,
                                overflow: "hidden" as const,
                            }}
                        >
                            {activeTab === tab.id && (
                                <div style={{
                                    position: "absolute",
                                    bottom: 0,
                                    left: "20%",
                                    right: "20%",
                                    height: "2px",
                                    borderRadius: "1px",
                                    backgroundColor: tab.color.primary,
                                }} />
                            )}
                            <span style={{ fontSize: "16px" }}>{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {(activeTab === "diagram" || activeTab === "image" || activeTab === "sketch") && (
                    <div style={{ marginBottom: "14px" }}>
                        <label style={{
                            display: "block",
                            marginBottom: "6px",
                            color: "#e4e4e7",
                            fontSize: "13px",
                            fontWeight: 500
                        }}>
                            {activeTab === "diagram"
                                ? "Describe your diagram:"
                                : activeTab === "image"
                                    ? "✨ Your Prompt:"
                                    : "Describe the final image style:"}
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={
                                activeTab === "diagram"
                                    ? "e.g., User login authentication flow with error handling"
                                    : activeTab === "image"
                                        ? "e.g., A futuristic city skyline at sunset with flying cars"
                                        : "e.g., High-quality anime style, vibrant colors, clean lines"
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
                )}

                {/* Z-Image-Turbo Advanced Settings */}
                {activeTab === "image" && (
                    <div style={{ marginBottom: "14px" }}>
                        {/* Info Banner */}
                        <div style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(234, 179, 8, 0.1)",
                            border: "1px solid rgba(234, 179, 8, 0.2)",
                            marginBottom: "14px",
                            fontSize: "12px",
                            color: "#fbbf24",
                            lineHeight: "1.5",
                        }}>
                            ⚡ <strong>Z-Image-Turbo</strong> — Ultra-fast AI image generation. Generate stunning images in just 8 steps.
                        </div>

                        {/* Height & Width in a row */}
                        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                            <div style={{ flex: 1 }}>
                                <label style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "6px",
                                    color: "#e4e4e7",
                                    fontSize: "12px",
                                    fontWeight: 500
                                }}>
                                    <span>Height</span>
                                    <span style={{ color: "#fbbf24" }}>{imgHeight}px</span>
                                </label>
                                <input
                                    type="range"
                                    min={512}
                                    max={2048}
                                    step={64}
                                    value={imgHeight}
                                    onChange={(e) => setImgHeight(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "#eab308" }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "6px",
                                    color: "#e4e4e7",
                                    fontSize: "12px",
                                    fontWeight: 500
                                }}>
                                    <span>Width</span>
                                    <span style={{ color: "#fbbf24" }}>{imgWidth}px</span>
                                </label>
                                <input
                                    type="range"
                                    min={512}
                                    max={2048}
                                    step={64}
                                    value={imgWidth}
                                    onChange={(e) => setImgWidth(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "#eab308" }}
                                />
                            </div>
                        </div>

                        {/* Inference Steps */}
                        <div style={{ marginBottom: "12px" }}>
                            <label style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "6px",
                                color: "#e4e4e7",
                                fontSize: "12px",
                                fontWeight: 500
                            }}>
                                <span>Inference Steps</span>
                                <span style={{ color: "#fbbf24" }}>{imgSteps}</span>
                            </label>
                            <input
                                type="range"
                                min={1}
                                max={20}
                                step={1}
                                value={imgSteps}
                                onChange={(e) => setImgSteps(Number(e.target.value))}
                                style={{ width: "100%", accentColor: "#eab308" }}
                            />
                            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
                                9 steps = 8 DiT forwards (recommended)
                            </div>
                        </div>

                        {/* Seed + Random Seed */}
                        <div style={{ marginBottom: "4px" }}>
                            <div style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "6px",
                            }}>
                                <label style={{
                                    color: "#e4e4e7",
                                    fontSize: "12px",
                                    fontWeight: 500
                                }}>
                                    Seed
                                </label>
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
                            <input
                                type="number"
                                min={0}
                                max={2147483647}
                                value={imgSeed}
                                onChange={(e) => setImgSeed(Number(e.target.value))}
                                disabled={imgRandomSeed}
                                style={{
                                    width: "100%",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255, 255, 255, 0.15)",
                                    backgroundColor: imgRandomSeed ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 255, 255, 0.05)",
                                    color: imgRandomSeed ? "#6b7280" : "#e4e4e7",
                                    fontSize: "13px",
                                    outline: "none",
                                    boxSizing: "border-box" as const,
                                    transition: "all 0.2s ease",
                                    cursor: imgRandomSeed ? "not-allowed" : "text",
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* ControlNet Sketch Controls */}
                {activeTab === "sketch" && (
                    <div style={{ marginBottom: "14px" }}>
                        {/* Info Banner */}
                        <div style={{
                            padding: "10px 12px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(99, 102, 241, 0.1)",
                            border: "1px solid rgba(99, 102, 241, 0.2)",
                            marginBottom: "14px",
                            fontSize: "12px",
                            color: "#a5b4fc",
                            lineHeight: "1.5",
                        }}>
                            💡 <strong>ControlNet</strong> — Draw a sketch on the canvas, choose a pipeline, then describe what you want. The AI preserves your sketch's structure.
                        </div>

                        {/* Pipeline Selector */}
                        <div style={{ marginBottom: "12px" }}>
                            <label style={{
                                display: "block",
                                marginBottom: "6px",
                                color: "#e4e4e7",
                                fontSize: "12px",
                                fontWeight: 500
                            }}>
                                Pipeline:
                            </label>
                            <select
                                value={sketchPipeline}
                                onChange={(e) => setSketchPipeline(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255, 255, 255, 0.15)",
                                    backgroundColor: "#2d2d35",
                                    color: "#e4e4e7",
                                    fontSize: "13px",
                                    cursor: "pointer",
                                    outline: "none",
                                }}
                            >
                                <option value="scribble">✏️ Scribble (rough freehand sketches)</option>
                                <option value="canny">🔲 Canny (clean edge outlines)</option>
                                <option value="softedge">🌊 SoftEdge (smooth edges)</option>
                                <option value="lineart">🖊️ Lineart (clean line drawings)</option>
                                <option value="depth">📐 Depth (depth-based generation)</option>
                                <option value="normal">🗺️ Normal Map</option>
                                <option value="mlsd">📏 MLSD (straight lines / architecture)</option>
                                <option value="segmentation">🎨 Segmentation (semantic maps)</option>
                            </select>
                        </div>

                        {/* Preprocessor */}
                        <div style={{ marginBottom: "12px" }}>
                            <label style={{
                                display: "block",
                                marginBottom: "6px",
                                color: "#e4e4e7",
                                fontSize: "12px",
                                fontWeight: 500
                            }}>
                                Preprocessor:
                            </label>
                            <select
                                value={sketchPreprocessor}
                                onChange={(e) => setSketchPreprocessor(e.target.value)}
                                style={{
                                    width: "100%",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255, 255, 255, 0.15)",
                                    backgroundColor: "#2d2d35",
                                    color: "#e4e4e7",
                                    fontSize: "13px",
                                    cursor: "pointer",
                                    outline: "none",
                                }}
                            >
                                <option value="HED">HED (Soft edges — best for rough sketches)</option>
                                <option value="None">None (Direct — best for clean line art)</option>
                            </select>
                        </div>

                        {/* Resolution */}
                        <div style={{ marginBottom: "12px" }}>
                            <label style={{
                                display: "flex",
                                justifyContent: "space-between",
                                marginBottom: "6px",
                                color: "#e4e4e7",
                                fontSize: "12px",
                                fontWeight: 500
                            }}>
                                <span>Image Resolution</span>
                                <span style={{ color: "#a5b4fc" }}>{sketchResolution}px</span>
                            </label>
                            <input
                                type="range"
                                min={256}
                                max={768}
                                step={128}
                                value={sketchResolution}
                                onChange={(e) => setSketchResolution(Number(e.target.value))}
                                style={{ width: "100%", accentColor: "#6366f1" }}
                            />
                        </div>

                        {/* Steps & Guidance in a row */}
                        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
                            <div style={{ flex: 1 }}>
                                <label style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "6px",
                                    color: "#e4e4e7",
                                    fontSize: "12px",
                                    fontWeight: 500
                                }}>
                                    <span>Steps</span>
                                    <span style={{ color: "#a5b4fc" }}>{sketchSteps}</span>
                                </label>
                                <input
                                    type="range"
                                    min={10}
                                    max={40}
                                    step={5}
                                    value={sketchSteps}
                                    onChange={(e) => setSketchSteps(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "#6366f1" }}
                                />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    marginBottom: "6px",
                                    color: "#e4e4e7",
                                    fontSize: "12px",
                                    fontWeight: 500
                                }}>
                                    <span>Guidance</span>
                                    <span style={{ color: "#a5b4fc" }}>{sketchGuidance}</span>
                                </label>
                                <input
                                    type="range"
                                    min={1}
                                    max={20}
                                    step={0.5}
                                    value={sketchGuidance}
                                    onChange={(e) => setSketchGuidance(Number(e.target.value))}
                                    style={{ width: "100%", accentColor: "#6366f1" }}
                                />
                            </div>
                        </div>

                        {/* Seed */}
                        <div style={{ marginBottom: "4px" }}>
                            <label style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "6px",
                                color: "#e4e4e7",
                                fontSize: "12px",
                                fontWeight: 500
                            }}>
                                <span>Seed</span>
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
                            </label>
                            <input
                                type="number"
                                min={0}
                                max={2147483647}
                                value={sketchSeed}
                                onChange={(e) => setSketchSeed(Number(e.target.value))}
                                style={{
                                    width: "100%",
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255, 255, 255, 0.15)",
                                    backgroundColor: "rgba(255, 255, 255, 0.05)",
                                    color: "#e4e4e7",
                                    fontSize: "13px",
                                    outline: "none",
                                    boxSizing: "border-box",
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* OCR Tab Content */}
                {activeTab === "ocr" && (
                    <div>
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
                    <div style={{ marginBottom: "14px" }}>
                        {/* Hidden audio element for playback */}
                        <audio ref={audioRef} style={{ display: "none" }} />

                        {/* Instructions */}
                        <div style={{
                            padding: "12px",
                            borderRadius: "8px",
                            backgroundColor: "rgba(99, 102, 241, 0.1)",
                            border: "1px solid rgba(99, 102, 241, 0.3)",
                            marginBottom: "14px",
                        }}>
                            <p style={{ margin: 0, color: "#a5b4fc", fontSize: "13px" }}>
                                💡 <strong>Tip:</strong> Copy text from canvas (Ctrl+C), then open this tab. Text will auto-fill.
                            </p>
                        </div>

                        {/* Text Input */}
                        <label style={{
                            display: "block",
                            marginBottom: "6px",
                            color: "#e4e4e7",
                            fontSize: "13px",
                            fontWeight: 500
                        }}>
                            Text to speak:
                        </label>
                        <textarea
                            value={ttsText}
                            onChange={(e) => setTtsText(e.target.value)}
                            placeholder="Enter or paste text here to convert to speech..."
                            style={{
                                width: "100%",
                                minHeight: "100px",
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
                            }}
                        />

                        {/* Voice Selector */}
                        <div style={{ marginTop: "12px" }}>
                            <label style={{
                                display: "block",
                                marginBottom: "6px",
                                color: "#e4e4e7",
                                fontSize: "13px",
                                fontWeight: 500
                            }}>
                                Voice:
                            </label>
                            <select
                                value={ttsVoice}
                                onChange={(e) => setTtsVoice(e.target.value)}
                                disabled={loadingVoices}
                                style={{
                                    width: "100%",
                                    padding: "10px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid rgba(255, 255, 255, 0.15)",
                                    backgroundColor: "#2d2d35",
                                    color: "#e4e4e7",
                                    fontSize: "13px",
                                    cursor: loadingVoices ? "wait" : "pointer",
                                    outline: "none",
                                }}
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
                            </select>
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

                {/* Action Buttons - Not shown for tts tab */}
                {activeTab !== "tts" && (
                    <div style={{ display: "flex", gap: "10px" }}>
                        <button
                            onClick={handleGenerate}
                            disabled={loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim())}
                            style={{
                                flex: 1,
                                padding: "12px 18px",
                                borderRadius: "10px",
                                border: "none",
                                background: loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim())
                                    ? "rgba(255, 255, 255, 0.06)"
                                    : `linear-gradient(135deg, ${accent.primary}, ${accent.primary}cc)`,
                                color: loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim()) ? "#6b7280" : "#ffffff",
                                cursor: loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim()) ? "not-allowed" : "pointer",
                                fontSize: "14px",
                                fontWeight: 600,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "8px",
                                transition: "all 0.25s ease",
                                boxShadow: loading || (activeTab === "ocr" ? !ocrImage : !prompt.trim())
                                    ? "none"
                                    : `0 4px 20px ${accent.primary}44`,
                                letterSpacing: "0.3px",
                            }}
                            onMouseEnter={(e) => {
                                const isDisabled = activeTab === "ocr" ? !ocrImage : !prompt.trim();
                                if (!loading && !isDisabled) {
                                    e.currentTarget.style.transform = "translateY(-1px)";
                                    e.currentTarget.style.boxShadow = `0 6px 28px ${accent.primary}55`;
                                }
                            }}
                            onMouseLeave={(e) => {
                                const isDisabled = activeTab === "ocr" ? !ocrImage : !prompt.trim();
                                if (!loading && !isDisabled) {
                                    e.currentTarget.style.transform = "translateY(0)";
                                    e.currentTarget.style.boxShadow = `0 4px 20px ${accent.primary}44`;
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
                                    {activeTab === "diagram" && "� Generate Diagram"}
                                    {activeTab === "image" && "🚀 Generate Image"}
                                    {activeTab === "sketch" && "✏️ Generate from Sketch"}
                                    {activeTab === "ocr" && "📝 Extract Text"}
                                </>
                            )}
                        </button>
                    </div>
                )}

                {/* Footer */}
                <div style={{
                    marginTop: "16px",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    backgroundColor: "rgba(255,255,255,0.02)",
                    fontSize: "11px",
                    color: "#4b5563",
                    textAlign: "center",
                    letterSpacing: "0.2px",
                }}>
                    {activeTab === "diagram" && "Powered by Kimi-K2 + Mermaid-to-Excalidraw"}
                    {activeTab === "image" && "Powered by Z-Image-Turbo • Ultra-fast generation"}
                    {activeTab === "sketch" && "Powered by ControlNet v1.1 • May take 30-60s on cold start"}
                    {activeTab === "ocr" && "Powered by PaddleOCR-VL"}
                    {activeTab === "tts" && "Powered by ElevenLabs Text-to-Speech"}
                </div>
            </div>
        </div>
    );
};

