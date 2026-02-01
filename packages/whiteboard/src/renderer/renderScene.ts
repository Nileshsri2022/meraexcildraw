// Canvas renderer for drawing elements
import type { WhiteboardElement, RectangleElement, EllipseElement, DiamondElement, LinearElement, TextElement, FreedrawElement } from "@whiteboard/element";
import type { AppState } from "../state/atoms";
import { getFontFamilyString } from "@whiteboard/common";
import rough from "roughjs";

// Render the entire scene
export const renderScene = (
    canvas: HTMLCanvasElement,
    elements: readonly WhiteboardElement[],
    appState: AppState,
    selectedElementIds?: Set<string>
) => {
    const context = canvas.getContext("2d");
    if (!context) return;

    const rc = rough.canvas(canvas);

    // Clear canvas
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Save state
    context.save();

    // Apply zoom and scroll transformations
    context.scale(appState.zoom, appState.zoom);
    context.translate(appState.scrollX, appState.scrollY);

    // Draw background
    context.fillStyle = appState.viewBackgroundColor;
    context.fillRect(
        -appState.scrollX,
        -appState.scrollY,
        canvas.width / appState.zoom,
        canvas.height / appState.zoom
    );

    // Draw grid if enabled
    if (appState.showGrid && appState.gridSize) {
        drawGrid(context, appState);
    }

    // Render each element
    for (const element of elements) {
        if (element.isDeleted) continue;
        renderElement(context, rc, element);

        // Draw selection box if element is selected
        if (selectedElementIds?.has(element.id)) {
            renderSelectionBox(context, element);
        }
    }

    // Restore state
    context.restore();
};

// Render selection box around element
const renderSelectionBox = (
    context: CanvasRenderingContext2D,
    element: WhiteboardElement
) => {
    const padding = 5;
    let x: number, y: number, width: number, height: number;

    if (element.type === "line" || element.type === "arrow" || element.type === "freedraw") {
        const points = (element as any).points || [];
        if (points.length === 0) return;

        const xs = points.map((p: { x: number; y: number }) => element.x + p.x);
        const ys = points.map((p: { x: number; y: number }) => element.y + p.y);
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

    // Draw dashed selection border
    context.save();
    context.strokeStyle = "#6965db";
    context.lineWidth = 2;
    context.setLineDash([5, 5]);
    context.strokeRect(x, y, width, height);

    // Draw corner handles
    const handleSize = 8;
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#6965db";
    context.setLineDash([]);
    context.lineWidth = 1;

    // Corner handles
    const handles = [
        // Corners
        { x: x, y: y },
        { x: x + width, y: y },
        { x: x, y: y + height },
        { x: x + width, y: y + height },
        // Edge midpoints
        { x: x + width / 2, y: y },               // North
        { x: x + width, y: y + height / 2 },      // East
        { x: x + width / 2, y: y + height },      // South
        { x: x, y: y + height / 2 },              // West
    ];

    handles.forEach(handle => {
        context.fillRect(
            handle.x - handleSize / 2,
            handle.y - handleSize / 2,
            handleSize,
            handleSize
        );
        context.strokeRect(
            handle.x - handleSize / 2,
            handle.y - handleSize / 2,
            handleSize,
            handleSize
        );
    });

    context.restore();
};

// Draw grid
const drawGrid = (context: CanvasRenderingContext2D, appState: AppState) => {
    if (!appState.gridSize) return;

    const gridSize = appState.gridSize;
    const width = context.canvas.width / appState.zoom;
    const height = context.canvas.height / appState.zoom;

    context.strokeStyle = appState.theme === "dark" ? "#333333" : "#e0e0e0";
    context.lineWidth = 1 / appState.zoom;

    const startX = Math.floor(-appState.scrollX / gridSize) * gridSize;
    const startY = Math.floor(-appState.scrollY / gridSize) * gridSize;
    const endX = startX + width + gridSize;
    const endY = startY + height + gridSize;

    context.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
        context.moveTo(x, startY);
        context.lineTo(x, endY);
    }
    for (let y = startY; y <= endY; y += gridSize) {
        context.moveTo(startX, y);
        context.lineTo(endX, y);
    }
    context.stroke();
};

// Render a single element
const renderElement = (
    context: CanvasRenderingContext2D,
    rc: ReturnType<typeof rough.canvas>,
    element: WhiteboardElement
) => {
    context.save();

    // Apply element opacity
    context.globalAlpha = element.opacity / 100;

    // Apply rotation
    if (element.angle !== 0) {
        const cx = element.x + element.width / 2;
        const cy = element.y + element.height / 2;
        context.translate(cx, cy);
        context.rotate(element.angle);
        context.translate(-cx, -cy);
    }

    // Render based on element type
    switch (element.type) {
        case "rectangle":
            renderRectangle(context, rc, element);
            break;
        case "ellipse":
            renderEllipse(context, rc, element);
            break;
        case "diamond":
            renderDiamond(context, rc, element);
            break;
        case "line":
        case "arrow":
            renderLinear(context, rc, element);
            break;
        case "text":
            renderText(context, element);
            break;
        case "freedraw":
            renderFreedraw(context, element);
            break;
    }

    context.restore();
};

