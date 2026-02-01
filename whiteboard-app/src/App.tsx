import React, { useState, useCallback } from "react";
import { Whiteboard, whiteboardStore, selectedToolAtom, appStateAtom, zoomAtom, useHistory } from "@whiteboard/whiteboard";
import { useAtom, Provider } from "jotai";
import { COLORS, type Tool } from "@whiteboard/common";
import type { WhiteboardElement } from "@whiteboard/element";
import { Toolbar } from "./components/Toolbar";
import { ZoomControls } from "./components/ZoomControls";
import { PropertiesPanel } from "./components/PropertiesPanel";

const App: React.FC = () => {
    const [theme, setTheme] = useState<"light" | "dark">("light");
    const [elements, setElements] = useState<WhiteboardElement[]>([]);

    const handleChange = useCallback((newElements: WhiteboardElement[]) => {
        setElements(newElements);
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        document.body.classList.toggle("dark", newTheme === "dark");
    };

    return (
        <Provider store={whiteboardStore}>
            <div className="app">
                {/* Main Toolbar */}
                <Toolbar />

                {/* Theme Toggle */}
                <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
                    {theme === "light" ? "🌙" : "☀️"}
                </button>

                {/* Main Canvas */}
                <Whiteboard
                    onChange={handleChange}
                    viewBackgroundColor={theme === "light" ? "#f8f9fa" : "#1a1a2e"}
                    theme={theme}
                />

                {/* Properties Panel */}
                <PropertiesPanel />

                {/* Status Bar */}
                <div className="status-bar">
                    {elements.filter((e) => !e.isDeleted).length} elements
                </div>

                {/* Zoom Controls */}
                <ZoomControls />
            </div>
        </Provider>
    );
};

export default App;
