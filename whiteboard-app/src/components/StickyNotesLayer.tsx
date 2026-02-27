/**
 * StickyNotesLayer — Fixed bottom tab-panel for sticky notes.
 *
 * Replaces the floating canvas overlay with a clean bottom bar:
 * - Color-coded tabs for each note
 * - "+" button to add new notes
 * - Expandable editor panel when a tab is selected
 * - Color picker & actions inside the panel header
 */
import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import type { StickyNoteColor } from "../types/sticky-notes";
import {
    STICKY_NOTE_COLORS,
    STICKY_NOTE_COLOR_KEYS,
} from "../types/sticky-notes";
import type { UseStickyNotesReturn } from "../hooks/useStickyNotes";

// ─── Props ───────────────────────────────────────────────────────────────────

interface StickyNotesLayerProps {
    excalidrawAPI: unknown; // kept for API compat but unused now
    stickyNotes: UseStickyNotesReturn;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const StickyNotesLayer: React.FC<StickyNotesLayerProps> = ({
    stickyNotes,
}) => {
    const {
        notes,
        visible,
        addNote,
        updateText,
        updateColor,
        deleteNote,
        duplicateNote,
        updateFontSize,
    } = stickyNotes;

    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [panelHeight, setPanelHeight] = useState(260);
    const [isResizing, setIsResizing] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const resizeStartRef = useRef({ y: 0, height: 0 });

    // ── Active note data ─────────────────────────────────────────────────
    const activeNote = useMemo(
        () => notes.find((n) => n.id === activeNoteId) ?? null,
        [notes, activeNoteId],
    );

    const activeTheme = activeNote ? STICKY_NOTE_COLORS[activeNote.color] : null;

    // ── Auto-select first note if active is deleted ──────────────────────
    useEffect(() => {
        if (activeNoteId && !notes.find((n) => n.id === activeNoteId)) {
            setActiveNoteId(notes.length > 0 ? notes[notes.length - 1].id : null);
        }
    }, [notes, activeNoteId]);

    // ── Focus textarea when switching tabs ───────────────────────────────
    useEffect(() => {
        if (activeNote && textareaRef.current) {
            textareaRef.current.focus();
        }
    }, [activeNoteId]);

    // ── Close color picker on outside click ──────────────────────────────
    useEffect(() => {
        if (!showColorPicker) return;
        const handler = (e: MouseEvent) => {
            if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
                setShowColorPicker(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showColorPicker]);

    // ── Add note handler ─────────────────────────────────────────────────
    const handleAddNote = useCallback(() => {
        // Use a dummy transform — position doesn't matter in tab mode
        const dummyTransform = { scrollX: 0, scrollY: 0, zoom: 1 };
        addNote(dummyTransform, window.innerWidth, window.innerHeight);
    }, [addNote]);

    // ── Auto-select new notes ────────────────────────────────────────────
    const prevCountRef = useRef(notes.length);
    useEffect(() => {
        if (notes.length > prevCountRef.current && notes.length > 0) {
            setActiveNoteId(notes[notes.length - 1].id);
        }
        prevCountRef.current = notes.length;
    }, [notes.length, notes]);

    // ── Tab click ────────────────────────────────────────────────────────
    const handleTabClick = useCallback((id: string) => {
        setActiveNoteId((prev) => (prev === id ? null : id));
        setShowColorPicker(false);
    }, []);

    // ── Delete active note ───────────────────────────────────────────────
    const handleDeleteActive = useCallback(() => {
        if (!activeNoteId) return;
        deleteNote(activeNoteId);
    }, [activeNoteId, deleteNote]);

    // ── Duplicate active note ────────────────────────────────────────────
    const handleDuplicateActive = useCallback(() => {
        if (!activeNoteId) return;
        const dummyTransform = { scrollX: 0, scrollY: 0, zoom: 1 };
        duplicateNote(activeNoteId, dummyTransform);
    }, [activeNoteId, duplicateNote]);

    // ── Resize panel (drag handle) ───────────────────────────────────────
    const handleResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
        resizeStartRef.current = { y: e.clientY, height: panelHeight };
    }, [panelHeight]);

    useEffect(() => {
        if (!isResizing) return;
        const handleMove = (e: MouseEvent) => {
            const dy = resizeStartRef.current.y - e.clientY;
            setPanelHeight(Math.max(160, Math.min(500, resizeStartRef.current.height + dy)));
        };
        const handleUp = () => setIsResizing(false);
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [isResizing]);

    // ── Format timestamp ─────────────────────────────────────────────────
    const formatTime = (ts: number) => {
        const d = new Date(ts);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
    };

    if (!visible) return null;

    const isOpen = activeNote !== null;

    return (
        <div className={`sn-bottom-bar${isOpen ? " sn-bottom-bar--open" : ""}`}>
            {/* ── Expanded Note Panel ──────────────────────────────────── */}
            {isOpen && activeNote && activeTheme && (
                <div
                    className="sn-panel"
                    style={{
                        height: panelHeight,
                        "--sn-bg": activeTheme.background,
                        "--sn-header": activeTheme.header,
                        "--sn-text": activeTheme.text,
                        "--sn-border": activeTheme.border,
                        "--sn-accent": activeTheme.accent,
                    } as React.CSSProperties}
                >
                    {/* Resize drag handle */}
                    <div className="sn-panel-resize" onMouseDown={handleResizeStart}>
                        <div className="sn-panel-resize-grip" />
                    </div>

                    {/* Panel header: color dot, timestamp, actions */}
                    <div className="sn-panel-header">
                        <div className="sn-panel-header-left">
                            <button
                                className="sn-color-dot"
                                style={{ backgroundColor: activeTheme.accent }}
                                onClick={() => setShowColorPicker((v) => !v)}
                                title="Change color"
                            />
                            <span className="sn-panel-timestamp">
                                {formatTime(activeNote.updatedAt)}
                            </span>
                            <span className="sn-panel-charcount">
                                {activeNote.text.length} chars
                            </span>
                        </div>
                        <div className="sn-panel-header-right">
                            {/* Font size */}
                            <div className="sn-font-controls">
                                <button
                                    className="sn-icon-btn"
                                    onClick={() => updateFontSize(activeNote.id, activeNote.fontSize - 1)}
                                    title="Decrease font"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                </button>
                                <span className="sn-font-label">{activeNote.fontSize}</span>
                                <button
                                    className="sn-icon-btn"
                                    onClick={() => updateFontSize(activeNote.id, activeNote.fontSize + 1)}
                                    title="Increase font"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                </button>
                            </div>
                            <div className="sn-panel-divider-v" />
                            <button
                                className="sn-icon-btn"
                                onClick={handleDuplicateActive}
                                title="Duplicate note"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                            </button>
                            <button
                                className="sn-icon-btn sn-icon-btn--danger"
                                onClick={handleDeleteActive}
                                title="Delete note"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                            </button>
                        </div>
                    </div>

                    {/* Color picker popover */}
                    {showColorPicker && (
                        <div ref={colorPickerRef} className="sn-color-picker">
                            {STICKY_NOTE_COLOR_KEYS.map((c) => (
                                <button
                                    key={c}
                                    className={`sn-color-swatch${c === activeNote.color ? " sn-color-swatch--active" : ""}`}
                                    style={{ backgroundColor: STICKY_NOTE_COLORS[c].accent }}
                                    onClick={() => {
                                        updateColor(activeNote.id, c);
                                        setShowColorPicker(false);
                                    }}
                                    title={c}
                                />
                            ))}
                        </div>
                    )}

                    {/* Textarea body */}
                    <div className="sn-panel-body">
                        <textarea
                            ref={textareaRef}
                            className="sn-textarea"
                            value={activeNote.text}
                            onChange={(e) => updateText(activeNote.id, e.target.value)}
                            placeholder="Write your note..."
                            style={{ fontSize: `${activeNote.fontSize}px` }}
                        />
                    </div>
                </div>
            )}

            {/* ── Tab Bar ─────────────────────────────────────────────── */}
            <div className="sn-tabs">
                <div className="sn-tabs-scroll">
                    {notes.map((note) => {
                        const theme = STICKY_NOTE_COLORS[note.color];
                        const isActive = note.id === activeNoteId;
                        return (
                            <button
                                key={note.id}
                                className={`sn-tab${isActive ? " sn-tab--active" : ""}`}
                                style={{
                                    "--tab-accent": theme.accent,
                                    "--tab-bg": theme.background,
                                    "--tab-header": theme.header,
                                } as React.CSSProperties}
                                onClick={() => handleTabClick(note.id)}
                                title={note.text.slice(0, 50) || "Empty note"}
                            >
                                <span className="sn-tab-dot" style={{ backgroundColor: theme.accent }} />
                                <span className="sn-tab-label">
                                    {note.text.slice(0, 20) || "New note"}
                                    {note.text.length > 20 ? "\u2026" : ""}
                                </span>
                                <button
                                    className="sn-tab-close"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteNote(note.id);
                                    }}
                                    title="Close"
                                >
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                </button>
                            </button>
                        );
                    })}
                </div>

                {/* Add note button */}
                <button
                    className="sn-add-btn"
                    onClick={handleAddNote}
                    title="Add sticky note"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>
        </div>
    );
};
