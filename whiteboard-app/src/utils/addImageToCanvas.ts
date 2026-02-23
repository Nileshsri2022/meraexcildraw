import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ImageCanvasOptions } from "../types/ai-tools";
import { toFileId, toDataURL, toFractionalIndex } from "../types/ai-tools";

/**
 * Creates an image element on the Excalidraw canvas.
 *
 * This consolidates the repeated pattern of:
 *  1. Adding a file to Excalidraw's file store
 *  2. Creating an image element referencing that file
 *  3. Updating the scene and scrolling to content
 *
 * Uses branded type helpers (toFileId, toDataURL, toFractionalIndex)
 * and ExcalidrawElement boundary casts for type interop with Excalidraw.
 *
 * Returns the created element ID.
 */
export async function addImageToCanvas(
    api: ExcalidrawImperativeAPI,
    dataURL: string,
    opts: ImageCanvasOptions,
): Promise<string> {
    const fileId = `${opts.idPrefix || "ai-img"}-${Date.now()}`;
    const elementId = `${fileId}-el`;

    console.log(`[addImageToCanvas] Starting. fileId=${fileId}, dataURL length=${dataURL.length}, size=${opts.width}x${opts.height}`);

    // Register the binary file with Excalidraw's file store
    try {
        await api.addFiles([{
            id: toFileId(fileId),
            dataURL: toDataURL(dataURL),
            mimeType: "image/png",
            created: Date.now(),
        }]);
        console.log(`[addImageToCanvas] File registered successfully`);
    } catch (err) {
        console.error(`[addImageToCanvas] Failed to register file:`, err);
        throw err;
    }

    // Compute a good position — avoid stacking on top of existing elements
    const currentElements = api.getSceneElements();
    let posX = opts.x ?? 100;
    let posY = opts.y ?? 100;

    // If there are existing elements, place the new image to the right of the rightmost element
    if (currentElements.length > 0) {
        const maxRight = Math.max(...currentElements.map(el => el.x + el.width));
        const avgY = currentElements.reduce((sum, el) => sum + el.y, 0) / currentElements.length;
        posX = maxRight + 50; // 50px gap to the right
        posY = avgY;
    }

    // Build the image element descriptor
    const imageElement = {
        type: "image" as const,
        id: elementId,
        x: posX,
        y: posY,
        width: opts.width,
        height: opts.height,
        angle: 0,
        strokeColor: "transparent",
        backgroundColor: "transparent",
        fillStyle: "solid" as const,
        strokeWidth: 0,
        strokeStyle: "solid" as const,
        roughness: 0,
        opacity: 100,
        groupIds: [] as readonly string[],
        frameId: null,
        index: toFractionalIndex("a0"),
        roundness: null,
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        fileId: toFileId(fileId),
        status: "saved" as const,
        scale: [1, 1] as [number, number],
    };

    console.log(`[addImageToCanvas] Placing image at (${posX}, ${posY}), existing elements: ${currentElements.length}`);

    // Cast seed element to ExcalidrawElement at the API boundary.
    // Excalidraw hydrates missing computed fields internally.
    const imageAsElement = imageElement as unknown as ExcalidrawElement;

    // Add to scene and scroll into view
    api.updateScene({
        elements: [...currentElements, imageAsElement],
    });

    // Small delay to let Excalidraw process the scene update before scrolling
    await new Promise(resolve => setTimeout(resolve, 100));

    api.scrollToContent([imageAsElement], { fitToContent: true });

    if (import.meta.env.DEV) {
        console.log(`[addImageToCanvas] Scene updated and scrolled. Total elements now: ${api.getSceneElements().length}`);

        // Verify the element was actually added
        const addedEl = api.getSceneElements().find(el => el.id === elementId);
        if (!addedEl) {
            console.error(`[addImageToCanvas] WARNING: Element ${elementId} was NOT found in scene after updateScene!`);
        } else {
            console.log(`[addImageToCanvas] Verified: element ${elementId} exists in scene, isDeleted=${addedEl.isDeleted}`);
        }
    }

    return elementId;
}
