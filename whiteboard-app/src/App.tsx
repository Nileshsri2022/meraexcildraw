import React, { useState, useCallback } from "react";
import {
    Excalidraw,
    MainMenu,
    WelcomeScreen,
    Footer,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const App: React.FC = () => {
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <Excalidraw
                excalidrawAPI={(api) => setExcalidrawAPI(api)}
                UIOptions={{
                    canvasActions: {
                        toggleTheme: true,
                        export: { saveFileToDisk: true },
                        loadScene: true,
                        saveToActiveFile: true,
                    },
                }}
            >
                {/* Custom Main Menu */}
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
                    <MainMenu.Separator />
                    {/* Custom menu items */}
                    <MainMenu.Item
                        onSelect={() => {
                            window.open("https://docs.excalidraw.com/", "_blank");
                        }}
                    >
                        📖 Documentation
                    </MainMenu.Item>
                    <MainMenu.Item
                        onSelect={() => {
                            if (excalidrawAPI) {
                                excalidrawAPI.resetScene();
                            }
                        }}
                    >
                        🔄 Reset Canvas
                    </MainMenu.Item>
                </MainMenu>

                {/* Welcome Screen */}
                <WelcomeScreen>
                    <WelcomeScreen.Center>
                        <WelcomeScreen.Center.Logo>
                            <div style={{ fontSize: "48px" }}>✏️</div>
                        </WelcomeScreen.Center.Logo>
                        <WelcomeScreen.Center.Heading>
                            Welcome to My Whiteboard
                        </WelcomeScreen.Center.Heading>
                    </WelcomeScreen.Center>
                    <WelcomeScreen.Hints.MenuHint />
                    <WelcomeScreen.Hints.ToolbarHint />
                    <WelcomeScreen.Hints.HelpHint />
                </WelcomeScreen>

                {/* Footer */}
                <Footer>
                    <span style={{ fontSize: "12px", opacity: 0.7 }}>
                        Powered by Excalidraw
                    </span>
                </Footer>
            </Excalidraw>
        </div>
    );
};

export default App;
