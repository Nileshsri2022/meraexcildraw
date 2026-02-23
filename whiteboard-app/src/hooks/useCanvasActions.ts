/**
 * useCanvasActions — Executes structured canvas commands on Excalidraw.
 *
 * Receives pre-parsed canvas elements from the backend (via LangChain
 * structured output) and converts them into Excalidraw scene elements.
 *
 * No parsing needed — the backend sends clean, validated JSON.
 */
import { useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { CanvasActionElement } from "./useCanvasChat";

/** Generate a random ID compatible with Excalidraw elements */
function randomId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/**
 * Shape of an element we construct before passing to `updateScene()`.
 *
 * Not a full ExcalidrawElement (which has computed fields) — this is the
 * "seed" shape that Excalidraw accepts and hydrates internally.
 */
interface ExcalidrawElementSeed {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    strokeColor: string;
    backgroundColor: string;
    fillStyle: string;
    strokeWidth: number;
    roughness: number;
    opacity: number;
    angle: number;
    groupIds: readonly string[];
    frameId: null;
    index: string;
    roundness: { type: number } | null;
    seed: number;
    version: number;
    versionNonce: number;
    isDeleted: boolean;
    boundElements: ReadonlyArray<{ id: string; type: string }> | null;
    updated: number;
    link: null;
    locked: boolean;
    // Text-specific
    text?: string;
    fontSize?: number;
    fontFamily?: number;
    textAlign?: string;
    verticalAlign?: string;
    originalText?: string;
    autoResize?: boolean;
    lineHeight?: number;
    containerId?: string;
    // Arrow-specific
    points?: readonly (readonly [number, number])[];
    lastCommittedPoint?: null;
    startBinding?: { elementId: string; focus: number; gap: number; fixedPoint: null } | null;
    endBinding?: { elementId: string; focus: number; gap: number; fixedPoint: null } | null;
    startArrowhead?: string | null;
    endArrowhead?: string | null;
    elbowed?: boolean;
}

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

            const x = action.x ?? viewportCenterX;
            const y = action.y ?? viewportCenterY;
            const width = action.width ?? 200;
            const height = action.height ?? (action.type === "text" ? 40 : 100);

            const baseElement: ExcalidrawElementSeed = {
                id: excalId,
                type: action.type === "diamond" ? "diamond" : action.type === "ellipse" ? "ellipse" : action.type === "text" ? "text" : "rectangle",
                x, y, width, height,
                strokeColor: action.strokeColor || "#1e1e1e",
                backgroundColor: action.backgroundColor || "transparent",
                fillStyle: action.backgroundColor ? "solid" : "hachure",
                strokeWidth: 2,
                roughness: 1,
                opacity: 100,
                angle: 0,
                groupIds: [],
                frameId: null,
                index: `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                roundness: { type: 3 },
                seed: Math.floor(Math.random() * 100000),
                version: 1,
                versionNonce: Math.floor(Math.random() * 100000),
                isDeleted: false,
                boundElements: [],
                updated: Date.now(),
                link: null,
                locked: false,
            };

            if (action.text && action.type !== "text") {
                const textId = randomId();
                const textElement: ExcalidrawElementSeed = {
                    id: textId,
                    type: "text",
                    x: x + 10, y: y + height / 2 - 12,
                    width: width - 20, height: 24,
                    text: action.text,
                    fontSize: action.fontSize || 20,
                    fontFamily: 1,
                    textAlign: "center",
                    verticalAlign: "middle",
                    strokeColor: action.strokeColor || "#1e1e1e",
                    backgroundColor: "transparent",
                    fillStyle: "solid",
                    strokeWidth: 1, roughness: 1, opacity: 100, angle: 0,
                    groupIds: [], frameId: null,
                    index: `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    roundness: null,
                    seed: Math.floor(Math.random() * 100000),
                    version: 1,
                    versionNonce: Math.floor(Math.random() * 100000),
                    isDeleted: false, boundElements: null,
                    updated: Date.now(), link: null, locked: false,
                    containerId: excalId,
                    originalText: action.text,
                    autoResize: true,
                    lineHeight: 1.25,
                };
                baseElement.boundElements = [{ id: textId, type: "text" }];
                createdElements.push(baseElement, textElement);
            } else if (action.type === "text") {
                Object.assign(baseElement, {
                    text: action.text || "",
                    fontSize: action.fontSize || 28,
                    fontFamily: 1,
                    textAlign: "left",
                    verticalAlign: "top",
                    originalText: action.text || "",
                    autoResize: true,
                    lineHeight: 1.25,
                    roundness: null,
                    backgroundColor: "transparent",
                    fillStyle: "solid",
                });
                createdElements.push(baseElement);
            } else {
                createdElements.push(baseElement);
            }
        }
        // Build index Map for O(1) lookups during arrow binding (Vercel: js-index-maps)
        const elementById = new Map<string, ExcalidrawElementSeed>(createdElements.map(el => [el.id, el]));

        // Second pass: create arrows with bindings
        for (const action of arrows) {
            const excalId = randomId();
            if (action.id) idMap[action.id] = excalId;

            const startElementId = action.startId ? idMap[action.startId] : null;
            const endElementId = action.endId ? idMap[action.endId] : null;

            const startEl = startElementId ? elementById.get(startElementId) ?? null : null;
            const endEl = endElementId ? elementById.get(endElementId) ?? null : null;

            const startX = startEl ? startEl.x + (startEl.width || 200) / 2 : (action.x ?? viewportCenterX);
            const startY = startEl ? startEl.y + (startEl.height || 100) : (action.y ?? viewportCenterY);
            const endX = endEl ? endEl.x + (endEl.width || 200) / 2 : startX;
            const endY = endEl ? endEl.y : startY + 150;

            const arrowElement: ExcalidrawElementSeed = {
                id: excalId,
                type: "arrow",
                x: startX, y: startY,
                width: endX - startX, height: endY - startY,
                strokeColor: action.strokeColor || "#1e1e1e",
                backgroundColor: "transparent",
                fillStyle: "solid",
                strokeWidth: 2, roughness: 1, opacity: 100, angle: 0,
                groupIds: [], frameId: null,
                index: `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                roundness: { type: 2 },
                seed: Math.floor(Math.random() * 100000),
                version: 1,
                versionNonce: Math.floor(Math.random() * 100000),
                isDeleted: false, boundElements: [],
                updated: Date.now(), link: null, locked: false,
                points: [[0, 0], [endX - startX, endY - startY]],
                lastCommittedPoint: null,
                startBinding: startElementId ? { elementId: startElementId, focus: 0, gap: 1, fixedPoint: null } : null,
                endBinding: endElementId ? { elementId: endElementId, focus: 0, gap: 1, fixedPoint: null } : null,
                startArrowhead: null,
                endArrowhead: "arrow",
                elbowed: false,
            };

            // Update bound elements via index Map (O(1) lookup)
            if (startElementId) {
                const src = elementById.get(startElementId);
                if (src) src.boundElements = [...(src.boundElements || []), { id: excalId, type: "arrow" }];
            }
            if (endElementId) {
                const tgt = elementById.get(endElementId);
                if (tgt) tgt.boundElements = [...(tgt.boundElements || []), { id: excalId, type: "arrow" }];
            }

            // Arrow label
            if (action.text) {
                const labelId = randomId();
                const labelElement: ExcalidrawElementSeed = {
                    id: labelId, type: "text",
                    x: startX + (endX - startX) / 2 - 20,
                    y: startY + (endY - startY) / 2 - 12,
                    width: 40, height: 24,
                    text: action.text,
                    fontSize: action.fontSize || 16,
                    fontFamily: 1, textAlign: "center", verticalAlign: "middle",
                    strokeColor: "#1e1e1e", backgroundColor: "transparent",
                    fillStyle: "solid", strokeWidth: 1, roughness: 1,
                    opacity: 100, angle: 0, groupIds: [], frameId: null,
                    index: `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    roundness: null,
                    seed: Math.floor(Math.random() * 100000),
                    version: 1,
                    versionNonce: Math.floor(Math.random() * 100000),
                    isDeleted: false, boundElements: null,
                    updated: Date.now(), link: null, locked: false,
                    containerId: excalId,
                    originalText: action.text,
                    autoResize: true, lineHeight: 1.25,
                };
                arrowElement.boundElements = [{ id: labelId, type: "text" }];
                createdElements.push(arrowElement, labelElement);
            } else {
                createdElements.push(arrowElement);
            }
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
