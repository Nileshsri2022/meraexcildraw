/**
 * useCanvasActions — Executes AI-generated canvas commands on Excalidraw.
 *
 * Parses ```canvas_action JSON blocks from chat responses and converts
 * them into real Excalidraw elements on the whiteboard.
 */
import { useCallback, useRef } from "react";

/** Generate a random ID compatible with Excalidraw elements */
function randomId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface CanvasActionElement {
    id?: string;
    type: "rectangle" | "ellipse" | "diamond" | "text" | "arrow" | "line";
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    text?: string;
    backgroundColor?: string;
    strokeColor?: string;
    fontSize?: number;
    startId?: string;  // For arrows — ID of source element
    endId?: string;    // For arrows — ID of target element
}

// ─── Canvas Action Parser ────────────────────────────────────────────────────

// Match raw markdown: ```canvas_action\n[...]\n```
const RAW_REGEX = /```canvas_action\s*\n([\s\S]*?)```/g;

// Match HTML rendered by Python's markdown lib: <pre><code class="language-canvas_action">...</code></pre>
const HTML_REGEX = /<pre><code[^>]*class="[^"]*canvas_action[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/g;

// Match HTML entities that Python's markdown might escape
function decodeHtmlEntities(text: string): string {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
}

/**
 * Extract canvas_action JSON blocks from AI response text or HTML.
 * Handles both raw markdown and rendered HTML formats.
 */
export function parseCanvasActions(text: string): CanvasActionElement[][] {
    const actions: CanvasActionElement[][] = [];

    // Try raw markdown format first
    RAW_REGEX.lastIndex = 0;
    let match;
    while ((match = RAW_REGEX.exec(text)) !== null) {
        try {
            const parsed = JSON.parse(match[1]);
            if (Array.isArray(parsed)) {
                actions.push(parsed);
            }
        } catch {
            console.warn("[CanvasActions] Failed to parse raw action block:", match[1]);
        }
    }

    // Try HTML format (from Python markdown rendering)
    if (actions.length === 0) {
        HTML_REGEX.lastIndex = 0;
        while ((match = HTML_REGEX.exec(text)) !== null) {
            try {
                const decoded = decodeHtmlEntities(match[1]);
                const parsed = JSON.parse(decoded);
                if (Array.isArray(parsed)) {
                    actions.push(parsed);
                }
            } catch {
                console.warn("[CanvasActions] Failed to parse HTML action block:", match[1]);
            }
        }
    }

    return actions;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCanvasActions(excalidrawAPI: any) {
    const processedRef = useRef<Set<string>>(new Set());

    /**
     * Convert AI action elements into Excalidraw elements and add to canvas.
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
        const createdElements: any[] = [];

        // First pass: create shapes (non-arrows)
        const shapes = actionElements.filter(el => el.type !== "arrow" && el.type !== "line");
        const arrows = actionElements.filter(el => el.type === "arrow" || el.type === "line");

        for (const action of shapes) {
            const excalId = randomId();

            // Map AI id -> Excalidraw id
            if (action.id) {
                idMap[action.id] = excalId;
            }

            const x = action.x ?? viewportCenterX;
            const y = action.y ?? viewportCenterY;
            const width = action.width ?? 200;
            const height = action.height ?? (action.type === "text" ? 40 : 100);

            const baseElement: any = {
                id: excalId,
                type: action.type === "diamond" ? "diamond" : action.type === "ellipse" ? "ellipse" : action.type === "text" ? "text" : "rectangle",
                x,
                y,
                width,
                height,
                strokeColor: action.strokeColor || "#1e1e1e",
                backgroundColor: action.backgroundColor || "transparent",
                fillStyle: action.backgroundColor ? "solid" : "hachure",
                strokeWidth: 2,
                roughness: 1,
                opacity: 100,
                angle: 0,
                groupIds: [],
                frameId: null,
                index: `a${Date.now()}`,
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

            // Handle text inside shapes
            if (action.text && action.type !== "text") {
                // Create a text element bound to the shape
                const textId = randomId();
                const textElement: any = {
                    id: textId,
                    type: "text",
                    x: x + 10,
                    y: y + height / 2 - 12,
                    width: width - 20,
                    height: 24,
                    text: action.text,
                    fontSize: action.fontSize || 20,
                    fontFamily: 1,
                    textAlign: "center",
                    verticalAlign: "middle",
                    strokeColor: action.strokeColor || "#1e1e1e",
                    backgroundColor: "transparent",
                    fillStyle: "solid",
                    strokeWidth: 1,
                    roughness: 1,
                    opacity: 100,
                    angle: 0,
                    groupIds: [],
                    frameId: null,
                    index: `a${Date.now() + 1}`,
                    roundness: null,
                    seed: Math.floor(Math.random() * 100000),
                    version: 1,
                    versionNonce: Math.floor(Math.random() * 100000),
                    isDeleted: false,
                    boundElements: null,
                    updated: Date.now(),
                    link: null,
                    locked: false,
                    containerId: excalId,
                    originalText: action.text,
                    autoResize: true,
                    lineHeight: 1.25,
                };

                baseElement.boundElements = [{ id: textId, type: "text" }];
                createdElements.push(baseElement, textElement);
            } else if (action.type === "text") {
                // Standalone text element
                baseElement.text = action.text || "";
                baseElement.fontSize = action.fontSize || 28;
                baseElement.fontFamily = 1;
                baseElement.textAlign = "left";
                baseElement.verticalAlign = "top";
                baseElement.originalText = action.text || "";
                baseElement.autoResize = true;
                baseElement.lineHeight = 1.25;
                baseElement.roundness = null;
                baseElement.backgroundColor = "transparent";
                baseElement.fillStyle = "solid";
                createdElements.push(baseElement);
            } else {
                createdElements.push(baseElement);
            }
        }

        // Second pass: create arrows with bindings
        for (const action of arrows) {
            const excalId = randomId();

            if (action.id) {
                idMap[action.id] = excalId;
            }

            const startElementId = action.startId ? idMap[action.startId] : null;
            const endElementId = action.endId ? idMap[action.endId] : null;

            // Find source and target elements for positioning
            const startEl = startElementId
                ? createdElements.find(e => e.id === startElementId)
                : null;
            const endEl = endElementId
                ? createdElements.find(e => e.id === endElementId)
                : null;

            const startX = startEl
                ? startEl.x + (startEl.width || 200) / 2
                : (action.x ?? viewportCenterX);
            const startY = startEl
                ? startEl.y + (startEl.height || 100)
                : (action.y ?? viewportCenterY);
            const endX = endEl
                ? endEl.x + (endEl.width || 200) / 2
                : startX;
            const endY = endEl
                ? endEl.y
                : startY + 150;

            const arrowElement: any = {
                id: excalId,
                type: "arrow",
                x: startX,
                y: startY,
                width: endX - startX,
                height: endY - startY,
                strokeColor: action.strokeColor || "#1e1e1e",
                backgroundColor: "transparent",
                fillStyle: "solid",
                strokeWidth: 2,
                roughness: 1,
                opacity: 100,
                angle: 0,
                groupIds: [],
                frameId: null,
                index: `a${Date.now() + 2}`,
                roundness: { type: 2 },
                seed: Math.floor(Math.random() * 100000),
                version: 1,
                versionNonce: Math.floor(Math.random() * 100000),
                isDeleted: false,
                boundElements: [],
                updated: Date.now(),
                link: null,
                locked: false,
                points: [[0, 0], [endX - startX, endY - startY]],
                lastCommittedPoint: null,
                startBinding: startElementId ? {
                    elementId: startElementId,
                    focus: 0,
                    gap: 1,
                    fixedPoint: null,
                } : null,
                endBinding: endElementId ? {
                    elementId: endElementId,
                    focus: 0,
                    gap: 1,
                    fixedPoint: null,
                } : null,
                startArrowhead: null,
                endArrowhead: "arrow",
                elbowed: false,
            };

            // Update the source/target elements' boundElements to include this arrow
            if (startElementId) {
                const sourceEl = createdElements.find(e => e.id === startElementId);
                if (sourceEl) {
                    sourceEl.boundElements = [
                        ...(sourceEl.boundElements || []),
                        { id: excalId, type: "arrow" },
                    ];
                }
            }
            if (endElementId) {
                const targetEl = createdElements.find(e => e.id === endElementId);
                if (targetEl) {
                    targetEl.boundElements = [
                        ...(targetEl.boundElements || []),
                        { id: excalId, type: "arrow" },
                    ];
                }
            }

            // Add text label on arrow
            if (action.text) {
                const labelId = randomId();
                const labelElement: any = {
                    id: labelId,
                    type: "text",
                    x: startX + (endX - startX) / 2 - 20,
                    y: startY + (endY - startY) / 2 - 12,
                    width: 40,
                    height: 24,
                    text: action.text,
                    fontSize: action.fontSize || 16,
                    fontFamily: 1,
                    textAlign: "center",
                    verticalAlign: "middle",
                    strokeColor: "#1e1e1e",
                    backgroundColor: "transparent",
                    fillStyle: "solid",
                    strokeWidth: 1,
                    roughness: 1,
                    opacity: 100,
                    angle: 0,
                    groupIds: [],
                    frameId: null,
                    index: `a${Date.now() + 3}`,
                    roundness: null,
                    seed: Math.floor(Math.random() * 100000),
                    version: 1,
                    versionNonce: Math.floor(Math.random() * 100000),
                    isDeleted: false,
                    boundElements: null,
                    updated: Date.now(),
                    link: null,
                    locked: false,
                    containerId: excalId,
                    originalText: action.text,
                    autoResize: true,
                    lineHeight: 1.25,
                };

                arrowElement.boundElements = [{ id: labelId, type: "text" }];
                createdElements.push(arrowElement, labelElement);
            } else {
                createdElements.push(arrowElement);
            }
        }

        // Add all new elements to the canvas
        if (createdElements.length > 0) {
            excalidrawAPI.updateScene({
                elements: [...existingElements, ...createdElements],
            });

            // Scroll to the new elements
            setTimeout(() => {
                excalidrawAPI.scrollToContent?.(createdElements, { fitToViewport: true, animate: true });
            }, 100);

            console.log(`[CanvasActions] Added ${createdElements.length} elements to canvas`);
        }
    }, [excalidrawAPI]);

    /**
     * Process a chat message — extract and execute any canvas actions.
     * Returns the message HTML with canvas_action blocks replaced by a badge.
     */
    const processMessage = useCallback((messageId: string, html: string, rawContent?: string): string => {
        // Don't process the same message twice
        if (processedRef.current.has(messageId)) return html;

        // Try parsing from raw content first (has original ```canvas_action blocks)
        // Then fall back to HTML (has <pre><code class="language-canvas_action">)
        const actions = rawContent
            ? parseCanvasActions(rawContent)
            : parseCanvasActions(html);

        // If raw didn't find anything, try HTML
        const finalActions = actions.length > 0 ? actions : parseCanvasActions(html);

        if (finalActions.length > 0) {
            processedRef.current.add(messageId);

            for (const actionGroup of finalActions) {
                executeActions(actionGroup);
            }

            // Remove canvas_action blocks from displayed HTML
            const badge = '<div class="canvas-action-badge">✅ Elements added to canvas!</div>';
            const cleaned = html
                .replace(/```canvas_action\s*\n[\s\S]*?```/g, badge)
                .replace(/<pre><code[^>]*class="[^"]*canvas_action[^"]*"[^>]*>[\s\S]*?<\/code><\/pre>/g, badge);

            return cleaned;
        }

        return html;
    }, [executeActions]);

    return { processMessage, executeActions, parseCanvasActions: parseCanvasActions };
}
