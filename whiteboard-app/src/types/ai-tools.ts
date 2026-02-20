/**
 * Shared type definitions for the AI Tools Dialog system.
 *
 * Applies TypeScript advanced type patterns:
 * - Discriminated unions for tab types
 * - Branded type helpers for Excalidraw interop
 * - Utility types for component props
 */
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// ─── Tab System ──────────────────────────────────────────────────────────────

/** All available AI tool tab identifiers */
export type AITab = "diagram" | "image" | "ocr" | "tts" | "sketch" | "history";

/** Tabs that can be set as the initial tab (history is not directly openable) */
export type InitialAITab = Exclude<AITab, "history">;

/** Tabs that have a "Generate" action */
export type GeneratableTab = Extract<AITab, "diagram" | "image" | "sketch" | "ocr">;

/** Map from tab to its generate button label */
export const TAB_GENERATE_LABELS: Record<GeneratableTab, string> = {
    diagram: "Generate Diagram",
    image: "Generate Image",
    sketch: "Generate from Sketch",
    ocr: "Extract Text",
} as const;

// ─── Excalidraw Branded Type Helpers ─────────────────────────────────────────

/**
 * Cast a plain string to Excalidraw's branded `FileId` type.
 * Excalidraw uses `string & { _brand: "FileId" }` which prevents direct assignment.
 * This helper makes the intent explicit and centralizes the single cast.
 */
export function toFileId(id: string): any {
    return id;
}

/**
 * Cast a data URL string to Excalidraw's branded `DataURL` type.
 * Excalidraw uses `string & { _brand: "DataURL" }` which prevents direct assignment.
 */
export function toDataURL(url: string): any {
    return url;
}

/**
 * Cast an index string for Excalidraw's fractional indexing system.
 */
export function toFractionalIndex(index: string): any {
    return index;
}

// ─── Image Canvas Options ────────────────────────────────────────────────────

/** Options for placing an image on the Excalidraw canvas */
export interface ImageCanvasOptions {
    /** X position on the canvas (default: 100) */
    x?: number;
    /** Y position on the canvas (default: 100) */
    y?: number;
    /** Width of the image element */
    width: number;
    /** Height of the image element */
    height: number;
    /** Prefix for the generated element IDs */
    idPrefix?: string;
}

// ─── Sketch Settings ─────────────────────────────────────────────────────────

/** ControlNet pipeline type */
export type SketchPipeline = "scribble" | "canny" | "depth" | "pose";

/** ControlNet preprocessor */
export type SketchPreprocessor = "HED" | "PidiNet" | "None";

/** Sketch generation settings state */
export interface SketchSettings {
    pipeline: SketchPipeline;
    resolution: number;
    steps: number;
    guidance: number;
    seed: number;
    preprocessor: SketchPreprocessor;
}

// ─── Image Generation Settings ───────────────────────────────────────────────

/** Image generation settings state */
export interface ImageGenSettings {
    width: number;
    height: number;
    steps: number;
    seed: number;
    randomSeed: boolean;
}

// ─── Dialog Props ────────────────────────────────────────────────────────────

/** Props for the AIToolsDialog component */
export interface AIToolsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
    initialTab?: InitialAITab;
}

// ─── History Types (re-export from data layer) ───────────────────────────────

export type { AIHistoryEntry, AIHistoryType } from "../data/LocalStorage";
