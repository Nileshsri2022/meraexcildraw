/**
 * usePresentation — Core hook for the AI Presentation Mode.
 *
 * Manages presentation frames (slide regions), auto-framing via AI,
 * speaker notes generation, slide navigation, and export.
 *
 * Works with Excalidraw elements to determine which elements belong
 * to which frame based on spatial containment.
 */
import { useState, useCallback, useRef } from "react";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type {
    PresentationFrame,
    PresentationSlide,
    PresentationViewMode,
    AutoFrameResponse,
    ElementSummary,
} from "../types/presentation";
import { getFrameColor } from "../types/presentation";

const CHAT_SERVICE_URL = import.meta.env.VITE_CHAT_URL || "http://localhost:3003";

// ─── Helpers ─────────────────────────────────────────────────────────────────

let frameIdCounter = 0;
function generateFrameId(): string {
    return `frame-${Date.now()}-${++frameIdCounter}`;
}

/** Check if an element's center is inside a frame */
function isElementInFrame(
    el: { x: number; y: number; width: number; height: number },
    frame: PresentationFrame
): boolean {
    const cx = el.x + el.width / 2;
    const cy = el.y + el.height / 2;
    return (
        cx >= frame.x &&
        cx <= frame.x + frame.width &&
        cy >= frame.y &&
        cy <= frame.y + frame.height
    );
}

