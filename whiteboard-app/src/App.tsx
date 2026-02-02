import React, { useState, useCallback, useRef, useEffect } from "react";
import {
    Excalidraw,
    MainMenu,
    WelcomeScreen,
    Footer,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCollaboration } from "./collab";
import { AIToolsDialog } from "./components/AIToolsDialog";

const App: React.FC = () => {
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
    const [isAIToolsOpen, setIsAIToolsOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const {
        isCollaborating,
        roomId,
        username,
        startCollaboration,
        stopCollaboration,
        onPointerUpdate,
        onSceneChange,
    } = useCollaboration({ excalidrawAPI });

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Toggle collaboration
    const toggleCollaboration = useCallback(() => {
        if (isCollaborating) {
            stopCollaboration();
        } else {
            startCollaboration();
        }
        setIsDropdownOpen(false);
    }, [isCollaborating, startCollaboration, stopCollaboration]);

    // Handle scene changes
    const handleChange = useCallback(
        (elements: readonly OrderedExcalidrawElement[]) => {
            onSceneChange(elements);
        },
        [onSceneChange]
    );

    // Render custom dropdown in top right area
    const renderTopRightUI = () => (
        <div ref={dropdownRef} style={{ position: "relative" }}>
            {/* Main Button */}
            <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                title="More Options"
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "8px",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor: isDropdownOpen ? "rgba(99, 102, 241, 0.1)" : "transparent",
                    color: "var(--text-primary-color)",
                    cursor: "pointer",
                    fontSize: "18px",
                    transition: "all 0.2s ease",
                    width: "36px",
                    height: "36px",
                }}
                onMouseEnter={(e) => {
                    if (!isDropdownOpen) {
                        e.currentTarget.style.backgroundColor = "rgba(99, 102, 241, 0.1)";
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isDropdownOpen) {
                        e.currentTarget.style.backgroundColor = "transparent";
                    }
                }}
            >
                ✨
            </button>

            {/* Dropdown Menu - Excalidraw Style */}
            {isDropdownOpen && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        backgroundColor: "#232329",
                        borderRadius: "12px",
                        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08)",
                        minWidth: "220px",
                        zIndex: 9999,
                        overflow: "hidden",
                        padding: "8px 0",
                    }}
                >
                    {/* AI Tools Option */}
                    <button
                        onClick={() => {
                            setIsAIToolsOpen(true);
                            setIsDropdownOpen(false);
                        }}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            width: "100%",
                            padding: "10px 16px",
                            border: "none",
                            backgroundColor: "transparent",
                            color: "#e4e4e7",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontFamily: "inherit",
                            textAlign: "left",
                            transition: "background-color 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                        <span>AI Tools</span>
                    </button>

                    {/* Divider */}
                    <div style={{
                        height: "1px",
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        margin: "8px 0"
                    }} />

                    {/* Collaboration Option */}
                    <button
                        onClick={toggleCollaboration}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            width: "100%",
                            padding: "10px 16px",
                            border: "none",
                            backgroundColor: "transparent",
                            color: "#e4e4e7",
                            cursor: "pointer",
                            fontSize: "14px",
                            fontFamily: "inherit",
                            textAlign: "left",
                            transition: "background-color 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = "transparent";
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isCollaborating ? "#ef4444" : "#22c55e"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <circle cx="12" cy="12" r="4" fill={isCollaborating ? "#ef4444" : "#22c55e"} />
                        </svg>
                        <span>{isCollaborating ? "Stop Collaboration" : "Start Collaboration"}</span>
                    </button>

                    {/* Copy Room Link (when collaborating) */}
                    {isCollaborating && roomId && (
                        <>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(window.location.href);
                                    alert("Link copied to clipboard!");
                                    setIsDropdownOpen(false);
                                }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "12px",
                                    width: "100%",
                                    padding: "10px 16px",
                                    border: "none",
                                    backgroundColor: "transparent",
                                    color: "#e4e4e7",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                    fontFamily: "inherit",
                                    textAlign: "left",
                                    transition: "background-color 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = "transparent";
                                }}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                                <span>Copy Room Link</span>
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>

    );

    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            <Excalidraw
                excalidrawAPI={(api) => setExcalidrawAPI(api)}
                isCollaborating={isCollaborating}
                onPointerUpdate={onPointerUpdate}
                onChange={handleChange}
                renderTopRightUI={renderTopRightUI}
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
                </MainMenu>

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

            {/* Unified AI Tools Dialog */}
            <AIToolsDialog
                isOpen={isAIToolsOpen}
                onClose={() => setIsAIToolsOpen(false)}
                excalidrawAPI={excalidrawAPI}
            />
        </div>
    );
};

export default App;
