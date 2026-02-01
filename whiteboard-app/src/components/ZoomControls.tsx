import React from "react";
import { useAtom } from "jotai";
import { zoomAtom } from "@whiteboard/whiteboard";

export const ZoomControls: React.FC = () => {
    const [zoom, setZoom] = useAtom(zoomAtom);

    const zoomIn = () => setZoom(Math.min(zoom * 1.2, 10));
    const zoomOut = () => setZoom(Math.max(zoom / 1.2, 0.1));
    const resetZoom = () => setZoom(1);

    return (
        <div className="zoom-controls">
            <button onClick={zoomOut} title="Zoom out (Ctrl + -)">
                −
            </button>
            <span onClick={resetZoom} style={{ cursor: "pointer" }} title="Reset zoom">
                {Math.round(zoom * 100)}%
            </span>
            <button onClick={zoomIn} title="Zoom in (Ctrl + +)">
                +
            </button>
        </div>
    );
};
