/**
 * useStickyNotes — State management and persistence for canvas sticky notes.
 *
 * Manages an in-memory array of sticky notes backed by IndexedDB.
 * Provides CRUD operations, drag/resize state, z-index management,
 * and auto-save on changes (debounced).
 */
import { useState, useCallback, useEffect, useRef } from "react";
import type {
    StickyNote,
    StickyNoteColor,
    CanvasTransform,
} from "../types/sticky-notes";
import {
    STICKY_NOTE_DEFAULTS,
    STICKY_NOTE_MIN,
    screenToCanvas,
} from "../types/sticky-notes";
import {
    loadStickyNotes,
    saveStickyNote,
    deleteStickyNote as dbDeleteNote,
    saveAllStickyNotes,
} from "../data/LocalStorage";

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseStickyNotesReturn {
    notes: StickyNote[];
    /** Whether notes layer is visible */
    visible: boolean;
    setVisible: (v: boolean) => void;
    /** Add a new note at the center of the viewport */
    addNote: (transform: CanvasTransform, viewportWidth: number, viewportHeight: number) => void;
    /** Update a note's text */
    updateText: (id: string, text: string) => void;
    /** Update a note's color */
    updateColor: (id: string, color: StickyNoteColor) => void;
    /** Toggle minimized state */
    toggleMinimized: (id: string) => void;
    /** Move a note by canvas delta */
    moveNote: (id: string, canvasX: number, canvasY: number) => void;
    /** Resize a note */
    resizeNote: (id: string, width: number, height: number) => void;
    /** Bring note to front */
    bringToFront: (id: string) => void;
    /** Delete a note */
    deleteNote: (id: string) => void;
    /** Delete ALL notes */
    clearAll: () => void;
    /** Duplicate a note */
    duplicateNote: (id: string, transform: CanvasTransform) => void;
    /** Update font size */
    updateFontSize: (id: string, fontSize: number) => void;
    /** Update custom background hex color */
    updateCustomBg: (id: string, customBg: string | undefined) => void;
    /** Whether notes have loaded from DB */
    loaded: boolean;
}

