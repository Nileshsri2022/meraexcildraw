// Element Types - Core type definitions for whiteboard elements

export type ElementType =
    | "rectangle"
    | "ellipse"
    | "diamond"
    | "line"
    | "arrow"
    | "text"
    | "freedraw"
    | "image";

export interface Point {
    x: number;
    y: number;
}

export interface BoundingBox {
    x: number;
    y: number;
    width: number;
    height: number;
}

// Base element interface that all elements extend
export interface BaseElement {
    id: string;
    type: ElementType;
    x: number;
    y: number;
    width: number;
    height: number;
    angle: number;
    strokeColor: string;
    backgroundColor: string;
    fillStyle: "solid" | "hachure" | "cross-hatch" | "none";
    strokeWidth: number;
    strokeStyle: "solid" | "dashed" | "dotted";
    roughness: number;
    opacity: number;
    isDeleted: boolean;
    locked: boolean;
    version: number;
    versionNonce: number;
    seed: number;
    groupIds: string[];
    boundElements: { id: string; type: "arrow" | "text" }[] | null;
    updated: number;
}

// Rectangle element
export interface RectangleElement extends BaseElement {
    type: "rectangle";
    roundness: { type: "proportional_radius" | "adaptive_radius"; value?: number } | null;
}

// Ellipse element
export interface EllipseElement extends BaseElement {
    type: "ellipse";
}

// Diamond element
export interface DiamondElement extends BaseElement {
    type: "diamond";
}

// Line element (for lines and arrows)
export interface LinearElement extends BaseElement {
    type: "line" | "arrow";
    points: readonly Point[];
    startBinding: PointBinding | null;
    endBinding: PointBinding | null;
    startArrowhead: Arrowhead | null;
    endArrowhead: Arrowhead | null;
}

export interface PointBinding {
    elementId: string;
    focus: number;
    gap: number;
}

export type Arrowhead = "arrow" | "bar" | "dot" | "triangle";

// Text element
export interface TextElement extends BaseElement {
    type: "text";
    text: string;
    fontSize: number;
    fontFamily: FontFamily;
    textAlign: TextAlign;
    verticalAlign: VerticalAlign;
    baseline: number;
    containerId: string | null;
    originalText: string;
    lineHeight: number;
}

export type FontFamily = 1 | 2 | 3; // 1: Hand-drawn, 2: Normal, 3: Code
export type TextAlign = "left" | "center" | "right";
export type VerticalAlign = "top" | "middle" | "bottom";

// Freedraw element
export interface FreedrawElement extends BaseElement {
    type: "freedraw";
    points: readonly Point[];
    pressures: readonly number[];
    simulatePressure: boolean;
}

// Image element
export interface ImageElement extends BaseElement {
    type: "image";
    fileId: string | null;
    status: "pending" | "saved" | "error";
    scale: [number, number];
}

// Union type of all elements
export type WhiteboardElement =
    | RectangleElement
    | EllipseElement
    | DiamondElement
    | LinearElement
    | TextElement
    | FreedrawElement
    | ImageElement;

// Non-deleted element type
export type NonDeletedElement = WhiteboardElement & { isDeleted: false };

// Element with version tracking for collaboration
export type OrderedElement = WhiteboardElement & {
    index: string;
};
