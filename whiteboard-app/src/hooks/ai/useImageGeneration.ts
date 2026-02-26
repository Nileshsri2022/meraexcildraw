/**
 * useImageGeneration — AI image generation from text prompts.
 *
 * Sends a prompt to the image generation API and places the
 * resulting image on the Excalidraw canvas.
 *
 * Extracted from useAIGeneration (P2.1 — clean-code: SRP).
 */
import { useState, useCallback } from "react";
import { addImageToCanvas } from "../../utils/addImageToCanvas";
import { saveAIResult } from "../../data/LocalStorage";
import { apiFetch, getErrorMessage } from "../../utils/apiClient";
import type { ImageResponse } from "../../utils/apiClient";
import type { AIGenerationContext } from "./types";

export function useImageGeneration(ctx: AIGenerationContext) {
    const [imgWidth, setImgWidth] = useState(1024);
    const [imgHeight, setImgHeight] = useState(1024);
    const [imgSteps, setImgSteps] = useState(9);
    const [imgSeed, setImgSeed] = useState(42);
    const [imgRandomSeed, setImgRandomSeed] = useState(true);

    const generateImage = useCallback(async (overridePrompt?: string) => {
        const currentPrompt = overridePrompt || ctx.prompt;
        if (!currentPrompt.trim()) { ctx.setError("Please enter a description"); return; }

        ctx.setLoading(true);
        ctx.setError(null);

        try {
            if (import.meta.env.DEV) {
                console.log(`[generateImage] Starting with prompt: "${currentPrompt.substring(0, 80)}"`);
                console.log(`[generateImage] excalidrawAPI present: ${!!ctx.excalidrawAPI}`);
            }

            const data = await apiFetch<ImageResponse>("/api/ai/generate-image", {
                method: "POST",
                body: JSON.stringify({
                    prompt: currentPrompt, width: imgWidth, height: imgHeight,
                    num_inference_steps: imgSteps, seed: imgSeed, randomize_seed: imgRandomSeed,
                }),
            });

            if (import.meta.env.DEV) {
                console.log(`[generateImage] API response: imageUrl=${data.imageUrl ? `${data.imageUrl.substring(0, 50)}... (${data.imageUrl.length} chars)` : 'MISSING'}, width=${data.width}, height=${data.height}`);
            }

            if (ctx.excalidrawAPI && data.imageUrl) {
                try {
                    const elementId = await addImageToCanvas(ctx.excalidrawAPI, data.imageUrl, {
                        width: data.width || imgWidth, height: data.height || imgHeight,
                        idPrefix: "ai-image",
                    });
                    if (import.meta.env.DEV) console.log(`[generateImage] Image added to canvas successfully: ${elementId}`);
                } catch (canvasErr) {
                    console.error(`[generateImage] addImageToCanvas FAILED:`, canvasErr);
                }
            } else {
                console.warn(`[generateImage] Skipping canvas add: excalidrawAPI=${!!ctx.excalidrawAPI}, imageUrl=${!!data.imageUrl}`);
            }

            if (data.imageUrl) {
                saveAIResult({ type: "image", prompt: currentPrompt, result: data.imageUrl, thumbnail: data.imageUrl, metadata: { width: imgWidth, height: imgHeight, steps: imgSteps, seed: data.seed } }).catch(() => { });
            }

            ctx.onClose();
            ctx.setPrompt("");
        } catch (err) {
            console.error("Image generation error:", err);
            ctx.setError(getErrorMessage(err, "Failed to generate image"));
        } finally {
            ctx.setLoading(false);
        }
    }, [ctx, imgWidth, imgHeight, imgSteps, imgSeed, imgRandomSeed]);

    return {
        imgWidth, setImgWidth,
        imgHeight, setImgHeight,
        imgSteps, setImgSteps,
        imgSeed, setImgSeed,
        imgRandomSeed, setImgRandomSeed,
        generateImage,
    };
}
