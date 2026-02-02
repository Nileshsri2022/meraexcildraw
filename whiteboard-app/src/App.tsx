import React, { useState, useCallback } from "react";
import {
    Excalidraw,
    MainMenu,
    WelcomeScreen,
    Footer,
    LiveCollaborationTrigger,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCollaboration } from "./collab";

const App: React.FC = () => {
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);

    const {
        isCollaborating,
        roomId,
        username,
        startCollaboration,
        stopCollaboration,
        onPointerUpdate,
        onSceneChange,
    } = useCollaboration({ excalidrawAPI });

    // Toggle collaboration
    const toggleCollaboration = useCallback(() => {
        if (isCollaborating) {
            stopCollaboration();
        } else {
            // Use existing room from URL, or generate new one
            startCollaboration();
        }
    }, [isCollaborating, startCollaboration, stopCollaboration]);

    // Handle scene changes
    const handleChange = useCallback(
        (elements: readonly OrderedExcalidrawElement[]) => {
            onSceneChange(elements);
        },
        [onSceneChange]
    );

    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <Excalidraw
                excalidrawAPI={(api) => setExcalidrawAPI(api)}
                isCollaborating={isCollaborating}
                onPointerUpdate={onPointerUpdate}
                onChange={handleChange}
                UIOptions={{
                    canvasActions: {
                        toggleTheme: true,
                        export: { saveFileToDisk: true },
                        loadScene: true,
                        saveToActiveFile: true,
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
                    <MainMenu.Separator />
                    <MainMenu.Item onSelect={toggleCollaboration}>
                        {isCollaborating ? "🔴 Stop Collaboration" : "🟢 Start Collaboration"}
                    </MainMenu.Item>
                    {isCollaborating && roomId && (
                        <MainMenu.Item
                            onSelect={() => {
                                navigator.clipboard.writeText(window.location.href);
                                alert("Link copied to clipboard!");
                            }}
                        >
                            📋 Copy Room Link
                        </MainMenu.Item>
                    )}
                </MainMenu>

                <LiveCollaborationTrigger
                    isCollaborating={isCollaborating}
                    onSelect={toggleCollaboration}
                />

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

                <Footer>
                    <span style={{ fontSize: "12px", opacity: 0.7 }}>
                        {isCollaborating ? (
                            <>🟢 {username} in room: {roomId}</>
                        ) : (
                            "Powered by Excalidraw"
                        )}
                    </span>
                </Footer>
            </Excalidraw>
        </div>
    );
};

export default App;
