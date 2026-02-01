// Main Whiteboard Component
import React, { useRef, useEffect, useCallback, useState } from "react";
import { useAtom, useAtomValue, Provider, createStore } from "jotai";
import { renderScene } from "./renderer";
import {
    appStateAtom,
    elementsAtom,
    selectedElementIdsAtom,
    selectedToolAtom,
    type AppState,
} from "./state/atoms";
import { useElements, useHistory } from "./state/history";
import { createElement, measureText, type WhiteboardElement, type Point } from "@whiteboard/element";
import { SHORTCUTS, getFontString, getFontFamilyString, type Tool } from "@whiteboard/common";

// Props for the Whiteboard component
export interface WhiteboardProps {
    initialElements?: WhiteboardElement[];
    onChange?: (elements: WhiteboardElement[]) => void;
    viewBackgroundColor?: string;
    theme?: "light" | "dark";
    width?: number;
    height?: number;
}

// The main whiteboard store
export const whiteboardStore = createStore();

// Main Whiteboard Component - does NOT wrap in Provider, expects parent to provide it
export const Whiteboard: React.FC<WhiteboardProps> = ({
    initialElements = [],
    onChange,
    viewBackgroundColor = "#ffffff",
    theme = "light",
    width,
    height,
}) => {
    // Directly render WhiteboardCanvas - Provider should be provided by parent App
    return (
        <WhiteboardCanvas
            initialElements={initialElements}
            onChange={onChange}
            viewBackgroundColor={viewBackgroundColor}
            theme={theme}
            width={width}
            height={height}
        />
    );
};

