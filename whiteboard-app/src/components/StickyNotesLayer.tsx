/**
 * StickyNotesLayer — Overlay container for all sticky notes.
 *
 * This component sits on top of the Excalidraw canvas and renders
 * sticky notes as positioned HTML elements that track the canvas
 * pan/zoom via Excalidraw's appState (scrollX, scrollY, zoom).
 *
 * Also provides the floating "Add Note" FAB and a notes counter badge.
 */
import React, { useCallback, useMemo } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { CanvasTransform } from "../types/sticky-notes";
import { StickyNoteComponent } from "./StickyNote";
import type { UseStickyNotesReturn } from "../hooks/useStickyNotes";

// ─── Props ───────────────────────────────────────────────────────────────────

interface StickyNotesLayerProps {
    excalidrawAPI: ExcalidrawImperativeAPI | null;
    stickyNotes: UseStickyNotesReturn;
    /** Current canvas transform — passed from App's onChange handler */
    canvasTransform: CanvasTransform;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const StickyNotesLayer: React.FC<StickyNotesLayerProps> = ({
    excalidrawAPI,
    stickyNotes,
    canvasTransform,
}) => {
    const {
        notes,
        visible,
        addNote,
        updateText,
        updateColor,
        toggleMinimized,
        moveNote,
        resizeNote,
        bringToFront,
        deleteNote,
        duplicateNote,
        updateFontSize,
    } = stickyNotes;

    // ── Add note at viewport center ──────────────────────────────────────
    const handleAddNote = useCallback(() => {
        const vpWidth = window.innerWidth;
        const vpHeight = window.innerHeight;
        addNote(canvasTransform, vpWidth, vpHeight);
    }, [addNote, canvasTransform]);

    // ── Duplicate handler wrapping transform ─────────────────────────────
    const handleDuplicate = useCallback(
        (id: string) => duplicateNote(id, canvasTransform),
        [duplicateNote, canvasTransform],
    );

    // ── Sorted notes for proper z-order rendering ────────────────────────
    const sortedNotes = useMemo(
        () => [...notes].sort((a, b) => a.zIndex - b.zIndex),
        [notes],
    );

    if (!visible) return null;

    return (
        <>
            {/* ── Notes overlay: pointer-events pass through except on notes ── */}
            <div className="sticky-notes-layer" style={{ pointerEvents: "none" }}>
                {sortedNotes.map((note) => (
                    <div key={note.id} style={{ pointerEvents: "auto" }}>
                        <StickyNoteComponent
                            note={note}
                            transform={canvasTransform}
                            onUpdateText={updateText}
                            onUpdateColor={updateColor}
                            onToggleMinimized={toggleMinimized}
                            onMove={moveNote}
                            onResize={resizeNote}
                            onBringToFront={bringToFront}
                            onDelete={deleteNote}
                            onDuplicate={handleDuplicate}
                            onUpdateFontSize={updateFontSize}
                        />
                    </div>
                ))}
            </div>

            {/* ── Floating Add-Note FAB ─────────────────────────────────── */}
            <button
                className="sticky-notes-fab"
                onClick={handleAddNote}
                title="Add sticky note"
            >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                {notes.length > 0 && (
                    <span className="sticky-notes-fab-badge">{notes.length}</span>
                )}
            </button>
        </>
    );
};
