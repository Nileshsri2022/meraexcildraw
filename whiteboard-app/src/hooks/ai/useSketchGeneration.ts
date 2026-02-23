/**
 * useSketchGeneration — Sketch-to-image via ControlNet.
 *
 * Captures the current canvas, binarizes it, and sends it
 * to the sketch-to-image API endpoint with ControlNet params.
 *
 * Extracted from useAIGeneration (P2.1 — clean-code: SRP).
 */
import { useState, useCallback } from "react";
import { addImageToCanvas } from "../../utils/addImageToCanvas";
import { saveAIResult } from "../../data/LocalStorage";
import { apiFetch, getErrorMessage } from "../../utils/apiClient";
import type { SketchToImageResponse } from "../../utils/apiClient";
import type { AIGenerationContext } from "./types";

interface ExcalidrawElementBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    isDeleted: boolean;
}

export function useSketchGeneration(ctx: AIGenerationContext) {
    const [sketchPipeline, setSketchPipeline] = useState("scribble");
    const [sketchResolution, setSketchResolution] = useState(512);
    const [sketchSteps, setSketchSteps] = useState(20);
    const [sketchGuidance, setSketchGuidance] = useState(9);
    const [sketchSeed, setSketchSeed] = useState(0);
    const [sketchPreprocessor, setSketchPreprocessor] = useState("HED");

    const generateSketchImage = useCallback(async (overridePrompt?: string) => {
        const currentPrompt = overridePrompt || ctx.prompt;
        if (!currentPrompt.trim()) { ctx.setError("Please enter a description"); return; }
        if (!ctx.excalidrawAPI) { ctx.setError("Canvas not ready"); return; }

        const elements = ctx.excalidrawAPI.getSceneElements();
        if (!elements || elements.length === 0) {
            ctx.setError("Draw something on the canvas first!");
            return;
        }

        ctx.setLoading(true);
        ctx.setError(null);

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

            const appState = ctx.excalidrawAPI.getAppState();
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
            const canvasCtx = croppedCanvas.getContext("2d")!;

            canvasCtx.fillStyle = "#ffffff";
            canvasCtx.fillRect(0, 0, outW, outH);
            canvasCtx.drawImage(rawCanvas,
                Math.max(0, cropX), Math.max(0, cropY), Math.max(1, cropW), Math.max(1, cropH),
                0, 0, outW, outH);

            // Binarize for ControlNet (black lines on white background)
            const sampleData = canvasCtx.getImageData(0, 0, 1, 1).data;
            const isDarkMode = (sampleData[0] + sampleData[1] + sampleData[2]) / 3 < 128;

            const imgData = canvasCtx.getImageData(0, 0, outW, outH);
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
                const gray = (d[i] + d[i + 1] + d[i + 2]) / 3;
                const v = isDarkMode ? (gray > 100 ? 0 : 255) : (gray > 200 ? 255 : 0);
                d[i] = d[i + 1] = d[i + 2] = v;
                d[i + 3] = 255;
            }
            canvasCtx.putImageData(imgData, 0, 0);

            const imageBase64 = croppedCanvas.toDataURL("image/png");

            const data = await apiFetch<SketchToImageResponse>("/api/ai/sketch-to-image", {
                method: "POST",
                body: JSON.stringify({
                    prompt: currentPrompt, imageBase64, width: 512, height: 512,
                    pipeline: sketchPipeline, image_resolution: sketchResolution,
                    num_steps: sketchSteps, guidance_scale: sketchGuidance,
                    seed: sketchSeed, preprocessor_name: sketchPreprocessor,
                }),
            });

            if (data.imageUrl) {
                const imgW = data.width || 512;
                const imgH = data.height || 512;
                await addImageToCanvas(ctx.excalidrawAPI, data.imageUrl, {
                    x: maxX + 50, y: minY, width: imgW, height: imgH,
                    idPrefix: "sketch-image",
                });
                ctx.excalidrawAPI.scrollToContent(undefined, { fitToContent: true });
                saveAIResult({ type: "sketch", prompt: currentPrompt, result: data.imageUrl, thumbnail: data.imageUrl, metadata: { pipeline: sketchPipeline, resolution: sketchResolution } }).catch(() => { });
            }

            ctx.onClose();
            ctx.setPrompt("");
        } catch (err) {
            console.error("Sketch-to-image generation error:", err);
            ctx.setError(getErrorMessage(err, "Failed to generate image from sketch"));
        } finally {
            ctx.setLoading(false);
        }
    }, [ctx, sketchPipeline, sketchResolution, sketchSteps, sketchGuidance, sketchSeed, sketchPreprocessor]);

    return {
        // Settings
        sketchPipeline, setSketchPipeline,
        sketchResolution, setSketchResolution,
        sketchSteps, setSketchSteps,
        sketchGuidance, setSketchGuidance,
        sketchSeed, setSketchSeed,
        sketchPreprocessor, setSketchPreprocessor,
        // Action
        generateSketchImage,
    };
}
