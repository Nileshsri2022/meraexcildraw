/**
 * PresentationMode — Fullscreen slideshow view.
 *
 * Renders the canvas region defined by each frame in a clean,
 * distraction-free fullscreen view with smooth zoom transitions,
 * keyboard navigation, progress bar, and optional speaker notes.
 */
import React, { useEffect, useCallback, useState, useRef } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { PresentationFrame } from "../types/presentation";
import type { UsePresentationReturn } from "../hooks/usePresentation";

interface PresentationModeProps {
    presentation: UsePresentationReturn;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export const PresentationMode: React.FC<PresentationModeProps> = ({
    presentation,
    excalidrawAPI,
}) => {
    const {
        frames,
        currentSlideIndex,
        nextSlide,
        prevSlide,
        goToSlide,
        stopPresenting,
        zoomToFrame,
    } = presentation;

    const [showNotes, setShowNotes] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    const currentFrame = frames[currentSlideIndex];
    const totalSlides = frames.length;

    // ─── Zoom to current frame ───────────────────────────────────────────────

    useEffect(() => {
        if (currentFrame && excalidrawAPI) {
            zoomToFrame(currentFrame);
        }
    }, [currentFrame, excalidrawAPI, zoomToFrame]);

    // ─── Keyboard Navigation ─────────────────────────────────────────────────

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        switch (e.key) {
            case "ArrowRight":
            case " ":
            case "PageDown":
                e.preventDefault();
                nextSlide();
                break;
            case "ArrowLeft":
            case "PageUp":
                e.preventDefault();
                prevSlide();
                break;
            case "Escape":
                e.preventDefault();
                stopPresenting();
                break;
            case "n":
            case "N":
                e.preventDefault();
                setShowNotes(prev => !prev);
                break;
            case "Home":
                e.preventDefault();
                goToSlide(0);
                break;
            case "End":
                e.preventDefault();
                goToSlide(frames.length - 1);
                break;
        }
    }, [nextSlide, prevSlide, stopPresenting, goToSlide, frames.length]);

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // ─── Fullscreen on document + hide Excalidraw UI ─────────────────────────

    useEffect(() => {
        // Add class to hide Excalidraw toolbars/menus during presentation
        document.body.classList.add("presenting");

        // Request fullscreen on the root element so the canvas is still visible
        const root = document.documentElement;
        if (!document.fullscreenElement) {
            root.requestFullscreen?.().catch(() => {
                // Fullscreen may be blocked — presentation still works without it
            });
        }

        return () => {
            document.body.classList.remove("presenting");
            if (document.fullscreenElement) {
                document.exitFullscreen?.().catch(() => {});
            }
        };
    }, []);

    // Exit presentation if user exits fullscreen manually
    useEffect(() => {
        const handleFullscreenChange = () => {
            if (!document.fullscreenElement) {
                stopPresenting();
            }
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
    }, [stopPresenting]);

    // ─── Auto-hide controls ──────────────────────────────────────────────────

    const resetControlsTimer = useCallback(() => {
        setShowControls(true);
        if (controlsTimer.current) clearTimeout(controlsTimer.current);
        controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    useEffect(() => {
        resetControlsTimer();
        return () => {
            if (controlsTimer.current) clearTimeout(controlsTimer.current);
        };
    }, [resetControlsTimer]);

    if (!currentFrame) return null;

    const progress = totalSlides > 1 ? ((currentSlideIndex) / (totalSlides - 1)) * 100 : 100;

    return (
        <div
            className="presentation-overlay"
            onMouseMove={resetControlsTimer}
            onClick={resetControlsTimer}
        >
            {/* ─── Top Bar ─── */}
            <div className={`presentation-topbar ${showControls ? "" : "presentation-topbar--hidden"}`}>
                <div className="presentation-topbar__left">
                    <span className="presentation-slide-counter">
                        {currentSlideIndex + 1} / {totalSlides}
                    </span>
                    <span className="presentation-slide-label">
                        {currentFrame.label}
                    </span>
                </div>
                <div className="presentation-topbar__right">
                    <button
                        className={`presentation-btn presentation-btn--notes ${showNotes ? "presentation-btn--active" : ""}`}
                        onClick={() => setShowNotes(prev => !prev)}
                        title="Toggle speaker notes (N)"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                        </svg>
                    </button>
                    <button
                        className="presentation-btn presentation-btn--exit"
                        onClick={stopPresenting}
                        title="Exit presentation (Esc)"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* ─── Navigation Arrows ─── */}
            {currentSlideIndex > 0 && (
                <button
                    className={`presentation-nav presentation-nav--prev ${showControls ? "" : "presentation-nav--hidden"}`}
                    onClick={prevSlide}
                    title="Previous slide (←)"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
            )}
            {currentSlideIndex < totalSlides - 1 && (
                <button
                    className={`presentation-nav presentation-nav--next ${showControls ? "" : "presentation-nav--hidden"}`}
                    onClick={nextSlide}
                    title="Next slide (→)"
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="9 18 15 12 9 6" />
                    </svg>
                </button>
            )}

            {/* ─── Progress Bar ─── */}
            <div className={`presentation-progress ${showControls ? "" : "presentation-progress--hidden"}`}>
                <div
                    className="presentation-progress__fill"
                    style={{ width: `${progress}%` }}
                />
                {/* Slide dots */}
                <div className="presentation-progress__dots">
                    {frames.map((frame, i) => (
                        <button
                            key={frame.id}
                            className={`presentation-dot ${i === currentSlideIndex ? "presentation-dot--active" : ""}`}
                            onClick={() => goToSlide(i)}
                            title={frame.label}
                        />
                    ))}
                </div>
            </div>

            {/* ─── Speaker Notes Panel ─── */}
            {showNotes && currentFrame.speakerNotes && (
                <div className="presentation-notes">
                    <div className="presentation-notes__header">
                        <span>Speaker Notes</span>
                        <button onClick={() => setShowNotes(false)} className="presentation-notes__close">×</button>
                    </div>
                    <div className="presentation-notes__content">
                        {currentFrame.speakerNotes}
                    </div>
                </div>
            )}

            {/* ─── Keyboard Shortcuts Hint ─── */}
            <div className={`presentation-shortcuts ${showControls ? "" : "presentation-shortcuts--hidden"}`}>
                ← → Navigate &nbsp;|&nbsp; N Notes &nbsp;|&nbsp; Esc Exit
            </div>
        </div>
    );
};