/** Get element summaries from Excalidraw API */
function getElementSummaries(api: ExcalidrawImperativeAPI): ElementSummary[] {
    const elements = api.getSceneElements();
    return elements
        .filter((el: any) => !el.isDeleted)
        .map((el: any) => ({
            id: el.id,
            type: el.type,
            x: el.x,
            y: el.y,
            width: el.width || 0,
            height: el.height || 0,
            text: el.text || el.originalText || undefined,
            strokeColor: el.strokeColor,
            backgroundColor: el.backgroundColor,
        }));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePresentation(excalidrawAPI: ExcalidrawImperativeAPI | null) {
    const [frames, setFrames] = useState<PresentationFrame[]>([]);
    const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
    const [viewMode, setViewMode] = useState<PresentationViewMode>("edit");
    const [isAutoFraming, setIsAutoFraming] = useState(false);
    const [isGeneratingNotes, setIsGeneratingNotes] = useState(false);
    const [isToolbarOpen, setIsToolbarOpen] = useState(false);

    // Track if we were in a different scroll/zoom before presenting
    const savedAppState = useRef<{ scrollX: number; scrollY: number; zoom: number } | null>(null);

    // ─── Frame CRUD ──────────────────────────────────────────────────────────

    /** Add a new frame at given canvas coordinates */
    const addFrame = useCallback((x: number, y: number, width = 960, height = 540): PresentationFrame => {
        const newFrame: PresentationFrame = {
            id: generateFrameId(),
            label: `Slide ${frames.length + 1}`,
            x,
            y,
            width,
            height,
            order: frames.length,
            color: getFrameColor(frames.length),
        };
        setFrames(prev => [...prev, newFrame]);
        return newFrame;
    }, [frames.length]);

    /** Add a frame centered in the current viewport */
    const addFrameAtViewport = useCallback(() => {
        if (!excalidrawAPI) return null;
        const appState = excalidrawAPI.getAppState();
        const zoom = (appState.zoom as any)?.value ?? 1;
        const cx = (-appState.scrollX + window.innerWidth / 2 / zoom);
        const cy = (-appState.scrollY + window.innerHeight / 2 / zoom);
        const w = 960;
        const h = 540;
        return addFrame(cx - w / 2, cy - h / 2, w, h);
    }, [excalidrawAPI, addFrame]);

    /** Update a frame's properties */
    const updateFrame = useCallback((id: string, updates: Partial<PresentationFrame>) => {
        setFrames(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    }, []);

    /** Delete a frame */
    const deleteFrame = useCallback((id: string) => {
        setFrames(prev => {
            const filtered = prev.filter(f => f.id !== id);
            // Re-order remaining frames
            return filtered.map((f, i) => ({ ...f, order: i }));
        });
    }, []);

    /** Reorder frames (move frame to new index) */
    const reorderFrame = useCallback((frameId: string, newIndex: number) => {
        setFrames(prev => {
            const frame = prev.find(f => f.id === frameId);
            if (!frame) return prev;
            const others = prev.filter(f => f.id !== frameId);
            others.splice(newIndex, 0, frame);
            return others.map((f, i) => ({ ...f, order: i }));
        });
    }, []);

    /** Clear all frames */
    const clearFrames = useCallback(() => {
        setFrames([]);
        setCurrentSlideIndex(0);
    }, []);

    // ─── Slide Computation ───────────────────────────────────────────────────

    /** Build slides from frames + current canvas elements */
    const getSlides = useCallback((): PresentationSlide[] => {
        if (!excalidrawAPI) return [];
        const elements = getElementSummaries(excalidrawAPI);
        const sortedFrames = [...frames].sort((a, b) => a.order - b.order);

        return sortedFrames.map(frame => {
            const contained = elements.filter(el => isElementInFrame(el, frame));
            return {
                frame,
                elementIds: contained.map(el => el.id),
            };
        });
    }, [excalidrawAPI, frames]);

    // ─── Auto-Frame via AI ───────────────────────────────────────────────────

    /** Ask the AI to automatically create frames from canvas content */
    const autoFrame = useCallback(async () => {
        if (!excalidrawAPI) return;
        setIsAutoFraming(true);

        try {
            const elements = getElementSummaries(excalidrawAPI);
            if (elements.length === 0) {
                alert("No elements on canvas to auto-frame.");
                return;
            }

            const response = await fetch(`${CHAT_SERVICE_URL}/presentation/auto-frame`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ elements }),
            });

            if (!response.ok) {
                throw new Error(`Auto-frame failed: ${response.statusText}`);
            }

            const data: AutoFrameResponse = await response.json();

            // Convert response to PresentationFrames
            const newFrames: PresentationFrame[] = data.frames.map((f, i) => ({
                id: generateFrameId(),
                label: f.label || `Slide ${i + 1}`,
                x: f.x,
                y: f.y,
                width: f.width,
                height: f.height,
                order: i,
                color: getFrameColor(i),
                speakerNotes: f.speakerNotes,
            }));

            setFrames(newFrames);
            setCurrentSlideIndex(0);
        } catch (err) {
            console.error("[Presentation] Auto-frame error:", err);
            alert("Auto-framing failed. Check that the chat service is running.");
        } finally {
            setIsAutoFraming(false);
        }
    }, [excalidrawAPI]);

    // ─── Speaker Notes Generation ────────────────────────────────────────────

    /** Generate speaker notes for all frames via AI */
    const generateSpeakerNotes = useCallback(async () => {
        if (!excalidrawAPI || frames.length === 0) return;
        setIsGeneratingNotes(true);

        try {
            const elements = getElementSummaries(excalidrawAPI);

            const frameData = frames.map(frame => {
                const contained = elements.filter(el => isElementInFrame(el, frame));
                return {
                    label: frame.label,
                    elements: contained,
                };
            });

            const response = await fetch(`${CHAT_SERVICE_URL}/presentation/speaker-notes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ frames: frameData }),
            });

            if (!response.ok) {
                throw new Error(`Speaker notes generation failed: ${response.statusText}`);
            }

            const data = await response.json();

            // Update frames with speaker notes
            setFrames(prev => prev.map((frame, i) => ({
                ...frame,
                speakerNotes: data.notes[i]?.speakerNotes || frame.speakerNotes,
            })));
        } catch (err) {
            console.error("[Presentation] Speaker notes error:", err);
            alert("Speaker notes generation failed.");
        } finally {
            setIsGeneratingNotes(false);
        }
    }, [excalidrawAPI, frames]);

    // ─── Presentation Navigation ─────────────────────────────────────────────

    /** Enter presentation mode */
    const startPresenting = useCallback(() => {
        if (frames.length === 0) {
            alert("Add at least one frame before presenting.");
            return;
        }
        // Save current viewport state
        if (excalidrawAPI) {
            const appState = excalidrawAPI.getAppState();
            savedAppState.current = {
                scrollX: appState.scrollX,
                scrollY: appState.scrollY,
                zoom: (appState.zoom as any)?.value ?? 1,
            };
        }
        setCurrentSlideIndex(0);
        setViewMode("presenting");
    }, [excalidrawAPI, frames.length]);

    /** Exit presentation mode */
    const stopPresenting = useCallback(() => {
        setViewMode("edit");
        // Restore viewport
        if (excalidrawAPI && savedAppState.current) {
            excalidrawAPI.updateScene({
                appState: {
                    scrollX: savedAppState.current.scrollX,
                    scrollY: savedAppState.current.scrollY,
                    zoom: { value: savedAppState.current.zoom },
                } as any,
            });
            savedAppState.current = null;
        }
    }, [excalidrawAPI]);

    /** Go to next slide */
    const nextSlide = useCallback(() => {
        setCurrentSlideIndex(prev => Math.min(prev + 1, frames.length - 1));
    }, [frames.length]);

    /** Go to previous slide */
    const prevSlide = useCallback(() => {
        setCurrentSlideIndex(prev => Math.max(prev - 1, 0));
    }, []);

    /** Go to specific slide */
    const goToSlide = useCallback((index: number) => {
        setCurrentSlideIndex(Math.max(0, Math.min(index, frames.length - 1)));
    }, [frames.length]);

    /** Zoom the canvas to focus on a specific frame */
    const zoomToFrame = useCallback((frame: PresentationFrame) => {
        if (!excalidrawAPI) return;

        // Use Excalidraw's scrollToContent to zoom to the frame area
        // We create a temporary element-like object for the bounds
        const padding = 40;
        const elements = excalidrawAPI.getSceneElements();
        const frameElements = elements.filter((el: any) => {
            if (el.isDeleted) return false;
            return isElementInFrame(
                { x: el.x, y: el.y, width: el.width || 0, height: el.height || 0 },
                frame
            );
        });

        if (frameElements.length > 0) {
            excalidrawAPI.scrollToContent(frameElements, {
                fitToContent: true,
                animate: true,
            });
        } else {
            // If no elements, just scroll to frame center
            const zoom = Math.min(
                (window.innerWidth - padding * 2) / frame.width,
                (window.innerHeight - padding * 2) / frame.height,
                2
            );
            excalidrawAPI.updateScene({
                appState: {
                    scrollX: -(frame.x + frame.width / 2) + window.innerWidth / 2 / zoom,
                    scrollY: -(frame.y + frame.height / 2) + window.innerHeight / 2 / zoom,
                    zoom: { value: zoom },
                } as any,
            });
        }
    }, [excalidrawAPI]);

    // ─── Toggle toolbar ──────────────────────────────────────────────────────

    const toggleToolbar = useCallback(() => {
        setIsToolbarOpen(prev => !prev);
    }, []);

    return {
        // State
        frames,
        currentSlideIndex,
        viewMode,
        isAutoFraming,
        isGeneratingNotes,
        isToolbarOpen,

        // Frame CRUD
        addFrame,
        addFrameAtViewport,
        updateFrame,
        deleteFrame,
        reorderFrame,
        clearFrames,

        // AI features
        autoFrame,
        generateSpeakerNotes,

        // Navigation
        startPresenting,
        stopPresenting,
        nextSlide,
        prevSlide,
        goToSlide,
        zoomToFrame,

        // Slides
        getSlides,

        // UI
        toggleToolbar,
        setIsToolbarOpen,
    };
}

export type UsePresentationReturn = ReturnType<typeof usePresentation>;
