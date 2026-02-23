/**
 * useAIGeneration — Thin coordinator for all AI generation features.
 *
 * Composes four focused sub-hooks:
 *   • useSketchGeneration (sketch-to-image via ControlNet)
 *   • useImageGeneration  (text-to-image)
 *   • useDiagramGeneration (text-to-Mermaid diagram)
 *   • useOcr              (OCR from canvas / uploaded images)
 *
 * This file previously contained ~490 lines of interleaved state and
 * callbacks. Now each sub-hook owns its own settings state and action
 * callback, coordinating on shared loading/error/prompt via
 * AIGenerationContext.
 *
 * The public API is unchanged — consumers destructure the same flat
 * object they always have.
 */
import { useState, useMemo } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AIGenerationContext } from "./ai/types";
import { useSketchGeneration } from "./ai/useSketchGeneration";
import { useImageGeneration } from "./ai/useImageGeneration";
import { useDiagramGeneration } from "./ai/useDiagramGeneration";
import { useOcr } from "./ai/useOcr";

export function useAIGeneration(
    excalidrawAPI: ExcalidrawImperativeAPI | null,
    onClose: () => void,
) {
    // ── Shared state ─────────────────────────────────────────────────────
    const [prompt, setPrompt] = useState("");
    const [style, setStyle] = useState("flowchart");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Build shared context (memoized to avoid re-creating on every render)
    const ctx: AIGenerationContext = useMemo(() => ({
        excalidrawAPI, onClose, prompt, setPrompt, setLoading, setError,
    }), [excalidrawAPI, onClose, prompt]);

    // ── Compose sub-hooks ────────────────────────────────────────────────
    const sketch = useSketchGeneration(ctx);
    const image = useImageGeneration(ctx);
    const diagram = useDiagramGeneration(ctx);
    const ocr = useOcr(ctx);

    // ── Return flat API (unchanged from before the refactor) ─────────────
    return {
        // Shared
        prompt, setPrompt,
        style, setStyle,
        loading, setLoading,
        error, setError,

        // Sketch
        ...sketch,

        // Image
        ...image,

        // Diagram
        ...diagram,

        // OCR
        ...ocr,
    };
}