function generateId(): string {
    return `sn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function useStickyNotes(): UseStickyNotesReturn {
    const [notes, setNotes] = useState<StickyNote[]>([]);
    const [visible, setVisible] = useState(true);
    const [loaded, setLoaded] = useState(false);

    // Debounced save
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSaveRef = useRef<StickyNote | null>(null);

    // ── Load from DB on mount ────────────────────────────────────────────
    useEffect(() => {
        loadStickyNotes().then((saved) => {
            if (saved.length > 0) {
                setNotes(saved);
                if (import.meta.env.DEV) console.log(`[StickyNotes] Loaded ${saved.length} notes`);
            }
            setLoaded(true);
        });
    }, []);

    // ── Persist helper (debounced per-note) ──────────────────────────────
    const persistNote = useCallback((note: StickyNote) => {
        // Save immediately — individual note saves are fast
        saveStickyNote(note);
    }, []);

    // ── Next z-index ─────────────────────────────────────────────────────
    const nextZIndex = useCallback(() => {
        return notes.length > 0
            ? Math.max(...notes.map((n) => n.zIndex)) + 1
            : 1;
    }, [notes]);

    // ── Add Note ─────────────────────────────────────────────────────────
    const addNote = useCallback(
        (transform: CanvasTransform, viewportWidth: number, viewportHeight: number) => {
            // Place at center of current viewport in canvas coords
            const center = screenToCanvas(
                viewportWidth / 2,
                viewportHeight / 2,
                transform,
            );

            // Slight random offset so stacked notes don't overlap perfectly
            const offsetX = (Math.random() - 0.5) * 60;
            const offsetY = (Math.random() - 0.5) * 60;

            const newNote: StickyNote = {
                id: generateId(),
                text: "",
                color: STICKY_NOTE_DEFAULTS.color,
                canvasX: center.x - STICKY_NOTE_DEFAULTS.width / 2 + offsetX,
                canvasY: center.y - STICKY_NOTE_DEFAULTS.height / 2 + offsetY,
                width: STICKY_NOTE_DEFAULTS.width,
                height: STICKY_NOTE_DEFAULTS.height,
                zIndex: (notes.length > 0 ? Math.max(...notes.map((n) => n.zIndex)) + 1 : 1),
                minimized: false,
                fontSize: STICKY_NOTE_DEFAULTS.fontSize,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            setNotes((prev) => [...prev, newNote]);
            persistNote(newNote);
        },
        [notes, persistNote],
    );

    // ── Update Text ──────────────────────────────────────────────────────
    const updateText = useCallback(
        (id: string, text: string) => {
            setNotes((prev) =>
                prev.map((n) => {
                    if (n.id !== id) return n;
                    const updated = { ...n, text, updatedAt: Date.now() };
                    persistNote(updated);
                    return updated;
                }),
            );
        },
        [persistNote],
    );

    // ── Update Color ─────────────────────────────────────────────────────
    const updateColor = useCallback(
        (id: string, color: StickyNoteColor) => {
            setNotes((prev) =>
                prev.map((n) => {
                    if (n.id !== id) return n;
                    const updated = { ...n, color, updatedAt: Date.now() };
                    persistNote(updated);
                    return updated;
                }),
            );
        },
        [persistNote],
    );

    // ── Toggle Minimized ─────────────────────────────────────────────────
    const toggleMinimized = useCallback(
        (id: string) => {
            setNotes((prev) =>
                prev.map((n) => {
                    if (n.id !== id) return n;
                    const updated = { ...n, minimized: !n.minimized, updatedAt: Date.now() };
                    persistNote(updated);
                    return updated;
                }),
            );
        },
        [persistNote],
    );

    // ── Move Note ────────────────────────────────────────────────────────
    const moveNote = useCallback(
        (id: string, canvasX: number, canvasY: number) => {
            setNotes((prev) =>
                prev.map((n) => {
                    if (n.id !== id) return n;
                    const updated = { ...n, canvasX, canvasY, updatedAt: Date.now() };
                    persistNote(updated);
                    return updated;
                }),
            );
        },
        [persistNote],
    );

    // ── Resize Note ──────────────────────────────────────────────────────
    const resizeNote = useCallback(
        (id: string, width: number, height: number) => {
            const w = Math.max(STICKY_NOTE_MIN.width, width);
            const h = Math.max(STICKY_NOTE_MIN.height, height);
            setNotes((prev) =>
                prev.map((n) => {
                    if (n.id !== id) return n;
                    const updated = { ...n, width: w, height: h, updatedAt: Date.now() };
                    persistNote(updated);
                    return updated;
                }),
            );
        },
        [persistNote],
    );

    // ── Bring to Front ───────────────────────────────────────────────────
    const bringToFront = useCallback(
        (id: string) => {
            setNotes((prev) => {
                const maxZ = Math.max(...prev.map((n) => n.zIndex));
                return prev.map((n) => {
                    if (n.id !== id) return n;
                    const updated = { ...n, zIndex: maxZ + 1 };
                    persistNote(updated);
                    return updated;
                });
            });
        },
        [persistNote],
    );

    // ── Delete Note ──────────────────────────────────────────────────────
    const deleteNote = useCallback(
        (id: string) => {
            setNotes((prev) => prev.filter((n) => n.id !== id));
            dbDeleteNote(id);
        },
        [],
    );

    // ── Clear All ────────────────────────────────────────────────────────
    const clearAll = useCallback(() => {
        const ids = notes.map((n) => n.id);
        setNotes([]);
        ids.forEach((id) => dbDeleteNote(id));
    }, [notes]);

    // ── Duplicate Note ───────────────────────────────────────────────────
    const duplicateNote = useCallback(
        (id: string, transform: CanvasTransform) => {
            const source = notes.find((n) => n.id === id);
            if (!source) return;

            const newNote: StickyNote = {
                ...source,
                id: generateId(),
                canvasX: source.canvasX + 30,
                canvasY: source.canvasY + 30,
                zIndex: (notes.length > 0 ? Math.max(...notes.map((n) => n.zIndex)) + 1 : 1),
                createdAt: Date.now(),
                updatedAt: Date.now(),
            };

            setNotes((prev) => [...prev, newNote]);
            persistNote(newNote);
        },
        [notes, persistNote],
    );

    // ── Update Font Size ─────────────────────────────────────────────────
    const updateFontSize = useCallback(
        (id: string, fontSize: number) => {
            const clamped = Math.max(10, Math.min(24, fontSize));
            setNotes((prev) =>
                prev.map((n) => {
                    if (n.id !== id) return n;
                    const updated = { ...n, fontSize: clamped, updatedAt: Date.now() };
                    persistNote(updated);
                    return updated;
                }),
            );
        },
        [persistNote],
    );

    // ── Update Custom Background ──────────────────────────────────────
    const updateCustomBg = useCallback(
        (id: string, customBg: string | undefined) => {
            setNotes((prev) =>
                prev.map((n) => {
                    if (n.id !== id) return n;
                    const updated = { ...n, customBg, updatedAt: Date.now() };
                    persistNote(updated);
                    return updated;
                }),
            );
        },
        [persistNote],
    );

    return {
        notes,
        visible,
        setVisible,
        addNote,
        updateText,
        updateColor,
        toggleMinimized,
        moveNote,
        resizeNote,
        bringToFront,
        deleteNote,
        clearAll,
        duplicateNote,
        updateFontSize,
        updateCustomBg,
        loaded,
    };
}
