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

/** Map of color presets → themes */
export const STICKY_NOTE_COLORS: Record<StickyNoteColor, StickyNoteColorTheme> = {
    yellow: {
        background: "#fff9c4",
        header: "#fff176",
        text: "#5d4037",
        border: "#f9a825",
        shadow: "rgba(249, 168, 37, 0.25)",
        accent: "#f57f17",
    },
    blue: {
        background: "#bbdefb",
        header: "#90caf9",
        text: "#1a237e",
        border: "#42a5f5",
        shadow: "rgba(66, 165, 245, 0.25)",
        accent: "#1565c0",
    },
    green: {
        background: "#c8e6c9",
        header: "#a5d6a7",
        text: "#1b5e20",
        border: "#66bb6a",
        shadow: "rgba(102, 187, 106, 0.25)",
        accent: "#2e7d32",
    },
    pink: {
        background: "#f8bbd0",
        header: "#f48fb1",
        text: "#880e4f",
        border: "#ec407a",
        shadow: "rgba(236, 64, 122, 0.25)",
        accent: "#c2185b",
    },
    purple: {
        background: "#d1c4e9",
        header: "#b39ddb",
        text: "#311b92",
        border: "#7e57c2",
        shadow: "rgba(126, 87, 194, 0.25)",
        accent: "#4527a0",
    },
    orange: {
        background: "#ffe0b2",
        header: "#ffcc80",
        text: "#e65100",
        border: "#ffa726",
        shadow: "rgba(255, 167, 38, 0.25)",
        accent: "#ef6c00",
    },
    teal: {
        background: "#b2dfdb",
        header: "#80cbc4",
        text: "#004d40",
        border: "#26a69a",
        shadow: "rgba(38, 166, 154, 0.25)",
        accent: "#00695c",
    },
    gray: {
        background: "#e0e0e0",
        header: "#bdbdbd",
        text: "#212121",
        border: "#9e9e9e",
        shadow: "rgba(158, 158, 158, 0.25)",
        accent: "#424242",
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
