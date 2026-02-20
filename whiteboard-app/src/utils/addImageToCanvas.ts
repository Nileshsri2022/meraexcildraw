import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
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
 * instead of scattered `as any` casts for type interop with Excalidraw.
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

    // Register the binary file with Excalidraw's file store
    await api.addFiles([{
        id: toFileId(fileId),
        dataURL: toDataURL(dataURL),
        mimeType: "image/png",
        created: Date.now(),
    }]);

    // Build the image element descriptor
    const imageElement = {
        type: "image" as const,
        id: elementId,
        x: opts.x ?? 100,
        y: opts.y ?? 100,
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

    // Add to scene and scroll into view
    const currentElements = api.getSceneElements();
    api.updateScene({
        elements: [...currentElements, imageElement as any],
    });
    api.scrollToContent([imageElement as any], { fitToContent: true });

    return elementId;
}
