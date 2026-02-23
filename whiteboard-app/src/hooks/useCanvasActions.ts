/**
 * useCanvasActions — Executes structured canvas commands on Excalidraw.
 *
 * Receives pre-parsed canvas elements from the backend (via LangChain
 * structured output) and converts them into Excalidraw scene elements.
 *
 * Element construction is delegated to pure factory functions in
 * `utils/elementBuilders.ts` — this hook only orchestrates the scene update.
 */
import { useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CanvasActionElement } from "./useCanvasChat";
import {
    randomId,
    createShapeElement,
    createArrowElement,
} from "../utils/elementBuilders";
import type { ExcalidrawElementSeed } from "../utils/elementBuilders";

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCanvasActions(excalidrawAPI: ExcalidrawImperativeAPI | null) {

    /**
     * Convert structured canvas elements into Excalidraw elements and add to canvas.
     */
    const executeActions = useCallback((actionElements: CanvasActionElement[]) => {
        if (!excalidrawAPI) {
            console.warn("[CanvasActions] No excalidrawAPI available");
            return;
        }

        const existingElements = excalidrawAPI.getSceneElements?.() || [];

        // Get viewport center for positioning
        const appState = excalidrawAPI.getAppState?.() || {};
        const viewportCenterX = (appState.scrollX ? -appState.scrollX : 0) +
            ((appState.width || window.innerWidth) / 2) / (appState.zoom?.value || 1);
        const viewportCenterY = (appState.scrollY ? -appState.scrollY : 0) +
            ((appState.height || window.innerHeight) / 2) / (appState.zoom?.value || 1);

        // Map from AI element IDs to generated Excalidraw IDs
        const idMap: Record<string, string> = {};
        const createdElements: ExcalidrawElementSeed[] = [];

        // First pass: create shapes (non-arrows)
        const shapes = actionElements.filter(el => el.type !== "arrow" && el.type !== "line");
        const arrows = actionElements.filter(el => el.type === "arrow" || el.type === "line");

        for (const action of shapes) {
            const excalId = randomId();
            if (action.id) idMap[action.id] = excalId;

            const elements = createShapeElement(action, excalId, { viewportCenterX, viewportCenterY });
            createdElements.push(...elements);
        }

        // Build index Map for O(1) lookups during arrow binding (Vercel: js-index-maps)
        const elementById = new Map<string, ExcalidrawElementSeed>(createdElements.map(el => [el.id, el]));

        // Second pass: create arrows with bindings
        for (const action of arrows) {
            const excalId = randomId();
            if (action.id) idMap[action.id] = excalId;

            const elements = createArrowElement(action, excalId, {
                viewportCenterX, viewportCenterY, idMap, elementById,
            });
            createdElements.push(...elements);
        }

        // Add to canvas
        // Cast seed elements to ExcalidrawElement at the API boundary.
        // Excalidraw hydrates missing computed fields (strokeStyle, etc.) internally.
        if (createdElements.length > 0) {
            excalidrawAPI.updateScene({
                elements: [...existingElements, ...createdElements as unknown as ExcalidrawElement[]],
            });

            setTimeout(() => {
                excalidrawAPI.scrollToContent?.(
                    createdElements as unknown as ExcalidrawElement[],
                    { fitToViewport: true, animate: true },
                );
            }, 100);

            console.log(`[CanvasActions] Added ${createdElements.length} elements to canvas`);
        }

        return createdElements.length;
    }, [excalidrawAPI]);

    return { executeActions };
}
