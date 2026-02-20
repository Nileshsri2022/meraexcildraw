import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

/**
 * Creates an image element on the Excalidraw canvas.
 *
 * This consolidates the repeated pattern of:
 *  1. Adding a file to Excalidraw's file store
 *  2. Creating an image element referencing that file
 *  3. Updating the scene and scrolling to content
 *
 * Returns the created element ID.
 */
export async function addImageToCanvas(
    api: ExcalidrawImperativeAPI,
    dataURL: string,
    opts: {
        x?: number;
        y?: number;
        width: number;
        height: number;
        idPrefix?: string;
    },
): Promise<string> {
    const fileId = `${opts.idPrefix || "ai-img"}-${Date.now()}`;
    const elementId = `${fileId}-el`;

    await api.addFiles([{
        id: fileId as any,
        dataURL: dataURL as any,
        mimeType: "image/png",
        created: Date.now(),
    }]);

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
        groupIds: [] as string[],
        frameId: null,
        index: "a0" as any,
        roundness: null,
        seed: Math.floor(Math.random() * 100000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 100000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        fileId: fileId as any,
        status: "saved" as const,
        scale: [1, 1] as [number, number],
    };

    const currentElements = api.getSceneElements();
    api.updateScene({
        elements: [...currentElements, imageElement as any],
    });
    api.scrollToContent([imageElement as any], { fitToContent: true });

    return elementId;
}
