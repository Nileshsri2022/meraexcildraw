/**
 * useOcr — Optical Character Recognition from canvas or uploaded images.
 *
 * Captures selected canvas elements (or the full canvas), sends to
 * the OCR API, and provides options to place the result as text
 * elements or as a rendered markdown image on the canvas.
 *
 * Extracted from useAIGeneration (P2.1 — clean-code: SRP).
 */
import { useState, useRef, useCallback } from "react";
import { convertToExcalidrawElements, exportToCanvas } from "@excalidraw/excalidraw";
import type { AppState } from "@excalidraw/excalidraw/types";
import html2canvas from "html2canvas";
import { normalizeLatexWithMathJax, extractTextFromOCRWithMathJax } from "../../utils/mathJaxParser";
import { addImageToCanvas } from "../../utils/addImageToCanvas";
import { saveAIResult } from "../../data/LocalStorage";
import { apiFetch, getErrorMessage } from "../../utils/apiClient";
import type { OCRResponse } from "../../utils/apiClient";
import type { AIGenerationContext } from "./types";

/** Word-wrap a line of text at `maxWidth` characters (pure function) */
function wrapText(text: string, maxWidth: number): string[] {
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
}

const OCR_MAX_LINE_WIDTH = 60;
const OCR_FONT_SIZE = 16;

export function useOcr(ctx: AIGenerationContext) {
    const [ocrImage, setOcrImage] = useState<string | null>(null);
    const [ocrResult, setOcrResult] = useState<string | null>(null);
    const ocrMarkdownRef = useRef<HTMLDivElement>(null);

    const handleOcrImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                setOcrImage(reader.result as string);
                setOcrResult(null);
                ctx.setError(null);
            };
            reader.readAsDataURL(file);
        }
    }, [ctx]);

    const captureCanvas = useCallback(async (): Promise<string | null> => {
        if (!ctx.excalidrawAPI) return null;

        try {
            const appState = ctx.excalidrawAPI.getAppState();
            const selectedIds = appState.selectedElementIds || {};
            const allElements = ctx.excalidrawAPI.getSceneElements() || [];
            const files = ctx.excalidrawAPI.getFiles();

            const selectedElements = allElements.filter(
                el => selectedIds[el.id] && !el.isDeleted
            );

            if (selectedElements.length > 0) {
                if (import.meta.env.DEV) console.log(`[captureCanvas] Exporting ${selectedElements.length} selected element(s)`);
                const canvas = await exportToCanvas({
                    elements: [...selectedElements],
                    appState: { viewBackgroundColor: "#ffffff", exportBackground: true } as Partial<AppState> as AppState,
                    files: files || null,
                    exportPadding: 10,
                });
                const dataUrl = canvas.toDataURL('image/png');
                setOcrImage(dataUrl);
                setOcrResult(null);
                ctx.setError(null);
                return dataUrl;
            }

            if (import.meta.env.DEV) console.log(`[captureCanvas] No selection, capturing full canvas`);
            const canvasEl = document.querySelector('.excalidraw canvas') as HTMLCanvasElement;
            if (canvasEl) {
                const dataUrl = canvasEl.toDataURL('image/png');
                setOcrImage(dataUrl);
                setOcrResult(null);
                ctx.setError(null);
                return dataUrl;
            }
        } catch (err) {
            console.error('[captureCanvas] Error:', err);
        }
        return null;
    }, [ctx]);

    const performOcr = useCallback(async (overridePrompt?: string, overrideImage?: string): Promise<string | null> => {
        const imageToUse = overrideImage || ocrImage;
        if (!imageToUse) { ctx.setError("Please upload or capture an image first"); return null; }

        ctx.setLoading(true);
        ctx.setError(null);

        try {
            const data = await apiFetch<OCRResponse>("/api/ai/ocr", {
                method: "POST",
                body: JSON.stringify({ imageBase64: imageToUse }),
            });

            let processedText = data.text || "No text detected";
            processedText = normalizeLatexWithMathJax(processedText);
            setOcrResult(processedText);

            saveAIResult({ type: "ocr", prompt: "Canvas / Uploaded Image", result: processedText, thumbnail: imageToUse ?? undefined }).catch(() => { });
            return processedText;
        } catch (err) {
            console.error("OCR error:", err);
            ctx.setError(getErrorMessage(err, "Failed to perform OCR"));
            return null;
        } finally {
            ctx.setLoading(false);
        }
    }, [ocrImage, ctx]);

    const addOcrAsImage = useCallback(async () => {
        if (!ocrResult || !ctx.excalidrawAPI || !ocrMarkdownRef.current) return;

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

            await addImageToCanvas(ctx.excalidrawAPI, dataUrl, {
                width: canvas.width / 2, height: canvas.height / 2,
                idPrefix: "ocr-rendered",
            });

            ctx.onClose();
            setOcrImage(null);
            setOcrResult(null);
        } catch {
            ctx.setError("Failed to render markdown as image");
        }
    }, [ocrResult, ctx]);

    const addOcrAsText = useCallback(() => {
        if (!ocrResult || !ctx.excalidrawAPI) return;

        const processedText = extractTextFromOCRWithMathJax(ocrResult);

        const rawLines = processedText.split('\n');
        const allLines: string[] = [];
        for (const line of rawLines) {
            if (!line.trim()) continue;
            allLines.push(...(line.length > OCR_MAX_LINE_WIDTH ? wrapText(line.trim(), OCR_MAX_LINE_WIDTH) : [line.trim()]));
        }

        const lineSpacing = OCR_FONT_SIZE * 1.5;
        const groupId = `ocr-group-${Date.now()}`;

        const textElements = allLines.map((line, index) =>
            convertToExcalidrawElements([{
                type: "text", x: 100, y: 100 + (index * lineSpacing),
                text: line, fontSize: OCR_FONT_SIZE, fontFamily: 1,
            }])
        ).flat().map(el => ({ ...el, groupIds: [groupId] }));

        const currentElements = ctx.excalidrawAPI.getSceneElements();
        ctx.excalidrawAPI.updateScene({ elements: [...currentElements, ...textElements] });
        ctx.excalidrawAPI.scrollToContent(textElements, { fitToContent: true });
        ctx.onClose();
    }, [ocrResult, ctx]);

    const clearOcr = useCallback(() => {
        setOcrImage(null);
        setOcrResult(null);
        ctx.setError(null);
    }, [ctx]);

    return {
        ocrImage, ocrResult, ocrMarkdownRef,
        handleOcrImageUpload,
        captureCanvas,
        performOcr,
        addOcrAsImage,
        addOcrAsText,
        clearOcr,
    };
}
