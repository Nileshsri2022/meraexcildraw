/**
 * Types for the AI Presentation Mode feature.
 *
 * Frames define slide boundaries on the canvas.
 * The AI can auto-generate frames via spatial clustering + semantic analysis,
 * and generate speaker notes for each slide.
 */

// ─── Frame / Slide Types ─────────────────────────────────────────────────────

/** A rectangular region on the canvas that defines one slide */
export interface PresentationFrame {
    id: string;
    /** Display label shown on the frame border */
    label: string;
    /** Canvas coordinates */
    x: number;
    y: number;
    width: number;
    height: number;
    /** Sort order in the presentation (0-based) */
    order: number;
    /** AI-generated speaker notes (markdown) */
    speakerNotes?: string;
    /** Border color for visual distinction */
    color: string;
}

/** A slide derived from a frame, enriched with render data */
export interface PresentationSlide {
    frame: PresentationFrame;
    /** IDs of Excalidraw elements contained within this frame */
    elementIds: string[];
    /** Thumbnail data URL (optional, for export) */
    thumbnail?: string;
}

/** Full presentation state */
export interface Presentation {
    title: string;
    slides: PresentationSlide[];
    createdAt: number;
}

// ─── Auto-Frame Request/Response ─────────────────────────────────────────────

/** Element summary sent to AI for auto-framing */
export interface ElementSummary {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    text?: string;
    strokeColor?: string;
    backgroundColor?: string;
}

/** Auto-frame response from the AI backend */
export interface AutoFrameResponse {
    frames: Array<{
        label: string;
        x: number;
        y: number;
        width: number;
        height: number;
        elementIds: string[];
        speakerNotes?: string;
    }>;
}

/** Speaker notes generation request */
export interface SpeakerNotesRequest {
    frames: Array<{
        label: string;
        elements: ElementSummary[];
    }>;
}

/** Speaker notes response */
export interface SpeakerNotesResponse {
    notes: Array<{
        frameLabel: string;
        speakerNotes: string;
    }>;
}

// ─── Presentation Mode State ─────────────────────────────────────────────────

export type PresentationViewMode = "edit" | "presenting";

export interface PresentationState {
    frames: PresentationFrame[];
    currentSlideIndex: number;
    viewMode: PresentationViewMode;
    isAutoFraming: boolean;
    isGeneratingNotes: boolean;
}

// ─── Frame Colors ────────────────────────────────────────────────────────────

export const FRAME_COLORS = [
    "#6366f1", // Indigo
    "#8b5cf6", // Violet
    "#ec4899", // Pink
    "#f59e0b", // Amber
    "#10b981", // Emerald
    "#3b82f6", // Blue
    "#ef4444", // Red
    "#14b8a6", // Teal
] as const;

/** Get a frame color by index (cycles through palette) */
export function getFrameColor(index: number): string {
    return FRAME_COLORS[index % FRAME_COLORS.length];
}
