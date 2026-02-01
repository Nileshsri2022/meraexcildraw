import { nanoid } from "nanoid";
import type {
    WhiteboardElement,
    RectangleElement,
    EllipseElement,
    DiamondElement,
    LinearElement,
    TextElement,
    FreedrawElement,
    Point,
    ElementType,
} from "./types";

// Generate unique ID
export const generateId = (): string => nanoid();

// Generate random seed for rough.js
export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31);

// Default element properties
const DEFAULT_ELEMENT_PROPS = {
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid" as const,
    strokeWidth: 2,
    strokeStyle: "solid" as const,
    roughness: 1,
    opacity: 100,
    isDeleted: false,
    locked: false,
    groupIds: [],
    boundElements: null,
    angle: 0,
};

// Create a new element at a given position
export const createElement = (
    type: ElementType,
    x: number,
    y: number,
    options: Partial<WhiteboardElement> = {}
): WhiteboardElement => {
    const baseProps = {
        id: generateId(),
        type,
        x,
        y,
        width: 0,
        height: 0,
        version: 1,
        versionNonce: randomSeed(),
        seed: randomSeed(),
        updated: Date.now(),
        ...DEFAULT_ELEMENT_PROPS,
        ...options,
    };

    switch (type) {
        case "rectangle":
            return {
                ...baseProps,
                type: "rectangle",
                roundness: (options as any).roundness ?? null,
            } as RectangleElement;

        case "ellipse":
            return {
                ...baseProps,
                type: "ellipse",
            } as EllipseElement;

        case "diamond":
            return {
                ...baseProps,
                type: "diamond",
            } as DiamondElement;

        case "line":
        case "arrow":
            return {
                ...baseProps,
                type,
                points: [{ x: 0, y: 0 }],
                startBinding: null,
                endBinding: null,
                startArrowhead: null,
                endArrowhead: type === "arrow" ? "arrow" : null,
            } as LinearElement;

        case "text":
            return {
                ...baseProps,
                type: "text",
                text: (options as any).text ?? "",
                fontSize: (options as any).fontSize ?? 20,
                fontFamily: (options as any).fontFamily ?? 1,
                textAlign: (options as any).textAlign ?? "left",
                verticalAlign: (options as any).verticalAlign ?? "top",
                baseline: (options as any).baseline ?? 0,
                containerId: (options as any).containerId ?? null,
                originalText: (options as any).originalText ?? "",
                lineHeight: (options as any).lineHeight ?? 1.25,
            } as TextElement;

        case "freedraw":
            return {
                ...baseProps,
                type: "freedraw",
                points: [],
                pressures: [],
                simulatePressure: true,
            } as FreedrawElement;

        default:
            return baseProps as WhiteboardElement;
    }
};

// Update element with new properties
export const mutateElement = <T extends WhiteboardElement>(
    element: T,
    updates: Partial<T>
): T => {
    return {
        ...element,
        ...updates,
        version: element.version + 1,
        versionNonce: randomSeed(),
        updated: Date.now(),
    };
};

// Create a copy of an element with a new ID
export const duplicateElement = <T extends WhiteboardElement>(
    element: T,
    offsetX = 10,
    offsetY = 10
): T => {
    return {
        ...element,
        id: generateId(),
        x: element.x + offsetX,
        y: element.y + offsetY,
        version: 1,
        versionNonce: randomSeed(),
        seed: randomSeed(),
        updated: Date.now(),
    };
};

// Soft delete an element
export const deleteElement = <T extends WhiteboardElement>(element: T): T => {
    return mutateElement(element, { isDeleted: true } as Partial<T>);
};

// Restore a deleted element
export const restoreElement = <T extends WhiteboardElement>(element: T): T => {
    return mutateElement(element, { isDeleted: false } as Partial<T>);
};

// Get non-deleted elements
export const getNonDeletedElements = (
    elements: readonly WhiteboardElement[]
): WhiteboardElement[] => {
    return elements.filter((el) => !el.isDeleted);
};

// Get element bounds
export const getElementBounds = (
    element: WhiteboardElement
): { x: number; y: number; width: number; height: number } => {
    if (element.type === "freedraw" || element.type === "line" || element.type === "arrow") {
        const linearElement = element as LinearElement | FreedrawElement;
        const points = linearElement.points;

        if (points.length === 0) {
            return { x: element.x, y: element.y, width: 0, height: 0 };
        }

        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;

        for (const point of points) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        return {
            x: element.x + minX,
            y: element.y + minY,
            width: maxX - minX,
            height: maxY - minY,
        };
    }

    return {
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
    };
};

// Check if a point is inside an element
export const isPointInsideElement = (
    point: Point,
    element: WhiteboardElement,
    threshold = 0
): boolean => {
    const bounds = getElementBounds(element);
    return (
        point.x >= bounds.x - threshold &&
        point.x <= bounds.x + bounds.width + threshold &&
        point.y >= bounds.y - threshold &&
        point.y <= bounds.y + bounds.height + threshold
    );
};
