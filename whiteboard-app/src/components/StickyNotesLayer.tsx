/**
 * StickyNotesLayer — Floating widget for sticky notes (bottom-right).
 *
 * Windows Sticky Notes-style popup:
 * - Small circular button in the bottom-right corner
 * - Opens a floating popup with note tabs (auto-hide on blur)
 * - Rich text formatting (Bold, Italic, Underline, Strikethrough, Lists, Images)
 * - Bottom toolbar with color picker, formatting, font controls (auto-hide on blur)
 * - Accent bar always visible at top
 */
import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
    STICKY_NOTE_COLORS,
    STICKY_NOTE_COLOR_KEYS,
} from "../types/sticky-notes";
import type { UseStickyNotesReturn } from "../hooks/useStickyNotes";
import { useAIExplain } from "../hooks/useAIExplain";
import { AIExplainPanel, AISparkleIcon } from "./AIExplainPanel";

// ─── Props ───────────────────────────────────────────────────────────────────

interface StickyNotesLayerProps {
    excalidrawAPI: unknown;
    stickyNotes: UseStickyNotesReturn;
}

// ─── Helper: strip HTML tags for display ────────────────────────────────────
const stripHtml = (html: string) => html.replace(/<[^>]*>/g, "");

// ─── Helper: lightweight markdown → HTML (for inserting AI responses) ────────
const simpleMarkdownToHtml = (md: string): string => {
    return md
        .split("\n")
        .map((line) => {
            // Headings
            if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
            if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
            if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
            // Bullet points (* or -)
            if (/^\s*[\*\-]\s+/.test(line)) {
                const text = line.replace(/^\s*[\*\-]\s+/, "");
                return `<li>${text}</li>`;
            }
            // Empty line → break
            if (line.trim() === "") return "<br>";
            // Paragraph
            return `<p>${line}</p>`;
        })
        .join("\n")
        // Wrap consecutive <li> in <ul>
        .replace(/(<li>.*?<\/li>\n?)+/gs, (match) => `<ul>${match}</ul>`)
        // Bold **text**
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        // Italic *text*
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        // Inline code `text`
        .replace(/`([^`]+)`/g, "<code>$1</code>");
};

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
        updateTextColor,
    } = stickyNotes;

    const [isWidgetOpen, setIsWidgetOpen] = useState(false);
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [hexInput, setHexInput] = useState("");
    const [textColorHex, setTextColorHex] = useState("");
    const [isNoteFocused, setIsNoteFocused] = useState(true);
    const editorRef = useRef<HTMLDivElement>(null);
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

    // Effective text color: custom hex overrides theme
    const effectiveTextColor = activeNote?.customTextColor || activeTheme?.text || "#4a3728";

    // ── Auto-select first note if active is deleted ──────────────────────
    useEffect(() => {
        if (activeNoteId && !notes.find((n) => n.id === activeNoteId)) {
            setActiveNoteId(notes.length > 0 ? notes[notes.length - 1].id : null);
        }
    }, [notes, activeNoteId]);

    // ── Sync hex inputs when switching notes ───────────────────────────
    useEffect(() => {
        if (activeNote?.customBg) {
            setHexInput(activeNote.customBg);
        } else {
            setHexInput("");
        }
        if (activeNote?.customTextColor) {
            setTextColorHex(activeNote.customTextColor);
        } else {
            setTextColorHex("");
        }
    }, [activeNoteId, activeNote?.customBg, activeNote?.customTextColor]);

    // ── Sync contentEditable when switching notes ────────────────────────
    useEffect(() => {
        if (editorRef.current && activeNote) {
            editorRef.current.innerHTML = activeNote.text;
            editorRef.current.focus();
        } else if (editorRef.current) {
            editorRef.current.innerHTML = "";
        }
    }, [activeNoteId]); // only on note switch

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

    // ── Focus tracking: auto-hide tabs + toolbar on outside click ────────
    useEffect(() => {
        if (!isWidgetOpen) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                widgetRef.current && !widgetRef.current.contains(target) &&
                !(target as Element).closest?.(".snw-trigger")
            ) {
                setIsNoteFocused(false);
                setShowColorPicker(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isWidgetOpen]);

    // ── Reset focus when widget opens ────────────────────────────────────
    useEffect(() => {
        if (isWidgetOpen) setIsNoteFocused(true);
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
        if (editorRef.current) {
            navigator.clipboard.writeText(editorRef.current.innerText);
        }
    }, []);

    // ── Editor input handler (contentEditable) ──────────────────────────
    const handleEditorInput = useCallback(() => {
        if (editorRef.current && activeNote) {
            updateText(activeNote.id, editorRef.current.innerHTML);
        }
    }, [activeNote, updateText]);

    // ── Rich text formatting via execCommand ────────────────────────────
    const execFormat = useCallback((command: string, value?: string) => {
        editorRef.current?.focus();
        document.execCommand(command, false, value);
        // sync after formatting
        if (editorRef.current && activeNote) {
            updateText(activeNote.id, editorRef.current.innerHTML);
        }
    }, [activeNote, updateText]);

    const handleBold = useCallback(() => execFormat("bold"), [execFormat]);
    const handleItalic = useCallback(() => execFormat("italic"), [execFormat]);
    const handleUnderline = useCallback(() => execFormat("underline"), [execFormat]);
    const handleStrikethrough = useCallback(() => execFormat("strikeThrough"), [execFormat]);
    const handleBulletList = useCallback(() => execFormat("insertUnorderedList"), [execFormat]);

    const handleImageInsert = useCallback(() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                editorRef.current?.focus();
                document.execCommand("insertImage", false, dataUrl);
                if (editorRef.current && activeNote) {
                    updateText(activeNote.id, editorRef.current.innerHTML);
                }
            };
            reader.readAsDataURL(file);
        };
        input.click();
    }, [activeNote, updateText]);

    // ── Hex color submit ─────────────────────────────────────────────────
    const handleHexSubmit = useCallback(() => {
        if (!activeNote) return;
        const hex = hexInput.trim();
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

    // ── Text color hex submit ────────────────────────────────────────────
    const handleTextColorSubmit = useCallback(() => {
        if (!activeNote) return;
        const hex = textColorHex.trim();
        if (/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex)) {
            const formatted = hex.startsWith("#") ? hex : `#${hex}`;
            updateTextColor(activeNote.id, formatted);
            setTextColorHex(formatted);
        }
    }, [activeNote, textColorHex, updateTextColor]);

    const handleClearTextColor = useCallback(() => {
        if (!activeNote) return;
        updateTextColor(activeNote.id, undefined);
        setTextColorHex("");
    }, [activeNote, updateTextColor]);

    // ── Image resize setup for contentEditable ──────────────────────────
    useEffect(() => {
        const el = editorRef.current;
        if (!el) return;

        const makeImagesResizable = () => {
            el.querySelectorAll("img").forEach((img) => {
                if (img.dataset.resizable) return;
                img.dataset.resizable = "true";
                img.style.cursor = "nwse-resize";
                img.style.maxWidth = "100%";

                let startX = 0, startW = 0;
                const onMouseDown = (e: MouseEvent) => {
                    e.preventDefault();
                    startX = e.clientX;
                    startW = img.offsetWidth;
                    const onMouseMove = (e2: MouseEvent) => {
                        const newW = Math.max(40, startW + e2.clientX - startX);
                        img.style.width = `${newW}px`;
                        img.style.height = "auto";
                    };
                    const onMouseUp = () => {
                        document.removeEventListener("mousemove", onMouseMove);
                        document.removeEventListener("mouseup", onMouseUp);
                        if (editorRef.current && activeNote) {
                            updateText(activeNote.id, editorRef.current.innerHTML);
                        }
                    };
                    document.addEventListener("mousemove", onMouseMove);
                    document.addEventListener("mouseup", onMouseUp);
                };
                img.addEventListener("mousedown", onMouseDown);
            });
        };

        makeImagesResizable();
        const observer = new MutationObserver(makeImagesResizable);
        observer.observe(el, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [activeNoteId, activeNote, updateText]);

    // ── AI Explain (reusable hook) ────────────────────────────────────────
    const aiExplain = useAIExplain();

    // Detect what the user selected in the contentEditable: text or image
    const getSelectionContent = useCallback((): { text: string; imageData?: string } | null => {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        if (!editorRef.current?.contains(range.commonAncestorContainer)) return null;

        const fragment = range.cloneContents();
        const img = fragment.querySelector("img") as HTMLImageElement | null;
        if (img?.src) {
            return { text: sel.toString().trim(), imageData: img.src };
        }

        const anchorNode = sel.anchorNode;
        if (anchorNode?.nodeType === Node.ELEMENT_NODE) {
            const el = anchorNode as Element;
            const directImg = el.querySelector("img");
            if (directImg?.src) {
                return { text: sel.toString().trim(), imageData: directImg.src };
            }
        }

        const text = sel.toString().trim();
        if (!text) return null;
        return { text };
    }, []);

    // Trigger AI explain on selected content
    const handleAIExplain = useCallback(() => {
        const content = getSelectionContent();
        if (!content) return;
        aiExplain.explain(content);
    }, [getSelectionContent, aiExplain.explain]);

    // Accept: insert AI response into the editor (convert markdown to HTML)
    const handleAIAccept = useCallback(() => {
        if (!aiExplain.state.response || !editorRef.current || !activeNote) return;
        const rendered = simpleMarkdownToHtml(aiExplain.state.response);
        const aiHtml = `<div class="ai-explain-inserted"><hr style="border:none;border-top:1px dashed rgba(0,0,0,0.15);margin:8px 0"><div style="font-size:12px;opacity:0.5;margin-bottom:4px">✨ AI Explanation</div><div>${rendered}</div></div>`;
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer)) {
            const range = sel.getRangeAt(0);
            range.collapse(false);
            const temp = document.createElement("div");
            temp.innerHTML = aiHtml;
            const frag = document.createDocumentFragment();
            while (temp.firstChild) frag.appendChild(temp.firstChild);
            range.insertNode(frag);
        } else {
            editorRef.current.innerHTML += aiHtml;
        }
        updateText(activeNote.id, editorRef.current.innerHTML);
        aiExplain.reset();
    }, [aiExplain.state.response, activeNote, updateText, aiExplain.reset]);

    // Reset AI state on note switch
    useEffect(() => {
        return () => { aiExplain.cancel(); };
    }, [activeNoteId]);

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
                <div
                    ref={widgetRef}
                    className={`snw-popup${!isNoteFocused ? " snw-popup--blurred" : ""}`}
                    onMouseDown={() => setIsNoteFocused(true)}
                >
                    {/* Accent bar — always visible */}
                    <div
                        className="snw-accent-bar"
                        style={{ background: activeNote?.customBg || activeTheme?.accent || "#d4a017" }}
                    />

                    {/* Note Tabs — auto-hide on blur */}
                    <div className={`snw-tabs${!isNoteFocused ? " snw-tabs--hidden" : ""}`}>
                        <div className="snw-tabs-scroll">
                            {notes.map((note) => {
                                const theme = STICKY_NOTE_COLORS[note.color];
                                const isActive = note.id === activeNoteId;
                                const plain = stripHtml(note.text);
                                return (
                                    <button
                                        key={note.id}
                                        className={`snw-tab${isActive ? " snw-tab--active" : ""}`}
                                        style={{
                                            "--tab-accent": theme.accent,
                                            "--tab-bg": note.customBg || theme.background,
                                        } as React.CSSProperties}
                                        onClick={() => handleTabClick(note.id)}
                                        title={plain.slice(0, 50) || "Empty note"}
                                    >
                                        <span className="snw-tab-dot" style={{ backgroundColor: note.customBg || theme.accent }} />
                                        <span className="snw-tab-label">
                                            {plain.slice(0, 16) || "New note"}
                                            {plain.length > 16 ? "\u2026" : ""}
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
                            className={`snw-tabs-ai ai-explain-trigger${aiExplain.state.loading ? " ai-explain-trigger--loading" : ""}`}
                            onMouseDown={(e) => { e.preventDefault(); handleAIExplain(); }}
                            title="Explain with AI (select text or image first)"
                            disabled={aiExplain.state.loading}
                        >
                            <AISparkleIcon size={14} />
                        </button>
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
                            {/* ContentEditable body */}
                            <div className="snw-editor-body">
                                <div
                                    ref={editorRef}
                                    className="snw-content"
                                    contentEditable
                                    suppressContentEditableWarning
                                    onInput={handleEditorInput}
                                    data-placeholder="Write your note..."
                                    style={{
                                        fontSize: `${activeNote.fontSize}px`,
                                        backgroundColor: effectiveBg,
                                        color: effectiveTextColor,
                                    }}
                                />

                                {/* AI Explain response panel (reusable component) */}
                                <AIExplainPanel
                                    state={aiExplain.state}
                                    onAccept={handleAIAccept}
                                    onRegenerate={aiExplain.regenerate}
                                    onCancel={aiExplain.cancel}
                                />
                            </div>

                            {/* Color picker popover — positioned above bottom bar */}
                            {showColorPicker && (
                                <div
                                    ref={colorPickerRef}
                                    className="snw-color-picker"
                                    onMouseDown={(e) => e.stopPropagation()}
                                >
                                    <div className="snw-color-swatches">
                                        {STICKY_NOTE_COLOR_KEYS.map((c) => (
                                            <button
                                                key={c}
                                                className={`snw-color-swatch${c === activeNote.color && !activeNote.customBg ? " snw-color-swatch--active" : ""}`}
                                                style={{ backgroundColor: STICKY_NOTE_COLORS[c].accent }}
                                                onClick={() => {
                                                    updateColor(activeNote.id, c);
                                                    updateCustomBg(activeNote.id, undefined);
                                                    updateTextColor(activeNote.id, undefined);
                                                    setHexInput("");
                                                    setTextColorHex("");
                                                    setShowColorPicker(false);
                                                }}
                                                title={c}
                                            />
                                        ))}
                                    </div>
                                    {/* Background color hex */}
                                    <div className="snw-hex-row">
                                        <span className="snw-hex-label snw-hex-label--bg">BG</span>
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
                                        <button className="snw-hex-apply" onClick={handleHexSubmit} title="Apply background color">
                                            ✓
                                        </button>
                                        {activeNote.customBg && (
                                            <button className="snw-hex-clear" onClick={handleClearCustomBg} title="Reset background">
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                    {/* Text color hex */}
                                    <div className="snw-hex-row">
                                        <span className="snw-hex-label snw-hex-label--text">A</span>
                                        <input
                                            className="snw-hex-input"
                                            type="text"
                                            placeholder="#4a3728"
                                            value={textColorHex}
                                            onChange={(e) => setTextColorHex(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter") handleTextColorSubmit();
                                            }}
                                            maxLength={7}
                                        />
                                        <button className="snw-hex-apply" onClick={handleTextColorSubmit} title="Apply text color">
                                            ✓
                                        </button>
                                        {activeNote.customTextColor && (
                                            <button className="snw-hex-clear" onClick={handleClearTextColor} title="Reset text color">
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Bottom toolbar — auto-hide on blur */}
                            <div className={`snw-bottom-bar${!isNoteFocused ? " snw-bottom-bar--hidden" : ""}`}>
                                <div className="snw-bottom-bar-left">
                                    <button
                                        className="snw-color-dot"
                                        style={{ backgroundColor: activeNote.customBg || activeTheme.accent }}
                                        onMouseDown={(e) => { e.preventDefault(); setShowColorPicker((v) => !v); }}
                                        title="Change color"
                                    >
                                        <span className="snw-color-dot-letter" style={{ color: effectiveTextColor }}>A</span>
                                    </button>
                                    <span className="snw-bottom-divider" />
                                    <button className="snw-format-btn" onMouseDown={(e) => { e.preventDefault(); handleBold(); }} title="Bold">
                                        <b>B</b>
                                    </button>
                                    <button className="snw-format-btn" onMouseDown={(e) => { e.preventDefault(); handleItalic(); }} title="Italic">
                                        <i>I</i>
                                    </button>
                                    <button className="snw-format-btn" onMouseDown={(e) => { e.preventDefault(); handleUnderline(); }} title="Underline">
                                        <u>U</u>
                                    </button>
                                    <button className="snw-format-btn" onMouseDown={(e) => { e.preventDefault(); handleStrikethrough(); }} title="Strikethrough">
                                        <span style={{ textDecoration: "line-through" }}>ab</span>
                                    </button>
                                    <button className="snw-format-btn" onMouseDown={(e) => { e.preventDefault(); handleBulletList(); }} title="Bullet list">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <line x1="8" y1="6" x2="21" y2="6"/>
                                            <line x1="8" y1="12" x2="21" y2="12"/>
                                            <line x1="8" y1="18" x2="21" y2="18"/>
                                            <circle cx="3" cy="6" r="1.5" fill="currentColor" stroke="none"/>
                                            <circle cx="3" cy="12" r="1.5" fill="currentColor" stroke="none"/>
                                            <circle cx="3" cy="18" r="1.5" fill="currentColor" stroke="none"/>
                                        </svg>
                                    </button>
                                    <button className="snw-format-btn" onMouseDown={(e) => { e.preventDefault(); handleImageInsert(); }} title="Insert image">
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                                            <circle cx="8.5" cy="8.5" r="1.5"/>
                                            <polyline points="21 15 16 10 5 21"/>
                                        </svg>
                                    </button>
                                </div>
                                <div className="snw-bottom-bar-right">
                                    <span className="snw-timestamp">{formatTime(activeNote.updatedAt)}</span>
                                    <button className="snw-icon-btn" onMouseDown={(e) => { e.preventDefault(); updateFontSize(activeNote.id, activeNote.fontSize - 1); }} title="Smaller font">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    </button>
                                    <span className="snw-font-label">{activeNote.fontSize}</span>
                                    <button className="snw-icon-btn" onMouseDown={(e) => { e.preventDefault(); updateFontSize(activeNote.id, activeNote.fontSize + 1); }} title="Larger font">
                                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                                    </button>
                                    <button className="snw-icon-btn" onMouseDown={(e) => { e.preventDefault(); handleCopyActive(); }} title="Copy">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                                    </button>
                                    <button className="snw-icon-btn snw-icon-btn--danger" onMouseDown={(e) => { e.preventDefault(); handleDeleteActive(); }} title="Delete">
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                                    </button>
                                </div>
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
