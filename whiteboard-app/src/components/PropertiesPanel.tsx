// Properties Panel Component
import React from "react";
import { useAtom, useAtomValue } from "jotai";
import {
    appStateAtom,
    selectedElementIdsAtom,
    elementsAtom,
} from "@whiteboard/whiteboard";
import { COLORS } from "@whiteboard/common";

export const PropertiesPanel: React.FC = () => {
    const [appState, setAppState] = useAtom(appStateAtom);
    const [elements, setElements] = useAtom(elementsAtom);
    const selectedIds = useAtomValue(selectedElementIdsAtom);

    const hasSelection = selectedIds.size > 0;

    // Get first selected element for displaying current values
    const selectedElement = hasSelection
        ? elements.find((el) => selectedIds.has(el.id) && !el.isDeleted)
        : null;

    // Update current item properties (for new elements)
    const updateCurrentItem = (updates: Partial<typeof appState>) => {
        setAppState((prev) => ({ ...prev, ...updates }));
    };

    // Update selected elements
    const updateSelectedElements = (updates: Record<string, any>) => {
        if (!hasSelection) return;
        setElements((prev) =>
            prev.map((el) =>
                selectedIds.has(el.id) ? { ...el, ...updates } : el
            )
        );
    };

    // Handle stroke color change
    const handleStrokeColor = (color: string) => {
        updateCurrentItem({ currentItemStrokeColor: color });
        updateSelectedElements({ strokeColor: color });
    };

    // Handle background color change
    const handleBackgroundColor = (color: string) => {
        updateCurrentItem({ currentItemBackgroundColor: color });
        updateSelectedElements({ backgroundColor: color });
    };

    // Handle stroke width change
    const handleStrokeWidth = (width: number) => {
        updateCurrentItem({ currentItemStrokeWidth: width });
        updateSelectedElements({ strokeWidth: width });
    };

    // Handle opacity change
    const handleOpacity = (opacity: number) => {
        updateSelectedElements({ opacity: opacity / 100 });
    };

    return (
        <div className="properties-panel">
            <h3>Properties</h3>

            {/* Stroke Color */}
            <div className="property-group">
                <label>Stroke</label>
                <div className="color-picker">
                    {COLORS.elementStroke.map((color: string) => (
                        <button
                            key={color}
                            className={`color-swatch ${appState.currentItemStrokeColor === color ? "active" : ""
                                }`}
                            style={{ backgroundColor: color }}
                            onClick={() => handleStrokeColor(color)}
                            title={color}
                        />
                    ))}
                </div>
            </div>

            {/* Background Color */}
            <div className="property-group">
                <label>Background</label>
                <div className="color-picker">
                    <button
                        className={`color-swatch transparent ${appState.currentItemBackgroundColor === "transparent" ? "active" : ""
                            }`}
                        onClick={() => handleBackgroundColor("transparent")}
                        title="Transparent"
                    />
                    {COLORS.elementBackground.map((color: string) => (
                        <button
                            key={color}
                            className={`color-swatch ${appState.currentItemBackgroundColor === color ? "active" : ""
                                }`}
                            style={{ backgroundColor: color }}
                            onClick={() => handleBackgroundColor(color)}
                            title={color}
                        />
                    ))}
                </div>
            </div>

            {/* Stroke Width */}
            <div className="property-group">
                <label>Stroke Width: {appState.currentItemStrokeWidth || 1}</label>
                <input
                    type="range"
                    min="1"
                    max="16"
                    value={appState.currentItemStrokeWidth || 1}
                    onChange={(e) => handleStrokeWidth(Number(e.target.value))}
                    className="slider"
                />
            </div>

            {/* Roundness / Corner Radius */}
            <div className="property-group">
                <label>Roundness: {appState.currentItemRoundness || 0}</label>
                <input
                    type="range"
                    min="0"
                    max="32"
                    value={appState.currentItemRoundness || 0}
                    onChange={(e) => {
                        const value = Number(e.target.value);
                        setAppState((prev) => ({ ...prev, currentItemRoundness: value }));
                        if (hasSelection) {
                            updateSelectedElements({
                                roundness: value > 0
                                    ? { type: "adaptive_radius", value }
                                    : null
                            });
                        }
                    }}
                    className="slider"
                />
            </div>

            {/* Opacity (only when selection) */}
            {hasSelection && selectedElement && (
                <div className="property-group">
                    <label>Opacity: {Math.round((selectedElement.opacity || 1) * 100)}%</label>
                    <input
                        type="range"
                        min="10"
                        max="100"
                        value={(selectedElement.opacity || 1) * 100}
                        onChange={(e) => handleOpacity(Number(e.target.value))}
                        className="slider"
                    />
                </div>
            )}

            {/* Fill Style (for shapes) */}
            <div className="property-group">
                <label>Fill Style</label>
                <div className="button-group">
                    {["solid", "hachure", "cross-hatch", "none"].map((style) => (
                        <button
                            key={style}
                            className={`style-btn ${appState.currentItemFillStyle === style ? "active" : ""
                                }`}
                            onClick={() => {
                                setAppState((prev) => ({
                                    ...prev,
                                    currentItemFillStyle: style as any,
                                }));
                                if (hasSelection) {
                                    updateSelectedElements({ fillStyle: style });
                                }
                            }}
                        >
                            {style}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PropertiesPanel;
