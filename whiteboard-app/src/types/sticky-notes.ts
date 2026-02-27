/**
 * Type definitions for the Canvas Sticky Notes system.
 *
 * Sticky notes are HTML overlays positioned in Excalidraw canvas coordinates.
 * They track scroll/zoom to stay anchored to the canvas while providing
 * rich editing, color theming, and drag/resize interactions.
 */

// ─── Color Presets ───────────────────────────────────────────────────────────

/** Available sticky note color identifiers */
export type StickyNoteColor =
    | "yellow"
    | "blue"
    | "green"
    | "pink"
    | "purple"
    | "orange"
    | "teal"
    | "gray";

/** Color theme for a sticky note (background, header, text, shadow) */
export interface StickyNoteColorTheme {
    background: string;
    header: string;
    text: string;
    border: string;
    shadow: string;
    /** Muted accent for icons/controls */
    accent: string;
}

/** Map of color presets → themes — soft muted palettes with warm paper feel */
export const STICKY_NOTE_COLORS: Record<StickyNoteColor, StickyNoteColorTheme> = {
    yellow: {
        background: "#fef9ef",
        header: "#fceabb",
        text: "#4a3728",
        border: "rgba(218, 185, 107, 0.45)",
        shadow: "rgba(218, 185, 107, 0.20)",
        accent: "#d4a017",
    },
    blue: {
        background: "#eef4fc",
        header: "#c0d8f7",
        text: "#1e3a5f",
        border: "rgba(120, 165, 220, 0.40)",
        shadow: "rgba(120, 165, 220, 0.18)",
        accent: "#3a7bd5",
    },
    green: {
        background: "#eef6ee",
        header: "#b8ddb8",
        text: "#1e3f1e",
        border: "rgba(120, 190, 120, 0.40)",
        shadow: "rgba(120, 190, 120, 0.18)",
        accent: "#3d9140",
    },
    pink: {
        background: "#fdf0f4",
        header: "#f5c6d6",
        text: "#5c1a34",
        border: "rgba(220, 140, 170, 0.40)",
        shadow: "rgba(220, 140, 170, 0.18)",
        accent: "#d4568a",
    },
    purple: {
        background: "#f3f0fa",
        header: "#d0c2f0",
        text: "#2e1a5e",
        border: "rgba(150, 120, 210, 0.40)",
        shadow: "rgba(150, 120, 210, 0.18)",
        accent: "#7c5cbf",
    },
    orange: {
        background: "#fef4ea",
        header: "#fad5a5",
        text: "#5c3311",
        border: "rgba(220, 160, 80, 0.40)",
        shadow: "rgba(220, 160, 80, 0.18)",
        accent: "#d97a1e",
    },
    teal: {
        background: "#edf7f5",
        header: "#a8d8cf",
        text: "#0e3d34",
        border: "rgba(100, 185, 165, 0.40)",
        shadow: "rgba(100, 185, 165, 0.18)",
        accent: "#2a9d8f",
    },
    gray: {
        background: "#f4f4f5",
        header: "#d4d4d8",
        text: "#27272a",
        border: "rgba(160, 160, 170, 0.40)",
        shadow: "rgba(160, 160, 170, 0.18)",
        accent: "#52525b",
    },
};

/** All available color keys */
export const STICKY_NOTE_COLOR_KEYS = Object.keys(STICKY_NOTE_COLORS) as StickyNoteColor[];

// ─── Data Model ──────────────────────────────────────────────────────────────

/** Persistent sticky note data stored in IndexedDB */
export interface StickyNote {
    /** Unique identifier */
    id: string;
    /** Note text content (plain text) */
    text: string;
    /** Color theme key */
    color: StickyNoteColor;
    /** X position in canvas coordinates */
    canvasX: number;
    /** Y position in canvas coordinates */
    canvasY: number;
    /** Width in canvas units */
    width: number;
    /** Height in canvas units */
    height: number;
    /** Stack order — higher = on top */
    zIndex: number;
    /** Whether note is collapsed to title bar only */
    minimized: boolean;
    /** Font size in px */
    fontSize: number;
    /** Optional custom background hex color (overrides theme background) */
    customBg?: string;
    /** Creation timestamp */
    createdAt: number;
    /** Last modification timestamp */
    updatedAt: number;
}

/** Default dimensions for a new sticky note */
export const STICKY_NOTE_DEFAULTS = {
    width: 220,
    height: 180,
    fontSize: 14,
    color: "yellow" as StickyNoteColor,
    minimized: false,
} as const;

/** Minimum dimensions during resize */
export const STICKY_NOTE_MIN = {
    width: 140,
    height: 80,
} as const;

// ─── Canvas Transform ────────────────────────────────────────────────────────

/** Subset of Excalidraw's appState needed for coordinate transform */
export interface CanvasTransform {
    scrollX: number;
    scrollY: number;
    zoom: number;
}

/**
 * Convert canvas coordinates to screen pixel position.
 * `screenX = (canvasX + scrollX) * zoom`
 */
export function canvasToScreen(
    canvasX: number,
    canvasY: number,
    transform: CanvasTransform,
): { x: number; y: number } {
    return {
        x: (canvasX + transform.scrollX) * transform.zoom,
        y: (canvasY + transform.scrollY) * transform.zoom,
    };
}

/**
 * Convert a screen pixel delta back to canvas coordinate delta.
 * `canvasDelta = screenDelta / zoom`
 */
export function screenToCanvasDelta(
    dx: number,
    dy: number,
    zoom: number,
): { dx: number; dy: number } {
    return { dx: dx / zoom, dy: dy / zoom };
}

/**
 * Convert screen pixel position to canvas coordinates.
 * `canvasX = screenX / zoom - scrollX`
 */
export function screenToCanvas(
    screenX: number,
    screenY: number,
    transform: CanvasTransform,
): { x: number; y: number } {
    return {
        x: screenX / transform.zoom - transform.scrollX,
        y: screenY / transform.zoom - transform.scrollY,
    };
}