// Internal canvas component
const WhiteboardCanvas: React.FC<WhiteboardProps> = ({
    initialElements = [],
    onChange,
    viewBackgroundColor = "#ffffff",
    theme = "light",
    width,
    height,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [appState, setAppState] = useAtom(appStateAtom);
    const [elements, setElements] = useAtom(elementsAtom);
    const [selectedIds, setSelectedIds] = useAtom(selectedElementIdsAtom);
    const [selectedTool, setSelectedTool] = useAtom(selectedToolAtom);
    const { pushHistory } = useHistory();

    const [canvasSize, setCanvasSize] = useState({ width: width || 800, height: height || 600 });
    const [currentElement, setCurrentElement] = useState<WhiteboardElement | null>(null);
    const [startPoint, setStartPoint] = useState<Point | null>(null);

    // Text editing state
    const [isEditingText, setIsEditingText] = useState(false);
    const [textInputPosition, setTextInputPosition] = useState<Point | null>(null);
    const [textInputValue, setTextInputValue] = useState("");
    const [editingTextElement, setEditingTextElement] = useState<WhiteboardElement | null>(null);
    const textInputRef = useRef<HTMLTextAreaElement>(null);
    const editingStartTimeRef = useRef<number>(0);
    const editingTextElementRef = useRef<WhiteboardElement | null>(null);

    // Resize state
    const [resizeHandle, setResizeHandle] = useState<string | null>(null);
    const [resizeStartElement, setResizeStartElement] = useState<WhiteboardElement | null>(null);
    const [cursor, setCursor] = useState("default");

    // Selection box state (for drag-to-select)
    const [selectionBox, setSelectionBox] = useState<{ x: number; y: number; width: number; height: number } | null>(null);

    // Ref to always get latest appState in callbacks
    const appStateRef = useRef(appState);
    useEffect(() => {
        appStateRef.current = appState;
    }, [appState]);

    // Focus text input when editing starts
    useEffect(() => {
        if (isEditingText && textInputRef.current) {
            console.log('useEffect: Focusing textarea');
            textInputRef.current.focus();
        }
    }, [isEditingText]);

    // Keep editingTextElementRef in sync with state to avoid stale closures
    useEffect(() => {
        editingTextElementRef.current = editingTextElement;
    }, [editingTextElement]);

    // Initialize elements
    useEffect(() => {
        if (initialElements.length > 0 && elements.length === 0) {
            setElements(initialElements);
        }
    }, [initialElements]);

    // Update app state from props
    useEffect(() => {
        setAppState((prev) => ({
            ...prev,
            viewBackgroundColor,
            theme,
        }));
    }, [viewBackgroundColor, theme]);

    // Handle resize
    useEffect(() => {
        const handleResize = () => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            setCanvasSize({
                width: width || rect.width || window.innerWidth,
                height: height || rect.height || window.innerHeight,
            });
        };

        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [width, height]);

    // Render scene
    useEffect(() => {
        if (!canvasRef.current) return;

        const elementsToRender = currentElement
            ? [...elements, currentElement]
            : elements;

        renderScene(canvasRef.current, elementsToRender, appState, selectedIds);
    }, [elements, appState, currentElement, selectedIds]);

    // Notify onChange
    useEffect(() => {
        onChange?.(elements);
    }, [elements, onChange]);

    // Get canvas coordinates from mouse event
    const getCanvasPoint = useCallback(
        (e: React.MouseEvent): Point => {
            const canvas = canvasRef.current;
            if (!canvas) return { x: 0, y: 0 };

            const rect = canvas.getBoundingClientRect();
            return {
                x: (e.clientX - rect.left) / appState.zoom - appState.scrollX,
                y: (e.clientY - rect.top) / appState.zoom - appState.scrollY,
            };
        },
        [appState.zoom, appState.scrollX, appState.scrollY]
    );

    // Get resize handle at point for a selected element
    const getResizeHandleAtPoint = useCallback(
        (point: Point, element: WhiteboardElement): string | null => {
            const handleSize = 12;
            const padding = 5;

            // Calculate element bounds
            let x: number, y: number, width: number, height: number;

            if (element.type === "line" || element.type === "arrow" || element.type === "freedraw") {
                const points = (element as any).points || [];
                if (points.length === 0) return null;

                const xs = points.map((p: Point) => element.x + p.x);
                const ys = points.map((p: Point) => element.y + p.y);
                x = Math.min(...xs) - padding;
                y = Math.min(...ys) - padding;
                width = Math.max(...xs) - Math.min(...xs) + padding * 2;
                height = Math.max(...ys) - Math.min(...ys) + padding * 2;
            } else {
                x = element.x - padding;
                y = element.y - padding;
                width = (element as any).width + padding * 2;
                height = (element as any).height + padding * 2;
            }

            // Define handle positions - corners and edges
            const handles: Record<string, { x: number; y: number }> = {
                nw: { x: x, y: y },
                n: { x: x + width / 2, y: y },
                ne: { x: x + width, y: y },
                e: { x: x + width, y: y + height / 2 },
                se: { x: x + width, y: y + height },
                s: { x: x + width / 2, y: y + height },
                sw: { x: x, y: y + height },
                w: { x: x, y: y + height / 2 },
            };

            // Check each handle
            for (const [key, pos] of Object.entries(handles)) {
                if (Math.abs(point.x - pos.x) <= handleSize / 2 &&
                    Math.abs(point.y - pos.y) <= handleSize / 2) {
                    return key;
                }
            }
            return null;
        },
        []
    );

    // Find element at point
    const getElementAtPoint = useCallback(
        (point: Point): WhiteboardElement | null => {
            // Iterate in reverse (top to bottom in z-order)
            for (let i = elements.length - 1; i >= 0; i--) {
                const element = elements[i];
                if (element.isDeleted) continue;

                // Get element bounds with some padding for easier selection
                const padding = 5;
                let bounds: { x: number; y: number; width: number; height: number };

                if (element.type === "line" || element.type === "arrow" || element.type === "freedraw") {
                    // For linear elements, calculate bounds from points
                    const points = (element as any).points || [];
                    if (points.length === 0) continue;

                    const xs = points.map((p: Point) => element.x + p.x);
                    const ys = points.map((p: Point) => element.y + p.y);
                    const minX = Math.min(...xs);
                    const maxX = Math.max(...xs);
                    const minY = Math.min(...ys);
                    const maxY = Math.max(...ys);

                    bounds = {
                        x: minX - padding,
                        y: minY - padding,
                        width: maxX - minX + padding * 2,
                        height: maxY - minY + padding * 2,
                    };
                } else {
                    bounds = {
                        x: element.x - padding,
                        y: element.y - padding,
                        width: (element as any).width + padding * 2,
                        height: (element as any).height + padding * 2,
                    };
                }

                // Check if point is inside bounds
                if (
                    point.x >= bounds.x &&
                    point.x <= bounds.x + bounds.width &&
                    point.y >= bounds.y &&
                    point.y <= bounds.y + bounds.height
                ) {
                    return element;
                }
            }
            return null;
        },
        [elements]
    );

    // Handle mouse down
    const handleMouseDown = useCallback(
        (e: React.MouseEvent) => {
            const point = getCanvasPoint(e);
            setStartPoint(point);

            if (selectedTool === "hand") {
                setAppState((prev) => ({ ...prev, isPanning: true }));
                return;
            }

            if (selectedTool === "selection") {
                // First check if clicking on a resize handle of a selected element
                for (const id of selectedIds) {
                    const selectedElement = elements.find(el => el.id === id);
                    if (selectedElement && !selectedElement.isDeleted) {
                        const handle = getResizeHandleAtPoint(point, selectedElement);
                        if (handle) {
                            // Start resizing
                            pushHistory();
                            setResizeHandle(handle);
                            setResizeStartElement({ ...selectedElement });
                            setAppState((prev: AppState) => ({ ...prev, isResizing: true }));
                            return;
                        }
                    }
                }

                // Try to find element under cursor
                const elementAtPoint = getElementAtPoint(point);
                console.log('SELECTION: elementAtPoint =', elementAtPoint?.type, elementAtPoint?.id);

                if (elementAtPoint) {
                    // If shift is held, add to selection; otherwise replace selection
                    if (e.shiftKey) {
                        setSelectedIds((prev: Set<string>) => {
                            const newSet = new Set(prev);
                            if (newSet.has(elementAtPoint.id)) {
                                newSet.delete(elementAtPoint.id);
                            } else {
                                newSet.add(elementAtPoint.id);
                            }
                            return newSet;
                        });
                    } else {
                        setSelectedIds(new Set([elementAtPoint.id]));
                    }

                    // Enable dragging
                    setAppState((prev: AppState) => ({ ...prev, isDragging: true }));
                } else {
                    // Clicked on empty space - start selection box
                    setSelectedIds(new Set());
                    setSelectionBox({ x: point.x, y: point.y, width: 0, height: 0 });
                }
                return;
            }

            // Handle text tool - show text input
            if (selectedTool === "text") {
                // Check if clicking on an existing text element - if so, edit it
                const existingTextElement = getElementAtPoint(point);
                if (existingTextElement && existingTextElement.type === "text" && !existingTextElement.isDeleted) {
                    console.log('TEXT TOOL: Clicked on existing text, editing', existingTextElement.id);
                    editingStartTimeRef.current = Date.now();
                    editingTextElementRef.current = existingTextElement;
                    setEditingTextElement(existingTextElement);
                    const textEl = existingTextElement as any;
                    setTextInputPosition({ x: existingTextElement.x, y: existingTextElement.y });
                    setTextInputValue(textEl.text || textEl.originalText || "");
                    setIsEditingText(true);
                    setSelectedIds(new Set([existingTextElement.id]));
                    return;
                }

                // Create new text
                console.log('TEXT TOOL: Click at', point, '(creating new text)');
                editingStartTimeRef.current = Date.now();
                editingTextElementRef.current = null;
                setEditingTextElement(null);
                setTextInputPosition(point);
                setTextInputValue("");
                setIsEditingText(true);
                return;
            }

            // Create new shape element
            if (["rectangle", "ellipse", "diamond", "line", "arrow", "freedraw"].includes(selectedTool)) {
                pushHistory();
                const currentAppState = appStateRef.current;
                const newElement = createElement(selectedTool as any, point.x, point.y, {
                    strokeColor: currentAppState.currentItemStrokeColor,
                    backgroundColor: currentAppState.currentItemBackgroundColor,
                    strokeWidth: currentAppState.currentItemStrokeWidth,
                    fillStyle: currentAppState.currentItemFillStyle,
                    roughness: currentAppState.currentItemRoughness,
                    opacity: currentAppState.currentItemOpacity,
                    roundness: currentAppState.currentItemRoundness > 0
                        ? { type: "adaptive_radius", value: currentAppState.currentItemRoundness }
                        : null,
                });
                setCurrentElement(newElement);
                setAppState((prev) => ({ ...prev, isDrawing: true }));
            }
        },
        [selectedTool, getCanvasPoint, pushHistory, getElementAtPoint]
    );

    // Handle mouse move
    const handleMouseMove = useCallback(
        (e: React.MouseEvent) => {
            const point = getCanvasPoint(e);

            // Update cursor position
            setAppState((prev) => ({
                ...prev,
                cursorX: point.x,
                cursorY: point.y,
            }));

            // Update cursor style
            if (selectedTool === "selection") {
                if (appState.isResizing) {
                    setCursor(resizeHandle ? `${resizeHandle}-resize` : "default");
                } else if (appState.isDragging) {
                    setCursor("grabbing");
                } else {
                    // Check for resize handles
                    let newCursor = "default";
                    let foundHandle = false;

                    for (const id of selectedIds) {
                        const element = elements.find(el => el.id === id);
                        if (element && !element.isDeleted) {
                            const handle = getResizeHandleAtPoint(point, element);
                            if (handle) {
                                newCursor = `${handle}-resize`;
                                foundHandle = true;
                                break;
                            }
                        }
                    }

                    if (!foundHandle) {
                        const element = getElementAtPoint(point);
                        if (element) {
                            newCursor = "move";
                        }
                    }
                    setCursor(newCursor);
                }
            } else if (selectedTool === "hand") {
                setCursor(appState.isPanning ? "grabbing" : "grab");
            } else if (selectedTool === "text") {
                setCursor("text");
            } else {
                setCursor("crosshair");
            }

            // Panning
            if (appState.isPanning && startPoint) {
                setAppState((prev: AppState) => ({
                    ...prev,
                    scrollX: prev.scrollX + e.movementX / appState.zoom,
                    scrollY: prev.scrollY + e.movementY / appState.zoom,
                }));
                return;
            }

            // Resizing selected element
            if (appState.isResizing && resizeHandle && resizeStartElement && startPoint) {
                const dx = point.x - startPoint.x;
                const dy = point.y - startPoint.y;

                // Calculate new dimensions based on which handle is being dragged
                let newX = resizeStartElement.x;
                let newY = resizeStartElement.y;
                let newWidth = (resizeStartElement as any).width || 0;
                let newHeight = (resizeStartElement as any).height || 0;

                switch (resizeHandle) {
                    case "se": // Southeast - resize right and down
                        newWidth = Math.max(10, newWidth + dx);
                        newHeight = Math.max(10, newHeight + dy);
                        break;
                    case "nw": // Northwest - resize left and up
                        newX = resizeStartElement.x + dx;
                        newY = resizeStartElement.y + dy;
                        newWidth = Math.max(10, newWidth - dx);
                        newHeight = Math.max(10, newHeight - dy);
                        break;
                    case "ne": // Northeast - resize right and up
                        newY = resizeStartElement.y + dy;
                        newWidth = Math.max(10, newWidth + dx);
                        newHeight = Math.max(10, newHeight - dy);
                        break;
                    case "sw": // Southwest - resize left and down
                        newX = resizeStartElement.x + dx;
                        newWidth = Math.max(10, newWidth - dx);
                        newHeight = Math.max(10, newHeight + dy);
                        break;
                    // Edge handles
                    case "n": // North - resize up
                        newY = resizeStartElement.y + dy;
                        newHeight = Math.max(10, newHeight - dy);
                        break;
                    case "s": // South - resize down
                        newHeight = Math.max(10, newHeight + dy);
                        break;
                    case "e": // East - resize right
                        newWidth = Math.max(10, newWidth + dx);
                        break;
                    case "w": // West - resize left
                        newX = resizeStartElement.x + dx;
                        newWidth = Math.max(10, newWidth - dx);
                        break;
                }

                // Shift key: maintain aspect ratio
                if (e.shiftKey) {
                    const originalWidth = (resizeStartElement as any).width || 1;
                    const originalHeight = (resizeStartElement as any).height || 1;
                    const aspectRatio = originalWidth / originalHeight;

                    if (["se", "nw", "ne", "sw"].includes(resizeHandle)) {
                        // For corner handles, maintain aspect ratio
                        if (Math.abs(newWidth / newHeight) > aspectRatio) {
                            newWidth = newHeight * aspectRatio;
                        } else {
                            newHeight = newWidth / aspectRatio;
                        }
                    }
                }

                // Alt key: resize from center
                if (e.altKey) {
                    const centerX = resizeStartElement.x + (resizeStartElement as any).width / 2;
                    const centerY = resizeStartElement.y + (resizeStartElement as any).height / 2;
                    newX = centerX - newWidth / 2;
                    newY = centerY - newHeight / 2;
                }

                // Update element
                setElements((prev: WhiteboardElement[]) =>
                    prev.map((el) => {
                        if (el.id !== resizeStartElement.id) return el;

                        // Special handling for text elements - scale fontSize proportionally
                        if (el.type === "text") {
                            const originalHeight = (resizeStartElement as any).height || 1;
                            const scale = newHeight / originalHeight;
                            const originalFontSize = (resizeStartElement as any).fontSize || 20;
                            const newFontSize = Math.max(8, Math.min(200, originalFontSize * scale));

                            return {
                                ...el,
                                x: newX,
                                y: newY,
                                width: newWidth,
                                height: newHeight,
                                fontSize: newFontSize,
                            } as WhiteboardElement;
                        }

                        return { ...el, x: newX, y: newY, width: newWidth, height: newHeight } as WhiteboardElement;
                    })
                );
                return;
            }

            // Dragging selected elements
            if (appState.isDragging && startPoint && selectedIds.size > 0) {
                const dx = point.x - startPoint.x;
                const dy = point.y - startPoint.y;

                // Update start point for continuous dragging
                setStartPoint(point);

                // Move all selected elements
                setElements((prev: WhiteboardElement[]) =>
                    prev.map((el) => {
                        if (selectedIds.has(el.id)) {
                            return {
                                ...el,
                                x: el.x + dx,
                                y: el.y + dy,
                            } as WhiteboardElement;
                        }
                        return el;
                    })
                );
                return;
            }

            // Update selection box
            if (selectionBox && startPoint) {
                const minX = Math.min(startPoint.x, point.x);
                const minY = Math.min(startPoint.y, point.y);
                const width = Math.abs(point.x - startPoint.x);
                const height = Math.abs(point.y - startPoint.y);
                setSelectionBox({ x: minX, y: minY, width, height });
                return;
            }

            // Drawing
            if (appState.isDrawing && currentElement && startPoint) {
                if (currentElement.type === "freedraw") {
                    // Add point to freedraw
                    const updatedElement = {
                        ...currentElement,
                        points: [
                            ...(currentElement as any).points,
                            { x: point.x - currentElement.x, y: point.y - currentElement.y },
                        ],
                    } as WhiteboardElement;
                    setCurrentElement(updatedElement);
                } else if (currentElement.type === "line" || currentElement.type === "arrow") {
                    // Update line endpoint
                    const updatedElement = {
                        ...currentElement,
                        points: [
                            { x: 0, y: 0 },
                            { x: point.x - startPoint.x, y: point.y - startPoint.y },
                        ],
                    } as WhiteboardElement;
                    setCurrentElement(updatedElement);
                } else {
                    // Update shape dimensions
                    const width = point.x - startPoint.x;
                    const height = point.y - startPoint.y;
                    const updatedElement = {
                        ...currentElement,
                        x: width >= 0 ? startPoint.x : point.x,
                        y: height >= 0 ? startPoint.y : point.y,
                        width: Math.abs(width),
                        height: Math.abs(height),
                    } as WhiteboardElement;
                    setCurrentElement(updatedElement);
                }
            }
        },
        [appState, currentElement, startPoint, getCanvasPoint, selectedIds]
    );

    // Handle mouse up
    const handleMouseUp = useCallback(() => {
        if (appState.isPanning) {
            setAppState((prev) => ({ ...prev, isPanning: false }));
        }

        if (appState.isDragging) {
            // Save history after dragging
            pushHistory();
            setAppState((prev) => ({ ...prev, isDragging: false }));
        }

        if (appState.isResizing) {
            pushHistory();
            setAppState((prev) => ({ ...prev, isResizing: false }));
            setResizeHandle(null);
            setResizeStartElement(null);
        }

        if (appState.isDrawing && currentElement) {
            // Add element to elements array
            setElements((prev) => [...prev, currentElement]);
            setCurrentElement(null);
            setAppState((prev) => ({ ...prev, isDrawing: false }));
        }

        // Finalize selection box - select all elements within
        if (selectionBox && selectionBox.width > 5 && selectionBox.height > 5) {
            const selectedInBox = elements.filter((el) => {
                if (el.isDeleted) return false;
                const elWidth = (el as any).width || 0;
                const elHeight = (el as any).height || 0;
                // Check if element intersects with selection box
                const elRight = el.x + elWidth;
                const elBottom = el.y + elHeight;
                const boxRight = selectionBox.x + selectionBox.width;
                const boxBottom = selectionBox.y + selectionBox.height;
                return !(el.x > boxRight || elRight < selectionBox.x ||
                    el.y > boxBottom || elBottom < selectionBox.y);
            });
            if (selectedInBox.length > 0) {
                setSelectedIds(new Set(selectedInBox.map((el) => el.id)));
            }
        }
        setSelectionBox(null);

        setStartPoint(null);
    }, [appState, currentElement, pushHistory, selectionBox, elements, setSelectedIds]);

    // Handle wheel for zoom
    const handleWheel = useCallback(
        (e: React.WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                setAppState((prev) => ({
                    ...prev,
                    zoom: Math.min(Math.max(prev.zoom * delta, 0.1), 10),
                }));
            } else {
                // Scroll
                setAppState((prev) => ({
                    ...prev,
                    scrollX: prev.scrollX - e.deltaX / appState.zoom,
                    scrollY: prev.scrollY - e.deltaY / appState.zoom,
                }));
            }
        },
        [appState.zoom]
    );

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Tool shortcuts
            if (!e.ctrlKey && !e.metaKey && !e.altKey) {
                switch (e.key) {
                    case "1":
                        setSelectedTool("selection");
                        break;
                    case "2":
                        setSelectedTool("rectangle");
                        break;
                    case "3":
                        setSelectedTool("ellipse");
                        break;
                    case "4":
                        setSelectedTool("diamond");
                        break;
                    case "5":
                        setSelectedTool("arrow");
                        break;
                    case "6":
                        setSelectedTool("line");
                        break;
                    case "7":
                        setSelectedTool("freedraw");
                        break;
                    case "8":
                        setSelectedTool("text");
                        break;
                    case "h":
                    case "H":
                        setSelectedTool("hand");
                        break;
                    case "Escape":
                        setSelectedIds(new Set());
                        setCurrentElement(null);
                        // Close text input if open
                        if (isEditingText) {
                            setIsEditingText(false);
                            setTextInputValue("");
                        }
                        break;
                    case "Delete":
                    case "Backspace":
                        // Delete selected elements
                        if (selectedIds.size > 0 && !isEditingText) {
                            e.preventDefault();
                            pushHistory();
                            setElements((prev) =>
                                prev.map((el) =>
                                    selectedIds.has(el.id) ? { ...el, isDeleted: true } : el
                                )
                            );
                            setSelectedIds(new Set());
                        }
                        break;
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isEditingText, selectedIds, pushHistory]);

    // Handle text input submission
    const handleTextSubmit = useCallback(() => {
        const elapsedMs = Date.now() - editingStartTimeRef.current;
        console.log('TEXT SUBMIT: textInputValue =', textInputValue, 'elapsed =', elapsedMs + 'ms', 'editingTextElement =', editingTextElement?.id);

        // Ignore blur if it happens too quickly (prevents immediate blur on creation)
        if (elapsedMs < 200) {
            console.log('TEXT SUBMIT: Ignoring early blur');
            return;
        }

        // Only submit if there's actual text content
        if (textInputValue.trim() && textInputPosition) {
            pushHistory();

            const fontString = getFontString({
                fontSize: appState.currentItemFontSize,
                fontFamily: appState.currentItemFontFamily,
            });

            const { width, height } = measureText(
                textInputValue,
                fontString,
                1.25 // Default line height
            );

            // Use ref to get latest value (avoids stale closure in onBlur)
            const currentEditingElement = editingTextElementRef.current;
            console.log('TEXT SUBMIT: currentEditingElement =', currentEditingElement?.id);

            if (currentEditingElement) {
                // Update existing text element
                setElements((prev) =>
                    prev.map((el) =>
                        el.id === currentEditingElement.id
                            ? {
                                ...el,
                                text: textInputValue,
                                originalText: textInputValue,
                                width,
                                height,
                            } as WhiteboardElement
                            : el
                    )
                );
            } else {
                // Create new text element
                const textElement = createElement("text", textInputPosition.x, textInputPosition.y, {
                    text: textInputValue,
                    fontSize: appState.currentItemFontSize,
                    fontFamily: appState.currentItemFontFamily as 1 | 2 | 3,
                    textAlign: appState.currentItemTextAlign as "left" | "center" | "right",
                    strokeColor: appState.currentItemStrokeColor,
                    width,
                    height,
                    originalText: textInputValue,
                    lineHeight: 1.25,
                });

                console.log('TEXT SUBMIT: Creating text element:', textElement);
                setElements((prev) => [...prev, textElement]);
            }
        }

        setIsEditingText(false);
        setTextInputValue("");
        setTextInputPosition(null);
        setEditingTextElement(null);
    }, [textInputValue, textInputPosition, appState, pushHistory, setElements, editingTextElement]);

    // Handle text input key events
    const handleTextKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            setIsEditingText(false);
            setTextInputValue("");
            setTextInputPosition(null);
            setEditingTextElement(null);
        } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleTextSubmit();
        }
    }, [handleTextSubmit]);

    // Handle double-click to edit text elements
    const handleDoubleClick = useCallback(
        (e: React.MouseEvent) => {
            const point = getCanvasPoint(e);
            const elementAtPoint = getElementAtPoint(point);
            console.log('DOUBLE CLICK: elementAtPoint =', elementAtPoint);

            if (elementAtPoint && elementAtPoint.type === "text" && !elementAtPoint.isDeleted) {
                console.log('DOUBLE CLICK: Editing text element', elementAtPoint.id);
                // Edit existing text element
                editingStartTimeRef.current = Date.now();
                const textEl = elementAtPoint as any;
                setEditingTextElement(elementAtPoint);
                editingTextElementRef.current = elementAtPoint; // Set ref immediately
                setTextInputPosition({ x: elementAtPoint.x, y: elementAtPoint.y });
                setTextInputValue(textEl.text || textEl.originalText || "");
                setIsEditingText(true);
                setSelectedIds(new Set([elementAtPoint.id]));
                setTimeout(() => textInputRef.current?.focus(), 0);
            }
        },
        [getCanvasPoint, getElementAtPoint, setSelectedIds]
    );

    return (
        <div
            ref={containerRef}
            className="whiteboard-container"
            style={{
                width: width || "100%",
                height: height || "100%",
                overflow: "hidden",
                cursor: cursor,
            }}
        >
            <canvas
                ref={canvasRef}
                width={canvasSize.width}
                height={canvasSize.height}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onWheel={handleWheel}
                style={{
                    display: "block",
                    touchAction: "none",
                }}
            />

            {/* Selection Box Overlay */}
            {selectionBox && selectionBox.width > 0 && selectionBox.height > 0 && (
                <div
                    className="selection-box"
                    style={{
                        position: "absolute",
                        left: (selectionBox.x + appState.scrollX) * appState.zoom,
                        top: (selectionBox.y + appState.scrollY) * appState.zoom,
                        width: selectionBox.width * appState.zoom,
                        height: selectionBox.height * appState.zoom,
                        border: "1px dashed #6965db",
                        backgroundColor: "rgba(105, 101, 219, 0.1)",
                        pointerEvents: "none",
                        zIndex: 500,
                    }}
                />
            )}

            {/* Text Input Overlay - WYSIWYG Style like Excalidraw */}
            {isEditingText && textInputPosition && (() => {
                const currentFontString = getFontString({
                    fontSize: appState.currentItemFontSize,
                    fontFamily: appState.currentItemFontFamily,
                });
                const { width, height } = measureText(textInputValue, currentFontString, 1.25);
                console.log("📏 Measured dimensions:", { width, height, text: textInputValue });

                return (
                    <textarea
                        ref={textInputRef}
                        value={textInputValue}
                        onChange={(e) => {
                            console.log("📝 Typing:", e.target.value);
                            setTextInputValue(e.target.value);
                        }}
                        onKeyDown={handleTextKeyDown}
                        onBlur={handleTextSubmit}
                        style={{
                            position: "absolute",
                            // Position in screen space - zoom is handled by transform:scale
                            left: (textInputPosition.x + appState.scrollX) * appState.zoom,
                            top: (textInputPosition.y + appState.scrollY) * appState.zoom,
                            minWidth: "1em",
                            minHeight: "1em",
                            margin: 0,
                            padding: 0,
                            border: 0,
                            outline: 0,
                            resize: "none",
                            background: "transparent",
                            overflow: "hidden",
                            whiteSpace: "pre",
                            wordBreak: "normal",
                            fontSize: `${appState.currentItemFontSize}px`,
                            fontFamily: getFontFamilyString({ fontFamily: appState.currentItemFontFamily }),
                            lineHeight: "1.25",
                            color: appState.currentItemStrokeColor,
                            transformOrigin: "0 0",
                            transform: `scale(${appState.zoom})`,
                            zIndex: 1000,
                            caretColor: appState.currentItemStrokeColor,
                            width: `${width + 10}px`,
                            height: `${height + 10}px`,
                        }}
                        autoFocus
                        wrap="off"
                    />
                );
            })()}
        </div>
    );
};

// Re-export components and utilities
export { renderScene } from "./renderer";
export * from "./state";
export { createElement } from "@whiteboard/element";
export type { WhiteboardElement, Point } from "@whiteboard/element";
