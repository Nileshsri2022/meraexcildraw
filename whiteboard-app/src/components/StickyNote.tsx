/**
 * StickyNote — Individual sticky note component.
 *
 * Features:
 * - Draggable header bar (grab to move)
 * - Inline editable textarea
 * - Color picker popover
 * - Minimize / expand toggle
 * - Resize handle (bottom-right corner)
 * - Context menu (duplicate, font size, delete)
 * - Z-index management (click to bring to front)
 *
 * All coordinates are in canvas space — the parent layer handles
 * the canvas→screen transformation via CSS transform.
 */
import React, { useState, useRef, useCallback, useEffect } from "react";
import type {
    StickyNote as StickyNoteData,
    StickyNoteColor,
    CanvasTransform,
} from "../types/sticky-notes";
import {
    STICKY_NOTE_COLORS,
    STICKY_NOTE_COLOR_KEYS,
    STICKY_NOTE_MIN,
    canvasToScreen,
    screenToCanvasDelta,
} from "../types/sticky-notes";

// ─── Props ───────────────────────────────────────────────────────────────────

interface StickyNoteProps {
    note: StickyNoteData;
    transform: CanvasTransform;
    onUpdateText: (id: string, text: string) => void;
    onUpdateColor: (id: string, color: StickyNoteColor) => void;
    onToggleMinimized: (id: string) => void;
    onMove: (id: string, canvasX: number, canvasY: number) => void;
    onResize: (id: string, width: number, height: number) => void;
    onBringToFront: (id: string) => void;
    onDelete: (id: string) => void;
    onDuplicate: (id: string) => void;
    onUpdateFontSize: (id: string, fontSize: number) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export const StickyNoteComponent: React.FC<StickyNoteProps> = React.memo(({
    note,
    transform,
    onUpdateText,
    onUpdateColor,
    onToggleMinimized,
    onMove,
    onResize,
    onBringToFront,
    onDelete,
    onDuplicate,
    onUpdateFontSize,
}) => {
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const dragStartRef = useRef({ screenX: 0, screenY: 0, canvasX: 0, canvasY: 0 });
    const resizeStartRef = useRef({ screenX: 0, screenY: 0, width: 0, height: 0 });
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const noteRef = useRef<HTMLDivElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    const theme = STICKY_NOTE_COLORS[note.color];

    // ── Screen position from canvas coords ───────────────────────────────
    const screenPos = canvasToScreen(note.canvasX, note.canvasY, transform);
    const scaledWidth = note.width * transform.zoom;
    const scaledHeight = note.height * transform.zoom;

    // ── Close popups on outside click ────────────────────────────────────
    useEffect(() => {
        if (!showColorPicker && !showContextMenu) return;
        const handler = (e: MouseEvent) => {
            if (
                colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node) &&
                contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)
            ) {
                setShowColorPicker(false);
                setShowContextMenu(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [showColorPicker, showContextMenu]);

    // ── Drag handlers ────────────────────────────────────────────────────
    const handleDragStart = useCallback(
        (e: React.MouseEvent) => {
            if ((e.target as HTMLElement).closest(".sticky-note-btn")) return;
            e.preventDefault();
            e.stopPropagation();
            onBringToFront(note.id);
            setIsDragging(true);
            dragStartRef.current = {
                screenX: e.clientX,
                screenY: e.clientY,
                canvasX: note.canvasX,
                canvasY: note.canvasY,
            };
        },
        [note.id, note.canvasX, note.canvasY, onBringToFront],
    );

    useEffect(() => {
        if (!isDragging) return;
        const handleMove = (e: MouseEvent) => {
            const dx = e.clientX - dragStartRef.current.screenX;
            const dy = e.clientY - dragStartRef.current.screenY;
            const canvasDelta = screenToCanvasDelta(dx, dy, transform.zoom);
            onMove(
                note.id,
                dragStartRef.current.canvasX + canvasDelta.dx,
                dragStartRef.current.canvasY + canvasDelta.dy,
            );
        };
        const handleUp = () => setIsDragging(false);
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [isDragging, note.id, transform.zoom, onMove]);

    // ── Resize handlers ──────────────────────────────────────────────────
    const handleResizeStart = useCallback(
        (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            onBringToFront(note.id);
            setIsResizing(true);
            resizeStartRef.current = {
                screenX: e.clientX,
                screenY: e.clientY,
                width: note.width,
                height: note.height,
            };
        },
        [note.id, note.width, note.height, onBringToFront],
    );

    useEffect(() => {
        if (!isResizing) return;
        const handleMove = (e: MouseEvent) => {
            const dx = e.clientX - resizeStartRef.current.screenX;
            const dy = e.clientY - resizeStartRef.current.screenY;
            const canvasDelta = screenToCanvasDelta(dx, dy, transform.zoom);
            onResize(
                note.id,
                Math.max(STICKY_NOTE_MIN.width, resizeStartRef.current.width + canvasDelta.dx),
                Math.max(STICKY_NOTE_MIN.height, resizeStartRef.current.height + canvasDelta.dy),
            );
        };
        const handleUp = () => setIsResizing(false);
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleUp);
        return () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleUp);
        };
    }, [isResizing, note.id, transform.zoom, onResize]);

    // ── Focus textarea when note is first opened (empty text) ────────────
    useEffect(() => {
        if (note.text === "" && textareaRef.current && !note.minimized) {
            textareaRef.current.focus();
        }
    }, []);

    // ── Handle note click (bring to front) ───────────────────────────────
    const handleNoteClick = useCallback(
        (e: React.MouseEvent) => {
            // Don't bring to front if clicking buttons
            if (!(e.target as HTMLElement).closest(".sticky-note-btn")) {
                onBringToFront(note.id);
            }
        },
        [note.id, onBringToFront],
    );

    // ── Format timestamp ─────────────────────────────────────────────────
    const formatTime = (ts: number) => {
        const d = new Date(ts);
        const now = new Date();
        if (d.toDateString() === now.toDateString()) {
            return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
        return d.toLocaleDateString([], { month: "short", day: "numeric" });
    };

    // ── Visibility check — skip rendering if fully off-screen ────────────
    const isOffScreen =
        screenPos.x + scaledWidth < -50 ||
        screenPos.y + scaledHeight < -50 ||
        screenPos.x > window.innerWidth + 50 ||
        screenPos.y > window.innerHeight + 50;

    if (isOffScreen) return null;

    return (
        <div
            ref={noteRef}
            className={`sticky-note${isDragging ? " sticky-note--dragging" : ""}${isResizing ? " sticky-note--resizing" : ""}${note.minimized ? " sticky-note--minimized" : ""}`}
            style={{
                position: "absolute",
                left: screenPos.x,
                top: screenPos.y,
                width: scaledWidth,
                height: note.minimized ? "auto" : scaledHeight,
                zIndex: note.zIndex + 100, // offset above Excalidraw elements
                "--sn-bg": theme.background,
                "--sn-header": theme.header,
                "--sn-text": theme.text,
                "--sn-border": theme.border,
                "--sn-shadow": theme.shadow,
                "--sn-accent": theme.accent,
                "--sn-scale": transform.zoom,
            } as React.CSSProperties}
            onMouseDown={handleNoteClick}
        >
            {/* ── Header Bar ────────────────────────────────────────── */}
            <div
                className="sticky-note-header"
                onMouseDown={handleDragStart}
            >
                {/* Color dot + timestamp */}
                <div className="sticky-note-header-left">
                    <button
                        className="sticky-note-btn sticky-note-color-dot"
                        style={{ backgroundColor: theme.accent }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowColorPicker((v) => !v);
                            setShowContextMenu(false);
                        }}
                        title="Change color"
                    />
                    <span className="sticky-note-timestamp">
                        {formatTime(note.updatedAt)}
                    </span>
                </div>

                {/* Action buttons */}
                <div className="sticky-note-header-right">
                    <button
                        className="sticky-note-btn sticky-note-icon-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowContextMenu((v) => !v);
                            setShowColorPicker(false);
                        }}
                        title="More options"
                    >
                        ⋯
                    </button>
                    <button
                        className="sticky-note-btn sticky-note-icon-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleMinimized(note.id);
                        }}
                        title={note.minimized ? "Expand" : "Minimize"}
                    >
                        {note.minimized ? "▢" : "─"}
                    </button>
                    <button
                        className="sticky-note-btn sticky-note-icon-btn sticky-note-close-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(note.id);
                        }}
                        title="Delete note"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* ── Color Picker Popover ──────────────────────────────── */}
            {showColorPicker && (
                <div ref={colorPickerRef} className="sticky-note-color-picker">
                    {STICKY_NOTE_COLOR_KEYS.map((c) => (
                        <button
                            key={c}
                            className={`sticky-note-color-swatch${c === note.color ? " sticky-note-color-swatch--active" : ""}`}
                            style={{ backgroundColor: STICKY_NOTE_COLORS[c].header }}
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdateColor(note.id, c);
                                setShowColorPicker(false);
                            }}
                            title={c}
                        />
                    ))}
                </div>
            )}

            {/* ── Context Menu ──────────────────────────────────────── */}
            {showContextMenu && (
                <div ref={contextMenuRef} className="sticky-note-context-menu">
                    <button
                        className="sticky-note-context-item"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(note.id);
                            setShowContextMenu(false);
                        }}
                    >
                        <span>📋</span> Duplicate
                    </button>
                    <div className="sticky-note-context-divider" />
                    <div className="sticky-note-context-label">Font Size</div>
                    <div className="sticky-note-font-controls">
                        <button
                            className="sticky-note-btn sticky-note-font-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdateFontSize(note.id, note.fontSize - 1);
                            }}
                        >
                            A−
                        </button>
                        <span className="sticky-note-font-size">{note.fontSize}px</span>
                        <button
                            className="sticky-note-btn sticky-note-font-btn"
                            onClick={(e) => {
                                e.stopPropagation();
                                onUpdateFontSize(note.id, note.fontSize + 1);
                            }}
                        >
                            A+
                        </button>
                    </div>
                    <div className="sticky-note-context-divider" />
                    <button
                        className="sticky-note-context-item sticky-note-context-item--danger"
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(note.id);
                            setShowContextMenu(false);
                        }}
                    >
                        <span>🗑️</span> Delete
                    </button>
                </div>
            )}

            {/* ── Body (hidden when minimized) ──────────────────────── */}
            {!note.minimized && (
                <div className="sticky-note-body">
                    <textarea
                        ref={textareaRef}
                        className="sticky-note-textarea"
                        value={note.text}
                        onChange={(e) => onUpdateText(note.id, e.target.value)}
                        onFocus={() => setIsEditing(true)}
                        onBlur={() => setIsEditing(false)}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="Type your note..."
                        style={{
                            fontSize: `${note.fontSize * transform.zoom}px`,
                            lineHeight: 1.5,
                        }}
                    />
                </div>
            )}

            {/* ── Resize Handle (hidden when minimized) ─────────────── */}
            {!note.minimized && (
                <div
                    className="sticky-note-resize-handle"
                    onMouseDown={handleResizeStart}
                />
            )}
        </div>
    );
});

StickyNoteComponent.displayName = "StickyNote";
