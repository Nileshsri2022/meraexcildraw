/**
 * elementBuilders — Pure factory functions for Excalidraw element seeds.
 *
 * Extracted from useCanvasActions's 200-line executeActions callback
 * (P2.3 — clean-code: Extract Method, reduce function size).
 *
 * Each function takes a `CanvasActionElement` (from the backend) and returns
 * one or more `ExcalidrawElementSeed` objects ready for `updateScene()`.
 */
import type { CanvasActionElement } from "../hooks/useCanvasChat";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Shape of an element we construct before passing to `updateScene()`.
 *
 * Not a full ExcalidrawElement (which has computed fields) — this is the
 * "seed" shape that Excalidraw accepts and hydrates internally.
 */
export interface ExcalidrawElementSeed {
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generate a random ID compatible with Excalidraw elements */
export function randomId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

/** Generate a unique fractional index for Excalidraw element ordering */
function fractionalIndex(): string {
    return `a${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Generate common element base properties */
function baseProps(id: string): Pick<
    ExcalidrawElementSeed,
    'id' | 'index' | 'seed' | 'version' | 'versionNonce' | 'isDeleted' |
    'updated' | 'link' | 'locked' | 'groupIds' | 'frameId' | 'angle' | 'opacity'
> {
    return {
        id,
        index: fractionalIndex(),
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        updated: Date.now(),
        link: null,
        locked: false,
        groupIds: [],
        frameId: null,
        angle: 0,
        opacity: 100,
    };
}

// ─── Builders ────────────────────────────────────────────────────────────────

interface ShapeContext {
    viewportCenterX: number;
    viewportCenterY: number;
}

/**
 * Build a shape element (rectangle, ellipse, diamond, text) from a canvas action.
 *
 * Returns an array because shapes with text labels produce 2 elements:
 * the container shape + a bound text element.
 */
export function createShapeElement(
    action: CanvasActionElement,
    excalId: string,
    ctx: ShapeContext,
): ExcalidrawElementSeed[] {
    const x = action.x ?? ctx.viewportCenterX;
    const y = action.y ?? ctx.viewportCenterY;
    const width = action.width ?? 200;
    const height = action.height ?? (action.type === "text" ? 40 : 100);

    const resolvedType =
        action.type === "diamond" ? "diamond" :
            action.type === "ellipse" ? "ellipse" :
                action.type === "text" ? "text" :
                    "rectangle";

    const baseElement: ExcalidrawElementSeed = {
        ...baseProps(excalId),
        type: resolvedType,
        x, y, width, height,
        strokeColor: action.strokeColor || "#1e1e1e",
        backgroundColor: action.backgroundColor || "transparent",
        fillStyle: action.backgroundColor ? "solid" : "hachure",
        strokeWidth: 2,
        roughness: 1,
        roundness: { type: 3 },
        boundElements: [],
    };

    // Shape with text label → produce 2 elements
    if (action.text && action.type !== "text") {
        const textId = randomId();
        const textElement: ExcalidrawElementSeed = {
            ...baseProps(textId),
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
            strokeWidth: 1, roughness: 1,
            roundness: null,
            boundElements: null,
            containerId: excalId,
            originalText: action.text,
            autoResize: true,
            lineHeight: 1.25,
        };
        baseElement.boundElements = [{ id: textId, type: "text" }];
        return [baseElement, textElement];
    }

    // Standalone text element
    if (action.type === "text") {
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
        return [baseElement];
    }

    // Plain shape
    return [baseElement];
}

interface ArrowContext extends ShapeContext {
    idMap: Record<string, string>;
    elementById: Map<string, ExcalidrawElementSeed>;
}

/**
 * Build an arrow element with optional bindings and label.
 *
 * Returns an array because arrows with labels produce 2 elements:
 * the arrow + a bound text label.
 *
 * Also mutates `elementById` entries to add boundElements references
 * (arrow bindings require back-references on the target shapes).
 */
export function createArrowElement(
    action: CanvasActionElement,
    excalId: string,
    ctx: ArrowContext,
): ExcalidrawElementSeed[] {
    const startElementId = action.startId ? ctx.idMap[action.startId] : null;
    const endElementId = action.endId ? ctx.idMap[action.endId] : null;

    const startEl = startElementId ? ctx.elementById.get(startElementId) ?? null : null;
    const endEl = endElementId ? ctx.elementById.get(endElementId) ?? null : null;

    const startX = startEl ? startEl.x + (startEl.width || 200) / 2 : (action.x ?? ctx.viewportCenterX);
    const startY = startEl ? startEl.y + (startEl.height || 100) : (action.y ?? ctx.viewportCenterY);
    const endX = endEl ? endEl.x + (endEl.width || 200) / 2 : startX;
    const endY = endEl ? endEl.y : startY + 150;

    const arrowElement: ExcalidrawElementSeed = {
        ...baseProps(excalId),
        type: "arrow",
        x: startX, y: startY,
        width: endX - startX, height: endY - startY,
        strokeColor: action.strokeColor || "#1e1e1e",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2, roughness: 1,
        roundness: { type: 2 },
        boundElements: [],
        points: [[0, 0], [endX - startX, endY - startY]],
        lastCommittedPoint: null,
        startBinding: startElementId ? { elementId: startElementId, focus: 0, gap: 1, fixedPoint: null } : null,
        endBinding: endElementId ? { elementId: endElementId, focus: 0, gap: 1, fixedPoint: null } : null,
        startArrowhead: null,
        endArrowhead: "arrow",
        elbowed: false,
    };

    // Update bound elements on targets via index Map (O(1) lookup)
    if (startElementId) {
        const src = ctx.elementById.get(startElementId);
        if (src) src.boundElements = [...(src.boundElements || []), { id: excalId, type: "arrow" }];
    }
    if (endElementId) {
        const tgt = ctx.elementById.get(endElementId);
        if (tgt) tgt.boundElements = [...(tgt.boundElements || []), { id: excalId, type: "arrow" }];
    }

    // Arrow with label → produce 2 elements
    if (action.text) {
        const labelId = randomId();
        const labelElement: ExcalidrawElementSeed = {
            ...baseProps(labelId),
            type: "text",
            x: startX + (endX - startX) / 2 - 20,
            y: startY + (endY - startY) / 2 - 12,
            width: 40, height: 24,
            text: action.text,
            fontSize: action.fontSize || 16,
            fontFamily: 1, textAlign: "center", verticalAlign: "middle",
            strokeColor: "#1e1e1e", backgroundColor: "transparent",
            fillStyle: "solid", strokeWidth: 1, roughness: 1,
            roundness: null,
            boundElements: null,
            containerId: excalId,
            originalText: action.text,
            autoResize: true, lineHeight: 1.25,
        };
        arrowElement.boundElements = [{ id: labelId, type: "text" }];
        return [arrowElement, labelElement];
    }

    return [arrowElement];
}
