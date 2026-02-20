import React, { useState, useCallback, useRef, useEffect } from "react";
import {
    Excalidraw,
    MainMenu,
    WelcomeScreen,
    Footer,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import type { ExcalidrawImperativeAPI, BinaryFileData, AppState, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { useCollaboration } from "./collab";
import { AIToolsDialog } from "./components/AIToolsDialog";
import { useAutoSave, SaveStatus } from "./hooks/useAutoSave";

const App: React.FC = () => {
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
    const [isAIToolsOpen, setIsAIToolsOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Auto-save hook
    const { saveStatus, lastSaved, triggerSave, clearSavedData, loadSavedData } = useAutoSave({
        enabled: true,
        debounceMs: 5000,
    });

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

    // Restore saved scene on mount
    useEffect(() => {
        if (excalidrawAPI && !initialDataLoaded) {
            loadSavedData().then((savedData) => {
                if (savedData && savedData.elements.length > 0) {
                    // Add files first before updating scene
                    if (savedData.files && Object.keys(savedData.files).length > 0) {
                        // Files are stored as plain objects; cast through BinaryFileData[]
                        // since branded types (FileId, DataURL) lose brands in IndexedDB
                        excalidrawAPI.addFiles(
                            Object.values(savedData.files) as unknown as BinaryFileData[]
                        );
                    }
                    excalidrawAPI.updateScene({
                        elements: savedData.elements as OrderedExcalidrawElement[],
                        // Excalidraw updateScene expects full AppState but we only persist
                        // a subset (viewBackgroundColor, zoom, scroll, theme). The cast
                        // is safe because Excalidraw merges partial state internally.
                        appState: savedData.appState as unknown as AppState,
                    });
                    console.log('[App] Restored saved scene with files');
                }
                setInitialDataLoaded(true);
            });
        }
    }, [excalidrawAPI, initialDataLoaded, loadSavedData]);

    // Toggle collaboration
    const toggleCollaboration = useCallback(() => {
        if (isCollaborating) {
            stopCollaboration();
        } else {
            startCollaboration();
        }
        setIsDropdownOpen(false);
    }, [isCollaborating, startCollaboration, stopCollaboration]);

    // Handle scene changes - sync collab and trigger auto-save
    const handleChange = useCallback(
        (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
            onSceneChange(elements);
            // Trigger auto-save (debounced) - only when not collaborating
            if (initialDataLoaded && !isCollaborating) {
                // Cast: AppState → Record for generic persistence layer
                triggerSave(elements, appState as unknown as Record<string, unknown>, files as unknown as Record<string, unknown>);
            }
        },
        [onSceneChange, triggerSave, initialDataLoaded, isCollaborating]
    );

    // Render custom dropdown in top right area
    const renderTopRightUI = () => (
        <div ref={dropdownRef} style={{ position: "relative" }}>
            {/* Sparkle Button */}
            <button
                className={`sparkle-btn${isDropdownOpen ? " sparkle-btn--active" : ""}`}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                title="More Options"
            >
                ✨
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
                <div className="cosmic-dropdown">
                    {/* AI Tools */}
                    <button
                        className="cosmic-dropdown-item"
                        onClick={() => {
                            setIsAIToolsOpen(true);
                            setIsDropdownOpen(false);
                        }}
                    >
                        <span className="item-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                                <path d="M2 17l10 5 10-5" />
                                <path d="M2 12l10 5 10-5" />
                            </svg>
                        </span>
                        AI Tools
                    </button>

                    <div className="cosmic-dropdown-divider" />

                    {/* Collaboration */}
                    <button
                        className="cosmic-dropdown-item"
                        onClick={toggleCollaboration}
                    >
                        <span className="item-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={isCollaborating ? "#ef4444" : "#22c55e"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <circle cx="12" cy="12" r="4" fill={isCollaborating ? "#ef4444" : "#22c55e"} />
                            </svg>
                        </span>
                        {isCollaborating ? "Stop Collaboration" : "Start Collaboration"}
                    </button>

                    {/* Copy Room Link (when collaborating) */}
                    {isCollaborating && roomId && (
                        <button
                            className="cosmic-dropdown-item"
                            onClick={() => {
                                navigator.clipboard.writeText(window.location.href);
                                alert("Link copied to clipboard!");
                                setIsDropdownOpen(false);
                            }}
                        >
                            <span className="item-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                </svg>
                            </span>
                            Copy Room Link
                        </button>
                    )}

                    {/* Clear Local Data */}
                    {!isCollaborating && (
                        <>
                            <div className="cosmic-dropdown-divider" />
                            <button
                                className="cosmic-dropdown-item cosmic-dropdown-item--danger"
                                onClick={async () => {
                                    if (confirm("Clear all locally saved data? This cannot be undone.")) {
                                        await clearSavedData();
                                        alert("Local data cleared!");
                                    }
                                    setIsDropdownOpen(false);
                                }}
                            >
                                <span className="item-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                    </svg>
                                </span>
                                Clear Local Data
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
                    <span className="save-status save-status--idle" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {isCollaborating ? (
                            <>🟢 {username} in room: {roomId}</>
                        ) : (
                            "Powered by Excalidraw"
                        )}
                        {!isCollaborating && (
                            <span className={`save-status save-status--${saveStatus}`}>
                                {saveStatus === 'saving' && '💾 Saving...'}
                                {saveStatus === 'saved' && '✅ Saved'}
                                {saveStatus === 'error' && '❌ Save failed'}
                                {saveStatus === 'idle' && lastSaved && `Last saved: ${lastSaved.toLocaleTimeString()}`}
                            </span>
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
