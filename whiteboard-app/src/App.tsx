import React, { useState, useCallback } from "react";
import { Excalidraw, MainMenu, WelcomeScreen } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import type { ExcalidrawElement } from "@excalidraw/excalidraw/types";
import type { AppState, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const App: React.FC = () => {
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
    const [theme, setTheme] = useState<"light" | "dark">("light");

    const handleChange = useCallback(
        (elements: readonly ExcalidrawElement[], appState: AppState) => {
            // Handle changes to elements if needed
            console.log("Elements changed:", elements.length);
        },
        []
    );

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
    };

    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <Excalidraw
                excalidrawAPI={(api) => setExcalidrawAPI(api)}
                onChange={handleChange}
                theme={theme}
                UIOptions={{
                    canvasActions: {
                        toggleTheme: true,
                        export: { saveFileToDisk: true },
                    },
                }}
            >
                <MainMenu>
                    <MainMenu.DefaultItems.LoadScene />
                    <MainMenu.DefaultItems.SaveToActiveFile />
                    <MainMenu.DefaultItems.Export />
                    <MainMenu.DefaultItems.SaveAsImage />
                    <MainMenu.Separator />
                    <MainMenu.DefaultItems.ClearCanvas />
                    <MainMenu.Separator />
                    <MainMenu.DefaultItems.ToggleTheme />
                    <MainMenu.DefaultItems.ChangeCanvasBackground />
                </MainMenu>
                <WelcomeScreen>
                    <WelcomeScreen.Hints.MenuHint />
                    <WelcomeScreen.Hints.ToolbarHint />
                    <WelcomeScreen.Hints.HelpHint />
                </WelcomeScreen>
            </Excalidraw>
        </div>
    );
};

export default App;
