/**
 * useDiagramGeneration — AI diagram generation via Mermaid.
 *
 * Sends a prompt to the diagram API, parses the returned Mermaid
 * code into Excalidraw elements, and adds them to the canvas.
 *
 * Extracted from useAIGeneration (P2.1 — clean-code: SRP).
 */
import { useCallback } from "react";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { saveAIResult } from "../../data/LocalStorage";
import { apiFetch, getErrorMessage } from "../../utils/apiClient";
import type { DiagramResponse } from "../../utils/apiClient";
import type { AIGenerationContext } from "./types";

export function useDiagramGeneration(ctx: AIGenerationContext) {
    const generateDiagram = useCallback(async (overridePrompt?: string, overrideStyle?: string) => {
        const currentPrompt = overridePrompt || ctx.prompt;
        const currentStyle = overrideStyle || "flowchart";
        if (!currentPrompt.trim()) { ctx.setError("Please enter a description"); return; }

        ctx.setLoading(true);
        ctx.setError(null);

        try {
            const data = await apiFetch<DiagramResponse>("/api/ai/generate-diagram", {
                method: "POST",
                body: JSON.stringify({ prompt: currentPrompt, style: currentStyle }),
            });

            const diagramCode = data.code || data.mermaid;
            if (!diagramCode) throw new Error("Server returned no diagram code");

            const { elements: skeletonElements } = await parseMermaidToExcalidraw(diagramCode);
            const excalidrawElements = convertToExcalidrawElements(skeletonElements);

            if (ctx.excalidrawAPI) {
                const currentElements = ctx.excalidrawAPI.getSceneElements();
                ctx.excalidrawAPI.updateScene({ elements: [...currentElements, ...excalidrawElements] });
                ctx.excalidrawAPI.scrollToContent(excalidrawElements, { fitToContent: true });
            }

            saveAIResult({ type: "diagram", prompt: currentPrompt, result: diagramCode, metadata: { style: currentStyle } }).catch(() => { });
            ctx.onClose();
            ctx.setPrompt("");
        } catch (err) {
            console.error("Diagram generation error:", err);
            ctx.setError(getErrorMessage(err, "Failed to generate diagram"));
        } finally {
            ctx.setLoading(false);
        }
    }, [ctx]);

    return { generateDiagram };
}
