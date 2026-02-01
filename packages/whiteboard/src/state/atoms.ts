// State management atoms using Jotai
import { atom } from "jotai";
import type { WhiteboardElement } from "@whiteboard/element";
import { DEFAULT_APP_STATE, type Theme, type Tool } from "@whiteboard/common";

// App State type
export interface AppState {
    zoom: number;
    scrollX: number;
    scrollY: number;
    viewBackgroundColor: string;
    theme: Theme;
    selectedTool: Tool;
    currentItemStrokeColor: string;
    currentItemBackgroundColor: string;
    currentItemFillStyle: "solid" | "hachure" | "cross-hatch" | "none";
    currentItemStrokeWidth: number;
    currentItemStrokeStyle: "solid" | "dashed" | "dotted";
    currentItemRoughness: number;
    currentItemOpacity: number;
    currentItemFontFamily: number;
    currentItemFontSize: number;
    currentItemTextAlign: "left" | "center" | "right";
    currentItemRoundness: number; // 0 = sharp corners, higher = more rounded
    gridSize: number | null;
    showGrid: boolean;
    isDrawing: boolean;
    isDragging: boolean;
    isResizing: boolean;
    isPanning: boolean;
    cursorX: number;
    cursorY: number;
}

// History state for undo/redo
export interface HistoryState {
    past: WhiteboardElement[][];
    present: WhiteboardElement[];
    future: WhiteboardElement[][];
}

// Collaboration state
export interface CollabState {
    isCollaborating: boolean;
    roomId: string | null;
    username: string;
    collaborators: Map<string, { pointer: { x: number; y: number }; username: string }>;
}

// Element atoms
export const elementsAtom = atom<WhiteboardElement[]>([]);
export const selectedElementIdsAtom = atom<Set<string>>(new Set<string>());

// App state atom
export const appStateAtom = atom<AppState>({
    ...DEFAULT_APP_STATE,
    isDrawing: false,
    isDragging: false,
    isResizing: false,
    isPanning: false,
    cursorX: 0,
    cursorY: 0,
});

// History atom
export const historyAtom = atom<HistoryState>({
    past: [],
    present: [],
    future: [],
});

// Collaboration atom
export const collabAtom = atom<CollabState>({
    isCollaborating: false,
    roomId: null,
    username: "Anonymous",
    collaborators: new Map(),
});

// Derived atoms
export const nonDeletedElementsAtom = atom((get) => {
    const elements = get(elementsAtom);
    return elements.filter((el) => !el.isDeleted);
});

export const selectedElementsAtom = atom((get) => {
    const elements = get(elementsAtom);
    const selectedIds = get(selectedElementIdsAtom);
    return elements.filter((el) => selectedIds.has(el.id));
});

export const zoomAtom = atom(
    (get) => get(appStateAtom).zoom,
    (get, set, newZoom: number) => {
        const appState = get(appStateAtom);
        set(appStateAtom, { ...appState, zoom: Math.min(Math.max(newZoom, 0.1), 10) });
    }
);

export const themeAtom = atom(
    (get) => get(appStateAtom).theme,
    (get, set, newTheme: Theme) => {
        const appState = get(appStateAtom);
        set(appStateAtom, { ...appState, theme: newTheme });
    }
);

export const selectedToolAtom = atom(
    (get) => get(appStateAtom).selectedTool,
    (get, set, newTool: Tool) => {
        const appState = get(appStateAtom);
        set(appStateAtom, { ...appState, selectedTool: newTool });
    }
);
