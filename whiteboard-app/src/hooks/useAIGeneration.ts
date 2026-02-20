import { useState, useCallback, useRef } from "react";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import html2canvas from "html2canvas";
import { normalizeLatexWithMathJax, extractTextFromOCRWithMathJax } from "../utils/mathJaxParser";
import { addImageToCanvas } from "../utils/addImageToCanvas";
import { saveAIResult } from "../data/LocalStorage";

const AI_SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3002";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExcalidrawElementBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    isDeleted: boolean;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Encapsulates all AI generation logic: sketch-to-image, diagram, image, OCR.
 *
 * Manages its own settings state for sketch/image params, OCR image/result,
 * and exposes callbacks + state used by the AIToolsDialog.
 */
export function useAIGeneration(
    excalidrawAPI: ExcalidrawImperativeAPI | null,
    onClose: () => void,
) {
    // Shared state
    const [prompt, setPrompt] = useState("");
    const [style, setStyle] = useState("flowchart");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // OCR state
    const [ocrImage, setOcrImage] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<string | null>(null);
    const ocrMarkdownRef = useRef<HTMLDivElement>(null);

    // Sketch settings
    const [sketchPipeline, setSketchPipeline] = useState("scribble");
    const [sketchResolution, setSketchResolution] = useState(512);
    const [sketchSteps, setSketchSteps] = useState(20);
    const [sketchGuidance, setSketchGuidance] = useState(9);
    const [sketchSeed, setSketchSeed] = useState(0);
    const [sketchPreprocessor, setSketchPreprocessor] = useState("HED");

    // Image settings
    const [imgWidth, setImgWidth] = useState(1024);
    const [imgHeight, setImgHeight] = useState(1024);
    const [imgSteps, setImgSteps] = useState(9);
    const [imgSeed, setImgSeed] = useState(42);
    const [imgRandomSeed, setImgRandomSeed] = useState(true);

    // ─── Sketch-to-Image ─────────────────────────────────────────────────────

    const generateSketchImage = useCallback(async () => {
        if (!prompt.trim()) { setError("Please enter a description"); return; }
        if (!excalidrawAPI) { setError("Canvas not ready"); return; }

        const elements = excalidrawAPI.getSceneElements();
        if (!elements || elements.length === 0) {
            setError("Draw something on the canvas first!");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Compute bounding box of all drawn elements
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (const el of elements) {
                if (el.isDeleted) continue;
                const b = el as unknown as ExcalidrawElementBounds;
                minX = Math.min(minX, b.x ?? 0);
                minY = Math.min(minY, b.y ?? 0);
                maxX = Math.max(maxX, (b.x ?? 0) + (b.width ?? 0));
                maxY = Math.max(maxY, (b.y ?? 0) + (b.height ?? 0));
            }

            const padding = 40;
            minX -= padding; minY -= padding;
            maxX += padding; maxY += padding;

            const appState = excalidrawAPI.getAppState();
            const zoom = appState.zoom?.value ?? 1;
            const scrollX = appState.scrollX ?? 0;
            const scrollY = appState.scrollY ?? 0;

            const rawCanvas = document.querySelector(".excalidraw__canvas") as HTMLCanvasElement
                || document.querySelector(".excalidraw canvas") as HTMLCanvasElement;
            if (!rawCanvas) throw new Error("Could not capture canvas");

            const cropX = (minX + scrollX) * zoom;
            const cropY = (minY + scrollY) * zoom;
            const cropW = (maxX - minX) * zoom;
            const cropH = (maxY - minY) * zoom;

            const targetSize = 512;
            const aspect = cropW / cropH;
            const [outW, outH] = aspect >= 1
                ? [targetSize, Math.round(targetSize / aspect)]
                : [Math.round(targetSize * aspect), targetSize];

            const croppedCanvas = document.createElement("canvas");
            croppedCanvas.width = outW;
            croppedCanvas.height = outH;
            const ctx = croppedCanvas.getContext("2d")!;

            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, outW, outH);
            ctx.drawImage(rawCanvas,
                Math.max(0, cropX), Math.max(0, cropY), Math.max(1, cropW), Math.max(1, cropH),
                0, 0, outW, outH);

            // Binarize for ControlNet (black lines on white background)
            const sampleData = ctx.getImageData(0, 0, 1, 1).data;
            const isDarkMode = (sampleData[0] + sampleData[1] + sampleData[2]) / 3 < 128;

            const imgData = ctx.getImageData(0, 0, outW, outH);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const gray = (d[i] + d[i + 1] + d[i + 2]) / 3;
                const v = isDarkMode ? (gray > 100 ? 0 : 255) : (gray > 200 ? 255 : 0);
                d[i] = d[i + 1] = d[i + 2] = v;
                d[i + 3] = 255;
            }
            ctx.putImageData(imgData, 0, 0);

            const imageBase64 = croppedCanvas.toDataURL("image/png");

            const response = await fetch(`${AI_SERVER_URL}/api/ai/sketch-to-image`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt, imageBase64, width: 512, height: 512,
                    pipeline: sketchPipeline, image_resolution: sketchResolution,
                    num_steps: sketchSteps, guidance_scale: sketchGuidance,
                    seed: sketchSeed, preprocessor_name: sketchPreprocessor,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            if (data.imageUrl) {
                const imgW = data.width || 512;
                const imgH = data.height || 512;
                await addImageToCanvas(excalidrawAPI, data.imageUrl, {
                    x: maxX + 50, y: minY, width: imgW, height: imgH,
                    idPrefix: "sketch-image",
                });
                excalidrawAPI.scrollToContent(undefined, { fitToContent: true });
            }

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

    // ─── Generate Diagram ────────────────────────────────────────────────────

    const generateDiagram = useCallback(async () => {
        if (!prompt.trim()) { setError("Please enter a description"); return; }

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
                excalidrawAPI.updateScene({ elements: [...currentElements, ...excalidrawElements] });
                excalidrawAPI.scrollToContent(excalidrawElements, { fitToContent: true });
            }

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

    // ─── Generate Image ──────────────────────────────────────────────────────

    const generateImage = useCallback(async () => {
        if (!prompt.trim()) { setError("Please enter a description"); return; }

        setLoading(true);
        setError(null);

        try {
            const response = await fetch(`${AI_SERVER_URL}/api/ai/generate-image`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    prompt, width: imgWidth, height: imgHeight,
                    num_inference_steps: imgSteps, seed: imgSeed, randomize_seed: imgRandomSeed,
                }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || data.error || `Server error: ${response.status}`);
            }

            const data = await response.json();

            if (excalidrawAPI && data.imageUrl) {
                await addImageToCanvas(excalidrawAPI, data.imageUrl, {
                    width: data.width || imgWidth, height: data.height || imgHeight,
                    idPrefix: "ai-image",
                });
            }

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

    // ─── OCR ─────────────────────────────────────────────────────────────────

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

    const captureCanvas = useCallback(() => {
        if (!excalidrawAPI) return;
        const canvas = document.querySelector('.excalidraw canvas') as HTMLCanvasElement;
        if (canvas) {
            setOcrImage(canvas.toDataURL('image/png'));
            setOcrResult(null);
            setError(null);
        }
    }, [excalidrawAPI]);

    const performOcr = useCallback(async () => {
        if (!ocrImage) { setError("Please upload or capture an image first"); return; }

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
            let processedText = data.text || "No text detected";
            processedText = normalizeLatexWithMathJax(processedText);
            setOcrResult(processedText);

            saveAIResult({ type: "ocr", prompt: "Canvas / Uploaded Image", result: processedText, thumbnail: ocrImage ?? undefined }).catch(() => { });
        } catch (err) {
            console.error("OCR error:", err);
            setError(err instanceof Error ? err.message : "Failed to perform OCR");
        } finally {
            setLoading(false);
        }
    }, [ocrImage]);

    const addOcrAsImage = useCallback(async () => {
        if (!ocrResult || !excalidrawAPI || !ocrMarkdownRef.current) return;

        try {
            const element = ocrMarkdownRef.current;
            const origMaxH = element.style.maxHeight;
            const origOverflow = element.style.overflowY;
            element.style.maxHeight = 'none';
            element.style.overflowY = 'visible';

            const canvas = await html2canvas(element, {
                backgroundColor: '#ffffff', scale: 2,
                scrollX: 0, scrollY: 0,
                windowWidth: element.scrollWidth, windowHeight: element.scrollHeight,
            });

            element.style.maxHeight = origMaxH;
            element.style.overflowY = origOverflow;

            const dataUrl = canvas.toDataURL('image/png');
            await new Promise(resolve => setTimeout(resolve, 100));

            await addImageToCanvas(excalidrawAPI, dataUrl, {
                width: canvas.width / 2, height: canvas.height / 2,
                idPrefix: "ocr-rendered",
            });

            onClose();
            setOcrImage(null);
            setOcrResult(null);
        } catch {
            setError("Failed to render markdown as image");
        }
    }, [ocrResult, excalidrawAPI, onClose]);

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

    const clearOcr = useCallback(() => {
        setOcrImage(null);
        setOcrResult(null);
        setError(null);
    }, []);

    // ─── Return ──────────────────────────────────────────────────────────────

    return {
        // Shared state
        prompt, setPrompt,
        style, setStyle,
        loading, setLoading,
        error, setError,

        // Sketch settings
        sketchPipeline, setSketchPipeline,
        sketchResolution, setSketchResolution,
        sketchSteps, setSketchSteps,
        sketchGuidance, setSketchGuidance,
        sketchSeed, setSketchSeed,
        sketchPreprocessor, setSketchPreprocessor,

        // Image settings
        imgWidth, setImgWidth,
        imgHeight, setImgHeight,
        imgSteps, setImgSteps,
        imgSeed, setImgSeed,
        imgRandomSeed, setImgRandomSeed,

        // OCR state
        ocrImage, ocrResult, ocrMarkdownRef,

        // Generation callbacks
        generateSketchImage,
        generateDiagram,
        generateImage,

        // OCR callbacks
        handleOcrImageUpload,
        captureCanvas,
        performOcr,
        addOcrAsImage,
        addOcrAsText,
        clearOcr,
    };
}