// Render rectangle
const renderRectangle = (
    context: CanvasRenderingContext2D,
    rc: ReturnType<typeof rough.canvas>,
    element: RectangleElement
) => {
    const options = getRoughOptions(element);
    const { x, y, width, height, roundness } = element;

    // Calculate corner radius
    const radius = roundness?.value
        ? Math.min(roundness.value, Math.min(Math.abs(width), Math.abs(height)) / 2)
        : 0;

    if (radius > 0) {
        // Draw rounded rectangle using a path
        const path = `
            M ${x + radius} ${y}
            L ${x + width - radius} ${y}
            Q ${x + width} ${y} ${x + width} ${y + radius}
            L ${x + width} ${y + height - radius}
            Q ${x + width} ${y + height} ${x + width - radius} ${y + height}
            L ${x + radius} ${y + height}
            Q ${x} ${y + height} ${x} ${y + height - radius}
            L ${x} ${y + radius}
            Q ${x} ${y} ${x + radius} ${y}
            Z
        `;

        if (element.backgroundColor !== "transparent") {
            rc.path(path, {
                ...options,
                fill: element.backgroundColor,
            });
        } else {
            rc.path(path, options);
        }
    } else {
        // Sharp corners - use standard rectangle
        if (element.backgroundColor !== "transparent") {
            rc.rectangle(x, y, width, height, {
                ...options,
                fill: element.backgroundColor,
            });
        } else {
            rc.rectangle(x, y, width, height, options);
        }
    }
};

// Render ellipse
const renderEllipse = (
    context: CanvasRenderingContext2D,
    rc: ReturnType<typeof rough.canvas>,
    element: EllipseElement
) => {
    const options = getRoughOptions(element);
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;

    if (element.backgroundColor !== "transparent") {
        rc.ellipse(cx, cy, element.width, element.height, {
            ...options,
            fill: element.backgroundColor,
        });
    } else {
        rc.ellipse(cx, cy, element.width, element.height, options);
    }
};

// Render diamond
const renderDiamond = (
    context: CanvasRenderingContext2D,
    rc: ReturnType<typeof rough.canvas>,
    element: DiamondElement
) => {
    const options = getRoughOptions(element);
    const topX = element.x + element.width / 2;
    const topY = element.y;
    const rightX = element.x + element.width;
    const rightY = element.y + element.height / 2;
    const bottomX = element.x + element.width / 2;
    const bottomY = element.y + element.height;
    const leftX = element.x;
    const leftY = element.y + element.height / 2;

    rc.polygon(
        [
            [topX, topY],
            [rightX, rightY],
            [bottomX, bottomY],
            [leftX, leftY],
        ],
        {
            ...options,
            fill: element.backgroundColor !== "transparent" ? element.backgroundColor : undefined,
        }
    );
};

// Render line/arrow
const renderLinear = (
    context: CanvasRenderingContext2D,
    rc: ReturnType<typeof rough.canvas>,
    element: LinearElement
) => {
    const options = getRoughOptions(element);

    if (element.points.length < 2) return;

    const absolutePoints = element.points.map((p) => [
        element.x + p.x,
        element.y + p.y,
    ] as [number, number]);

    rc.linearPath(absolutePoints, options);

    // Draw arrowhead if arrow type
    if (element.type === "arrow" && element.endArrowhead && element.points.length >= 2) {
        const lastPoint = absolutePoints[absolutePoints.length - 1];
        const secondLastPoint = absolutePoints[absolutePoints.length - 2];
        drawArrowhead(context, secondLastPoint, lastPoint, element.strokeColor);
    }
};

// Draw arrowhead
const drawArrowhead = (
    context: CanvasRenderingContext2D,
    from: [number, number],
    to: [number, number],
    color: string
) => {
    const headLength = 15;
    const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);

    context.save();
    context.strokeStyle = color;
    context.fillStyle = color;
    context.lineWidth = 2;

    context.beginPath();
    context.moveTo(to[0], to[1]);
    context.lineTo(
        to[0] - headLength * Math.cos(angle - Math.PI / 6),
        to[1] - headLength * Math.sin(angle - Math.PI / 6)
    );
    context.lineTo(
        to[0] - headLength * Math.cos(angle + Math.PI / 6),
        to[1] - headLength * Math.sin(angle + Math.PI / 6)
    );
    context.closePath();
    context.fill();
    context.restore();
};

// Render text
const renderText = (
    context: CanvasRenderingContext2D,
    element: TextElement
) => {
    console.log('RENDER TEXT:', element.text, 'at x:', element.x, 'y:', element.y, 'w:', element.width, 'h:', element.height, 'fontSize:', element.fontSize);
    const fontFamily = getFontFamilyString({ fontFamily: element.fontFamily });
    context.font = `${element.fontSize}px ${fontFamily}`;
    context.fillStyle = element.strokeColor;
    context.textAlign = element.textAlign;
    context.textBaseline = "top";

    const lines = element.text.split("\n");
    lines.forEach((line, index) => {
        const y = element.y + index * element.fontSize * element.lineHeight;
        context.fillText(line, element.x, y);
    });
};

// Render freedraw
const renderFreedraw = (
    context: CanvasRenderingContext2D,
    element: FreedrawElement
) => {
    if (element.points.length === 0) return;

    context.save();
    context.strokeStyle = element.strokeColor;
    context.lineWidth = element.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    context.beginPath();
    context.moveTo(element.x + element.points[0].x, element.y + element.points[0].y);

    for (let i = 1; i < element.points.length; i++) {
        context.lineTo(element.x + element.points[i].x, element.y + element.points[i].y);
    }

    context.stroke();
    context.restore();
};

// Get rough.js options from element
const getRoughOptions = (element: WhiteboardElement) => {
    return {
        stroke: element.strokeColor,
        strokeWidth: element.strokeWidth,
        roughness: element.roughness,
        seed: element.seed,
        fillStyle: element.fillStyle === "none" ? undefined : element.fillStyle,
        strokeLineDash: element.strokeStyle === "dashed" ? [8, 8] : element.strokeStyle === "dotted" ? [2, 4] : undefined,
    };
};

export { renderElement };
