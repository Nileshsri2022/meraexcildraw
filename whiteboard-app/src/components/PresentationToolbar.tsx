/**
 * PresentationToolbar — Floating toolbar for the AI Presentation Mode.
 *
 * Provides controls for:
 * - Adding frames manually
 * - Auto-framing with AI
 * - Managing slides (reorder, rename, delete)
 * - Generating speaker notes
 * - Starting presentation mode
 * - Exporting to PDF/PPTX
 */
import React, { useState, useCallback } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { UsePresentationReturn } from "../hooks/usePresentation";
import { exportToPDF, exportToPPTX } from "../utils/presentationExport";

interface PresentationToolbarProps {
    presentation: UsePresentationReturn;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export const PresentationToolbar: React.FC<PresentationToolbarProps> = ({
    presentation,
    excalidrawAPI,
}) => {
    const {
        frames,
        isAutoFraming,
        isGeneratingNotes,
        isToolbarOpen,
        addFrameAtViewport,
        autoFrame,
        generateSpeakerNotes,
        clearFrames,
        startPresenting,
        zoomToFrame,
        deleteFrame,
        reorderFrame,
        toggleToolbar,
    } = presentation;

    const [isExporting, setIsExporting] = useState(false);
    const [showSlideList, setShowSlideList] = useState(false);

    // ─── Export Handlers ─────────────────────────────────────────────────────

    const handleExportPDF = useCallback(async () => {
        if (!excalidrawAPI || frames.length === 0) return;
        setIsExporting(true);
        try {
            await exportToPDF(excalidrawAPI, frames);
        } catch (err) {
            console.error("[Export] PDF failed:", err);
            alert("PDF export failed. See console for details.");
        } finally {
            setIsExporting(false);
        }
    }, [excalidrawAPI, frames]);

    const handleExportPPTX = useCallback(async () => {
        if (!excalidrawAPI || frames.length === 0) return;
        setIsExporting(true);
        try {
            await exportToPPTX(excalidrawAPI, frames);
        } catch (err) {
            console.error("[Export] PPTX failed:", err);
            alert("PPTX export failed. See console for details.");
        } finally {
            setIsExporting(false);
        }
    }, [excalidrawAPI, frames]);

    if (!isToolbarOpen) return null;

    return (
        <div className="pres-toolbar">
            {/* Header */}
            <div className="pres-toolbar__header">
                <div className="pres-toolbar__title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                        <line x1="8" y1="21" x2="16" y2="21" />
                        <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    <span>Presentation</span>
                    <span className="pres-toolbar__badge">{frames.length}</span>
                </div>
                <button className="pres-toolbar__close" onClick={toggleToolbar} title="Close">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            {/* ─── Action Buttons ─── */}
            <div className="pres-toolbar__actions">
                {/* Add Frame */}
                <button
                    className="pres-action-btn"
                    onClick={addFrameAtViewport}
                    title="Add a slide frame at current viewport"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <line x1="12" y1="8" x2="12" y2="16" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    Add Frame
                </button>

                {/* Auto-Frame with AI */}
                <button
                    className="pres-action-btn pres-action-btn--ai"
                    onClick={autoFrame}
                    disabled={isAutoFraming}
                    title="AI auto-generates slide frames from canvas content"
                >
                    {isAutoFraming ? (
                        <span className="pres-spinner" />
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                    )}
                    {isAutoFraming ? "Analyzing..." : "Auto Slide"}
                </button>
            </div>

            {/* ─── Slide List ─── */}
            {frames.length > 0 && (
                <>
                    <div className="pres-toolbar__divider" />

                    <button
                        className="pres-section-toggle"
                        onClick={() => setShowSlideList(prev => !prev)}
                    >
                        <svg
                            width="12" height="12" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2"
                            style={{ transform: showSlideList ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s ease" }}
                        >
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                        Slides ({frames.length})
                    </button>

                    {showSlideList && (
                        <div className="pres-slide-list">
                            {[...frames].sort((a, b) => a.order - b.order).map((frame, i) => (
                                <div key={frame.id} className="pres-slide-item">
                                    <div
                                        className="pres-slide-item__color"
                                        style={{ backgroundColor: frame.color }}
                                    />
                                    <span
                                        className="pres-slide-item__label"
                                        onClick={() => zoomToFrame(frame)}
                                        title="Click to zoom to this frame"
                                    >
                                        {i + 1}. {frame.label}
                                    </span>
                                    <div className="pres-slide-item__actions">
                                        {i > 0 && (
                                            <button
                                                className="pres-slide-btn"
                                                onClick={() => reorderFrame(frame.id, i - 1)}
                                                title="Move up"
                                            >↑</button>
                                        )}
                                        {i < frames.length - 1 && (
                                            <button
                                                className="pres-slide-btn"
                                                onClick={() => reorderFrame(frame.id, i + 1)}
                                                title="Move down"
                                            >↓</button>
                                        )}
                                        <button
                                            className="pres-slide-btn pres-slide-btn--delete"
                                            onClick={() => deleteFrame(frame.id)}
                                            title="Delete"
                                        >×</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="pres-toolbar__divider" />

                    {/* ─── Secondary Actions ─── */}
                    <div className="pres-toolbar__secondary">
                        {/* Generate Speaker Notes */}
                        <button
                            className="pres-action-btn pres-action-btn--sm"
                            onClick={generateSpeakerNotes}
                            disabled={isGeneratingNotes}
                            title="AI generates speaker notes for each slide"
                        >
                            {isGeneratingNotes ? (
                                <span className="pres-spinner" />
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                </svg>
                            )}
                            {isGeneratingNotes ? "Generating..." : "Speaker Notes"}
                        </button>

                        {/* Export PDF */}
                        <button
                            className="pres-action-btn pres-action-btn--sm"
                            onClick={handleExportPDF}
                            disabled={isExporting}
                            title="Export presentation as PDF"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            PDF
                        </button>

                        {/* Export PPTX */}
                        <button
                            className="pres-action-btn pres-action-btn--sm"
                            onClick={handleExportPPTX}
                            disabled={isExporting}
                            title="Export presentation as PowerPoint"
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            PPTX
                        </button>
                    </div>

                    <div className="pres-toolbar__divider" />

                    {/* ─── Present Button ─── */}
                    <button
                        className="pres-action-btn pres-action-btn--present"
                        onClick={startPresenting}
                        title="Start fullscreen presentation"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="5 3 19 12 5 21 5 3" />
                        </svg>
                        Present ({frames.length} slides)
                    </button>

                    {/* Clear All */}
                    <button
                        className="pres-action-btn pres-action-btn--sm pres-action-btn--danger"
                        onClick={() => {
                            if (confirm("Remove all frames?")) clearFrames();
                        }}
                        title="Remove all frames"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Clear All
                    </button>
                </>
            )}
        </div>
    );
};
