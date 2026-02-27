/**
 * StickyNotesLayer — Floating widget for sticky notes (bottom-right).
 *
 * A compact help-support-style popup:
 * - Small circular button in the bottom-right corner
 * - Opens a floating popup window with note tabs
 * - "+" button in the popup header to add more notes
 * - Hex color input to change sticky note background
 * - Color preset swatches + custom hex input
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
    excalidrawAPI: unknown;
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
        updateFontSize,
        updateCustomBg,
    } = stickyNotes;

    const [isWidgetOpen, setIsWidgetOpen] = useState(false);
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [hexInput, setHexInput] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const colorPickerRef = useRef<HTMLDivElement>(null);
    const widgetRef = useRef<HTMLDivElement>(null);

    // ── Active note data ─────────────────────────────────────────────────
    const activeNote = useMemo(
        () => notes.find((n) => n.id === activeNoteId) ?? null,
        [notes, activeNoteId],
    );

    const activeTheme = activeNote ? STICKY_NOTE_COLORS[activeNote.color] : null;

    // Effective background: custom hex overrides theme
    const effectiveBg = activeNote?.customBg || activeTheme?.background || "#fef9ef";

    // ── Auto-select first note if active is deleted ──────────────────────
    useEffect(() => {
        if (activeNoteId && !notes.find((n) => n.id === activeNoteId)) {
            setActiveNoteId(notes.length > 0 ? notes[notes.length - 1].id : null);
        }
    }, [notes, activeNoteId]);

    // ── Sync hex input when switching notes ──────────────────────────────
    useEffect(() => {
        if (activeNote?.customBg) {
            setHexInput(activeNote.customBg);
        } else {
            setHexInput("");
        }
    }, [activeNoteId, activeNote?.customBg]);

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

    // ── Close popup on outside click ─────────────────────────────────────
    useEffect(() => {
        if (!isWidgetOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            // Don't close if clicking the trigger button or inside the popup
            if (
                widgetRef.current && !widgetRef.current.contains(target) &&
                !(target as Element).closest?.(".snw-trigger")
            ) {
                setIsWidgetOpen(false);
                setShowColorPicker(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isWidgetOpen]);

    // ── Add note handler ─────────────────────────────────────────────────
    const handleAddNote = useCallback(() => {
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
        setActiveNoteId(id);
        setShowColorPicker(false);
    }, []);

    // ── Delete active note ───────────────────────────────────────────────
    const handleDeleteActive = useCallback(() => {
        if (!activeNoteId) return;
        deleteNote(activeNoteId);
    }, [activeNoteId, deleteNote]);

    // ── Copy active note text to clipboard ─────────────────────────────
    const handleCopyActive = useCallback(() => {
        if (!activeNote) return;
        navigator.clipboard.writeText(activeNote.text);
    }, [activeNote]);

    // ── Hex color submit ─────────────────────────────────────────────────
    const handleHexSubmit = useCallback(() => {
        if (!activeNote) return;
        const hex = hexInput.trim();
        // Validate hex color
        if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
            const formatted = hex.startsWith("#") ? hex : `#${hex}`;
            updateCustomBg(activeNote.id, formatted);
            setHexInput(formatted);
        }
    }, [activeNote, hexInput, updateCustomBg]);

    const handleClearCustomBg = useCallback(() => {
        if (!activeNote) return;
        updateCustomBg(activeNote.id, undefined);
        setHexInput("");
    }, [activeNote, updateCustomBg]);

    // ── Text formatting helpers ─────────────────────────────────────────
    const wrapSelection = useCallback((before: string, after: string) => {
        const ta = textareaRef.current;
        if (!ta || !activeNote) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const text = activeNote.text;
        const selected = text.slice(start, end);
        const newText = text.slice(0, start) + before + selected + after + text.slice(end);
        updateText(activeNote.id, newText);
        // restore cursor after React re-render
        requestAnimationFrame(() => {
            ta.focus();
            const cursorPos = selected.length > 0 ? start + before.length + selected.length + after.length : start + before.length;
            ta.setSelectionRange(cursorPos, cursorPos);
        });
    }, [activeNote, updateText]);

    const handleBold = useCallback(() => wrapSelection("**", "**"), [wrapSelection]);
    const handleItalic = useCallback(() => wrapSelection("*", "*"), [wrapSelection]);
    const handleUnderline = useCallback(() => wrapSelection("<u>", "</u>"), [wrapSelection]);
    const handleStrikethrough = useCallback(() => wrapSelection("~~", "~~"), [wrapSelection]);

    const handleBulletList = useCallback(() => {
        const ta = textareaRef.current;
        if (!ta || !activeNote) return;
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const text = activeNote.text;
        const beforeBlock = text.lastIndexOf("\n", start - 1) + 1;
        const afterBlock = text.indexOf("\n", end);
        const blockEnd = afterBlock === -1 ? text.length : afterBlock;
        const block = text.slice(beforeBlock, blockEnd);
        const lines = block.split("\n");
        const allBulleted = lines.every((l) => l.trimStart().startsWith("• "));
        const newLines = allBulleted
            ? lines.map((l) => l.replace(/^(\s*)• /, "$1"))
            : lines.map((l) => (l.trimStart().startsWith("• ") ? l : "• " + l));
        const newText = text.slice(0, beforeBlock) + newLines.join("\n") + text.slice(blockEnd);
        updateText(activeNote.id, newText);
        requestAnimationFrame(() => ta.focus());
    }, [activeNote, updateText]);

    const handleImageInsert = useCallback(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file || !activeNote) return;
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                const ta = textareaRef.current;
                const pos = ta ? ta.selectionStart : activeNote.text.length;
                const text = activeNote.text;
                const insertion = `\n![${file.name}](${dataUrl})\n`;
                const newText = text.slice(0, pos) + insertion + text.slice(pos);
                updateText(activeNote.id, newText);
                requestAnimationFrame(() => {
                    if (ta) {
                        ta.focus();
                        const cp = pos + insertion.length;
                        ta.setSelectionRange(cp, cp);
                    }
                });
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }, [activeNote, updateText]);

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

    return (
        <>
            {/* ── Floating Trigger Button (bottom-right) ──────────────── */}
            <button
                className="snw-trigger"
                onClick={() => setIsWidgetOpen((v) => !v)}
                title="Sticky Notes"
            >
                {isWidgetOpen ? (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15.5 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8.5L15.5 3z" />
                        <polyline points="14 3 14 8 21 8" />
                    </svg>
                )}
                {notes.length > 0 && !isWidgetOpen && (
                    <span className="snw-trigger-badge">{notes.length}</span>
                )}
            </button>

            {/* ── Popup Widget Window ──────────────────────────────────── */}
            {isWidgetOpen && (
                <div ref={widgetRef} className="snw-popup">
                    {/* Note Tabs */}
                    <div className="snw-tabs">
                        <div className="snw-tabs-scroll">
                            {notes.map((note) => {
                                const theme = STICKY_NOTE_COLORS[note.color];
                                const isActive = note.id === activeNoteId;
                                return (
                                    <button
                                        key={note.id}
                                        className={`snw-tab${isActive ? " snw-tab--active" : ""}`}
                                        style={{
                                            "--tab-accent": theme.accent,
                                            "--tab-bg": note.customBg || theme.background,
                                        } as React.CSSProperties}
                                        onClick={() => handleTabClick(note.id)}
                                        title={note.text.slice(0, 50) || "Empty note"}
                                    >
                                        <span className="snw-tab-dot" style={{ backgroundColor: note.customBg || theme.accent }} />
                                        <span className="snw-tab-label">
                                            {note.text.slice(0, 16) || "New note"}
                                            {note.text.length > 16 ? "\u2026" : ""}
                                        </span>
                                        <button
                                            className="snw-tab-close"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteNote(note.id);
                                            }}
                                            title="Delete"
                                        >
                                            ×
                                        </button>
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            className="snw-tabs-add"
                            onClick={handleAddNote}
                            title="Add note"
                        >
                            +
                        </button>
                    </div>

                    {/* Note Editor Area */}
                    {activeNote && activeTheme ? (
                        <div
                            className="snw-editor"
                            style={{
                                "--sn-bg": effectiveBg,
                                "--sn-header": activeTheme.header,
                                "--sn-text": activeTheme.text,
                                "--sn-border": activeTheme.border,
                                "--sn-accent": activeTheme.accent,
                            } as React.CSSProperties}
                        >
                            {/* Editor toolbar */}
                            <div className="snw-editor-toolbar">
                                <div className="snw-editor-toolbar-left">
                                    <button
                                        className="snw-color-dot"
                                        style={{ backgroundColor: activeNote.customBg || activeTheme.accent }}
                                        onClick={() => setShowColorPicker((v) => !v)}
                                        title="Change color"
                                    />
                                    <span className="snw-timestamp">
                                        {formatTime(activeNote.updatedAt)}
                                    </span>
                                    <span className="snw-charcount">
                                        {activeNote.text.length}
                                    </span>
                                </div>
                                <div className="snw-editor-toolbar-right">
                                    <button
                                        className="snw-icon-btn"
                                        onClick={() => updateFontSize(activeNote.id, activeNote.fontSize - 1)}
                                        title="Smaller font"
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    </button>
                                    <span className="snw-font-label">{activeNote.fontSize}</span>
                                    <button
                                        className="snw-icon-btn"
                                        onClick={() => updateFontSize(activeNote.id, activeNote.fontSize + 1)}
                                        title="Larger font"
                                    >
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    </button>
                                    <button className="snw-icon-btn" onClick={handleCopyActive} title="Copy">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                                    </button>
                                    <button className="snw-icon-btn snw-icon-btn--danger" onClick={handleDeleteActive} title="Delete">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                    </button>
                                </div>
                            </div>

                            {/* Color picker popover */}
                            {showColorPicker && (
                                <div ref={colorPickerRef} className="snw-color-picker">
                                    <div className="snw-color-swatches">
                                        {STICKY_NOTE_COLOR_KEYS.map((c) => (
                                            <button
                                                key={c}
                                                className={`snw-color-swatch${c === activeNote.color && !activeNote.customBg ? " snw-color-swatch--active" : ""}`}
                                                style={{ backgroundColor: STICKY_NOTE_COLORS[c].accent }}
                                                onClick={() => {
                                                    updateColor(activeNote.id, c);
                                                    updateCustomBg(activeNote.id, undefined);
                                                    setHexInput("");
                                                    setShowColorPicker(false);
                                                }}
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                    <div className="snw-hex-row">
                                        <span className="snw-hex-label">Hex</span>
                                        <input
                                            className="snw-hex-input"
                                            type="text"
                                            placeholder="#f5e6c8"
                                            value={hexInput}
                                            onChange={(e) => setHexInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleHexSubmit();
                                            }}
                                            maxLength={7}
                                        />
                                        <button className="snw-hex-apply" onClick={handleHexSubmit} title="Apply hex color">
                                            ✓
                                        </button>
                                        {activeNote.customBg && (
                                            <button className="snw-hex-clear" onClick={handleClearCustomBg} title="Reset to preset">
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Textarea body */}
                            <div className="snw-editor-body">
                                <textarea
                                    ref={textareaRef}
                                    className="snw-textarea"
                                    value={activeNote.text}
                                    onChange={(e) => updateText(activeNote.id, e.target.value)}
                                    placeholder="Write your note..."
                                    style={{
                                        fontSize: `${activeNote.fontSize}px`,
                                        backgroundColor: effectiveBg,
                                    }}
                                />
                            </div>

                            {/* Formatting toolbar */}
                            <div className="snw-format-bar">
                                <button className="snw-format-btn" onClick={handleBold} title="Bold">
                                    <b>B</b>
                                </button>
                                <button className="snw-format-btn" onClick={handleItalic} title="Italic">
                                    <i>I</i>
                                </button>
                                <button className="snw-format-btn" onClick={handleUnderline} title="Underline">
                                    <u>U</u>
                                </button>
                                <button className="snw-format-btn" onClick={handleStrikethrough} title="Strikethrough">
                                    <span style={{ textDecoration: "line-through" }}>ab</span>
                                </button>
                                <button className="snw-format-btn" onClick={handleBulletList} title="Bullet list">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="8" y1="6" x2="21" y2="6"/>
                                        <line x1="8" y1="12" x2="21" y2="12"/>
                                        <line x1="8" y1="18" x2="21" y2="18"/>
                                        <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/>
                                        <circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/>
                                        <circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/>
                                    </svg>
                                </button>
                                <button className="snw-format-btn" onClick={handleImageInsert} title="Insert image">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                                        <circle cx="8.5" cy="8.5" r="1.5"/>
                                        <polyline points="21 15 16 10 5 21"/>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="snw-empty">
                            <div className="snw-empty-icon">
                                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
                                    <path d="M15.5 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V8.5L15.5 3z" />
                                    <polyline points="14 3 14 8 21 8" />
                                </svg>
                            </div>
                            <p className="snw-empty-text">
                                {notes.length === 0
                                    ? "No notes yet. Click + to create one!"
                                    : "Select a note from the tabs above"}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </>
    );
};
