/**
 * FrameOverlay — Renders frame rectangles on top of the Excalidraw canvas.
 *
 * Each frame is shown as a labeled, colored border rectangle.
 * Frames can be selected, resized (via drag handles), and deleted.
 * Transforms coordinates from canvas space to screen space using
 * the current Excalidraw viewport (scroll + zoom).
 */
import React, { useCallback, useState, useRef, useEffect } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { PresentationFrame } from "../types/presentation";
import type { UsePresentationReturn } from "../hooks/usePresentation";

interface FrameOverlayProps {
    presentation: UsePresentationReturn;
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

interface ViewportTransform {
    scrollX: number;
    scrollY: number;
    zoom: number;
}

function getTransform(api: ExcalidrawImperativeAPI | null): ViewportTransform {
    if (!api) return { scrollX: 0, scrollY: 0, zoom: 1 };
    const s = api.getAppState();
    return {
        scrollX: s.scrollX ?? 0,
        scrollY: s.scrollY ?? 0,
        zoom: (s.zoom as any)?.value ?? 1,
    };
}

/** Convert canvas coords to screen coords */
function toScreen(x: number, y: number, t: ViewportTransform) {
    return {
        sx: (x + t.scrollX) * t.zoom,
        sy: (y + t.scrollY) * t.zoom,
    };
}

export const FrameOverlay: React.FC<FrameOverlayProps> = ({ presentation, excalidrawAPI }) => {
    const { frames, updateFrame, deleteFrame, zoomToFrame } = presentation;
    const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);
    const [transform, setTransform] = useState<ViewportTransform>({ scrollX: 0, scrollY: 0, zoom: 1 });
    const [editingLabel, setEditingLabel] = useState<string | null>(null);
    const [labelValue, setLabelValue] = useState("");
    const rafRef = useRef<number>(undefined);

    // Track viewport changes at ~30fps
    useEffect(() => {
        let active = true;
        const tick = () => {
            if (!active) return;
            setTransform(getTransform(excalidrawAPI));
            rafRef.current = requestAnimationFrame(tick);
        };
        tick();
        return () => {
            active = false;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [excalidrawAPI]);

    // ─── Resize by dragging corners ──────────────────────────────────────────

    const handleResizeStart = useCallback((
        e: React.MouseEvent,
        frame: PresentationFrame,
        corner: "se" | "sw" | "ne" | "nw"
    ) => {
        e.stopPropagation();
        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;
        const startFrame = { ...frame };

        const onMove = (me: MouseEvent) => {
            const dx = (me.clientX - startX) / transform.zoom;
            const dy = (me.clientY - startY) / transform.zoom;

            let newX = startFrame.x;
            let newY = startFrame.y;
            let newW = startFrame.width;
            let newH = startFrame.height;

            if (corner === "se") {
                newW = Math.max(200, startFrame.width + dx);
                newH = Math.max(150, startFrame.height + dy);
            } else if (corner === "sw") {
                newX = startFrame.x + dx;
                newW = Math.max(200, startFrame.width - dx);
                newH = Math.max(150, startFrame.height + dy);
            } else if (corner === "ne") {
                newW = Math.max(200, startFrame.width + dx);
                newY = startFrame.y + dy;
                newH = Math.max(150, startFrame.height - dy);
            } else if (corner === "nw") {
                newX = startFrame.x + dx;
                newY = startFrame.y + dy;
                newW = Math.max(200, startFrame.width - dx);
                newH = Math.max(150, startFrame.height - dy);
            }

            updateFrame(frame.id, { x: newX, y: newY, width: newW, height: newH });
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }, [transform.zoom, updateFrame]);

    // ─── Move by dragging label bar ──────────────────────────────────────────

    const handleMoveStart = useCallback((e: React.MouseEvent, frame: PresentationFrame) => {
        e.stopPropagation();
        e.preventDefault();
        setSelectedFrameId(frame.id);

        const startX = e.clientX;
        const startY = e.clientY;
        const startFrame = { ...frame };

        const onMove = (me: MouseEvent) => {
            const dx = (me.clientX - startX) / transform.zoom;
            const dy = (me.clientY - startY) / transform.zoom;
            updateFrame(frame.id, {
                x: startFrame.x + dx,
                y: startFrame.y + dy,
            });
        };

        const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }, [transform.zoom, updateFrame]);

    // ─── Label Editing ───────────────────────────────────────────────────────

    const startEditLabel = useCallback((frame: PresentationFrame) => {
        setEditingLabel(frame.id);
        setLabelValue(frame.label);
    }, []);

    const finishEditLabel = useCallback(() => {
        if (editingLabel && labelValue.trim()) {
            updateFrame(editingLabel, { label: labelValue.trim() });
        }
        setEditingLabel(null);
    }, [editingLabel, labelValue, updateFrame]);

    if (frames.length === 0) return null;

    return (
        <div className="frame-overlay" style={{ pointerEvents: "none" }}>
            {frames.map((frame) => {
                const { sx, sy } = toScreen(frame.x, frame.y, transform);
                const w = frame.width * transform.zoom;
                const h = frame.height * transform.zoom;
                const isSelected = selectedFrameId === frame.id;

                return (
                    <div
                        key={frame.id}
                        className={`frame-rect ${isSelected ? "frame-rect--selected" : ""}`}
                        style={{
                            left: sx,
                            top: sy,
                            width: w,
                            height: h,
                            borderColor: frame.color,
                            pointerEvents: "auto",
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFrameId(isSelected ? null : frame.id);
                        }}
                    >
                        {/* Frame Label Bar */}
                        <div
                            className="frame-label-bar"
                            style={{ backgroundColor: frame.color }}
                            onMouseDown={(e) => handleMoveStart(e, frame)}
                            onDoubleClick={() => startEditLabel(frame)}
                        >
                            {editingLabel === frame.id ? (
                                <input
                                    className="frame-label-input"
                                    value={labelValue}
                                    onChange={(e) => setLabelValue(e.target.value)}
                                    onBlur={finishEditLabel}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") finishEditLabel();
                                        if (e.key === "Escape") setEditingLabel(null);
                                    }}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                />
                            ) : (
                                <span className="frame-label-text">
                                    {frame.order + 1}. {frame.label}
                                </span>
                            )}

                            {/* Frame actions */}
                            <div className="frame-actions">
                                <button
                                    className="frame-action-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        zoomToFrame(frame);
                                    }}
                                    title="Zoom to frame"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                </button>
                                <button
                                    className="frame-action-btn frame-action-btn--delete"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteFrame(frame.id);
                                    }}
                                    title="Delete frame"
                                >
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <line x1="18" y1="6" x2="6" y2="18" />
                                        <line x1="6" y1="6" x2="18" y2="18" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Resize Handles (only when selected) */}
                        {isSelected && (
                            <>
                                <div className="frame-handle frame-handle--nw" onMouseDown={(e) => handleResizeStart(e, frame, "nw")} />
                                <div className="frame-handle frame-handle--ne" onMouseDown={(e) => handleResizeStart(e, frame, "ne")} />
                                <div className="frame-handle frame-handle--sw" onMouseDown={(e) => handleResizeStart(e, frame, "sw")} />
                                <div className="frame-handle frame-handle--se" onMouseDown={(e) => handleResizeStart(e, frame, "se")} />
                            </>
                        )}

                        {/* Speaker notes indicator */}
                        {frame.speakerNotes && (
                            <div className="frame-notes-indicator" title="Has speaker notes">
                                📝
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};
