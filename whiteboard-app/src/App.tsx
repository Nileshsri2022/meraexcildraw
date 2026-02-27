import React, { useState, useCallback, useRef, useEffect, lazy, Suspense } from "react";
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
import { useAutoSave, SaveStatus } from "./hooks/useAutoSave";
import { useVoiceCommand } from "./hooks/useVoiceCommand";
import type { VoiceCommandResult } from "./hooks/useVoiceCommand";
import { ErrorBoundary, PanelFallback, CanvasFallback } from "./components/ErrorBoundary";
import { CollabPresenceBar } from "./components/CollabPresenceBar";
import { StickyNotesLayer } from "./components/StickyNotesLayer";
import { useStickyNotes } from "./hooks/useStickyNotes";
import { useAIExplain } from "./hooks/useAIExplain";
import { AIExplainPanel } from "./components/AIExplainPanel";
import MarkdownRenderer from "./components/MarkdownRenderer";
import { renderToStaticMarkup } from "react-dom/server";
import { screenToCanvas } from "./types/sticky-notes";
import { exportWorkspace, importWorkspace } from "./utils/workspaceBundle";
import { usePresentation } from "./hooks/usePresentation";
import "./styles/presentation.css";

const AIToolsDialog = lazy(() =>
    import("./components/AIToolsDialog").then((m) => ({ default: m.AIToolsDialog }))
);
const ChatPanel = lazy(() =>
    import("./components/ChatPanel").then((m) => ({ default: m.ChatPanel }))
);
const PresentationMode = lazy(() =>
    import("./components/PresentationMode").then((m) => ({ default: m.PresentationMode }))
);
const PresentationToolbar = lazy(() =>
    import("./components/PresentationToolbar").then((m) => ({ default: m.PresentationToolbar }))
);
const FrameOverlay = lazy(() =>
    import("./components/FrameOverlay").then((m) => ({ default: m.FrameOverlay }))
);

const App: React.FC = () => {
    const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
    const [isAIToolsOpen, setIsAIToolsOpen] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Voice command state: stores the classified command to pass to AIToolsDialog
    const [pendingVoiceCommand, setPendingVoiceCommand] = useState<VoiceCommandResult | null>(null);

    // Sticky notes system
    const stickyNotes = useStickyNotes();

    // Presentation mode system
    const presentation = usePresentation(excalidrawAPI);

    // Auto-save hook
    const { saveStatus, lastSaved, triggerSave, clearSavedData, loadSavedData } = useAutoSave({
        enabled: true,
        debounceMs: 2000,
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

    // ─── Voice Command System ────────────────────────────────────────
    const handleVoiceCommand = useCallback((result: VoiceCommandResult) => {
        // Store the command and open the dialog — the dialog will auto-execute it
        setPendingVoiceCommand(result);
        setIsAIToolsOpen(true);
        setIsDropdownOpen(false);
    }, []);

    const handleVoiceError = useCallback((msg: string) => {
        console.error("[VoiceCommand]", msg);
        // Could show a toast here in the future
    }, []);

    const voiceCmd = useVoiceCommand({
        onCommand: handleVoiceCommand,
        onError: handleVoiceError,
    });

    const handleVoiceCommandDone = useCallback(() => {
        setPendingVoiceCommand(null);
        voiceCmd.resetPhase();
    }, [voiceCmd.resetPhase]);

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
                        excalidrawAPI.addFiles(
                            Object.values(savedData.files) as unknown as BinaryFileData[]
                        );
                    }
                    excalidrawAPI.updateScene({
                        elements: savedData.elements as OrderedExcalidrawElement[],
                        appState: savedData.appState as unknown as AppState,
                    });
                    if (import.meta.env.DEV) console.log('[App] Restored saved scene with files');
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
            if (initialDataLoaded && !isCollaborating) {
                triggerSave(elements, appState as unknown as Record<string, unknown>, files as unknown as Record<string, unknown>);
            }
        },
        [onSceneChange, triggerSave, initialDataLoaded, isCollaborating]
    );

    /** Read current canvas transform from the Excalidraw API (for one-off use in click handlers) */
    const getCanvasTransform = useCallback(() => {
        if (!excalidrawAPI) return { scrollX: 0, scrollY: 0, zoom: 1 };
        const s = excalidrawAPI.getAppState();
        return {
            scrollX: s.scrollX ?? 0,
            scrollY: s.scrollY ?? 0,
            zoom: (s.zoom as unknown as { value: number })?.value ?? 1,
        };
    }, [excalidrawAPI]);

    // Global AI explain instance for whiteboard-level explain actions
    const aiExplain = useAIExplain();

    // Render custom dropdown in top right area
    const renderTopRightUI = useCallback(() => (
        <div ref={dropdownRef} style={{ position: "relative", display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Chat Button */}
            <button
                className={`chat-trigger-btn${isChatOpen ? " chat-trigger-btn--active" : ""}`}
                onClick={() => setIsChatOpen(prev => !prev)}
                title="Canvas AI Chat"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            </button>

            {/* Left floating Explain button — visible always; detects Excalidraw text selection */}
            <button
                style={{
                    position: "fixed",
                    left: 18,
                    top: "50%",
                    transform: "translateY(-50%)",
                    zIndex: 9999,
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    background: "#6d28d9",
                    color: "white",
                    border: "none",
                    boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                }}
                onClick={() => {
                    // First, try to get Excalidraw selected text elements
                    let selected = "";
                    try {
                        const appState = excalidrawAPI?.getAppState?.();
                        const selIds: Record<string, boolean> | undefined = appState?.selectedElementIds as any;
                        if (selIds && excalidrawAPI?.getSceneElements) {
                            const ids = Object.keys(selIds || {});
                            if (ids.length > 0) {
                                const elements = excalidrawAPI.getSceneElements?.() || [];
                                const texts: string[] = [];
                                ids.forEach((id) => {
                                    const el = (elements as any).find((e: any) => e.id === id);
                                    if (el && (el.type === "text" || el.type === "sticky")) {
                                        texts.push(el.text || el.originalText || "");
                                    }
                                });
                                selected = texts.join("\n").trim();
                            }
                        }
                    } catch (e) {
                        // ignore
                    }

                    // If no Excalidraw text, fall back to DOM selection or inputs (notes)
                    if (!selected) {
                        selected = window.getSelection?.()?.toString()?.trim() || "";
                        if (!selected) {
                            const textInput = document.querySelector("textarea") || document.querySelector("input[type=text]");
                            const val = (textInput as HTMLInputElement | HTMLTextAreaElement | null)?.value;
                            if (val) selected = val.trim();
                        }
                    }

                    if (!selected) {
                        alert("Select text on the canvas or in a note, then click Explain.");
                        return;
                    }

                    aiExplain.explain({ text: selected });
                    setIsDropdownOpen(false);
                }}
                title="Explain selection with AI"
                aria-label="Explain selection"
            >
                {/* Lightbulb icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18h6" stroke="#fff" />
                    <path d="M10 22h4" stroke="#fff" />
                    <path d="M12 2a6 6 0 00-4 10c0 2 1 3 1 3h6s1-1 1-3a6 6 0 00-4-10z" stroke="#fff" />
                </svg>
            </button>

            {/* Sparkle Button */}
            <button
                className={`sparkle-btn${isDropdownOpen ? " sparkle-btn--active" : ""}`}
                onClick={() => setIsDropdownOpen(prev => !prev)}
                title="More Options"
            >
                ✨
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
                <div className="cosmic-dropdown">
                    {/* ─── AI Section ─── */}
                    <div className="cosmic-dropdown-label">AI</div>

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
                        <span>
                            AI Tools
                            <span className="item-desc">Image, diagram, sketch, OCR & TTS</span>
                        </span>
                    </button>

                    {/* Voice Command — Hero item */}
                    <button
                        className={[
                            "cosmic-dropdown-item",
                            "cosmic-dropdown-item--voice",
                            voiceCmd.isRecording && "cosmic-dropdown-item--recording",
                            voiceCmd.isBusy && "cosmic-dropdown-item--busy",
                        ].filter(Boolean).join(" ")}
                        onClick={() => {
                            if (voiceCmd.isRecording) {
                                voiceCmd.stopListening();
                            } else if (!voiceCmd.isBusy) {
                                voiceCmd.startListening();
                                setIsDropdownOpen(false);
                            }
                        }}
                        disabled={voiceCmd.isBusy}
                    >
                        <span className="item-icon">
                            {voiceCmd.isRecording ? (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="4" y="4" width="16" height="16" rx="3" />
                                </svg>
                            ) : (
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                    <line x1="12" y1="19" x2="12" y2="23" />
                                    <line x1="8" y1="23" x2="16" y2="23" />
                                </svg>
                            )}
                        </span>
                        <span>
                            {voiceCmd.isRecording
                                ? `Listening… ${voiceCmd.duration}s`
                                : voiceCmd.isBusy
                                    ? voiceCmd.phaseLabel
                                    : "Voice Command"}
                            <span className="item-desc">
                                {voiceCmd.isRecording
                                    ? "Click to stop recording"
                                    : voiceCmd.isBusy
                                        ? "Processing your command…"
                                        : "Speak to create anything"}
                            </span>
                        </span>
                    </button>

                    <div className="cosmic-dropdown-divider" />

                    {/* ─── Presentation Section ─── */}
                    <div className="cosmic-dropdown-label">Presentation</div>

                    {/* AI Presentation Mode */}
                    <button
                        className="cosmic-dropdown-item"
                        onClick={() => {
                            presentation.setIsToolbarOpen(true);
                            setIsDropdownOpen(false);
                        }}
                    >
                        <span className="item-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                                <line x1="8" y1="21" x2="16" y2="21" />
                                <line x1="12" y1="17" x2="12" y2="21" />
                            </svg>
                        </span>
                        <span>
                            AI Presentation
                            {presentation.frames.length > 0 && (
                                <span className="pres-trigger-badge">{presentation.frames.length}</span>
                            )}
                            <span className="item-desc">Turn canvas into a slide deck</span>
                        </span>
                    </button>

                    {/* Quick Present (if frames exist) */}
                    {presentation.frames.length > 0 && (
                        <button
                            className="cosmic-dropdown-item"
                            onClick={() => {
                                presentation.startPresenting();
                                setIsDropdownOpen(false);
                            }}
                        >
                            <span className="item-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="#8b5cf6">
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                </svg>
                            </span>
                            <span>
                                Present Now
                                <span className="item-desc">{presentation.frames.length} slides ready</span>
                            </span>
                        </button>
                    )}

                    <div className="cosmic-dropdown-divider" />

                    {/* ─── Workspace Section ─── */}
                    <div className="cosmic-dropdown-label">Workspace</div>

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
                        <span>
                            {isCollaborating ? "Stop Collaboration" : "Start Collaboration"}
                            <span className="item-desc">
                                {isCollaborating ? "Disconnect from live session" : "Real-time editing with others"}
                            </span>
                        </span>
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
                            <div className="cosmic-dropdown-label">Data</div>

                            {/* Export Workspace */}
                            <button
                                className="cosmic-dropdown-item"
                                onClick={async () => {
                                    setIsDropdownOpen(false);
                                    try {
                                        if (!excalidrawAPI) {
                                            alert("Canvas not ready yet.");
                                            return;
                                        }
                                        // Read LIVE canvas data — not stale IndexedDB
                                        const elements = excalidrawAPI.getSceneElements();
                                        const appState = excalidrawAPI.getAppState();
                                        const files = excalidrawAPI.getFiles();
                                        await exportWorkspace({
                                            elements,
                                            appState: {
                                                viewBackgroundColor: appState.viewBackgroundColor,
                                                theme: appState.theme,
                                            } as Record<string, unknown>,
                                            files: (files || {}) as unknown as Record<string, unknown>,
                                        });
                                    } catch (err) {
                                        console.error("Export failed:", err);
                                        alert("Export failed. See console for details.");
                                    }
                                }}
                            >
                                <span className="item-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="7 10 12 15 17 10" />
                                        <line x1="12" y1="15" x2="12" y2="3" />
                                    </svg>
                                </span>
                                <span>
                                    Export Workspace
                                    <span className="item-desc">Scene + chat + AI history as JSON</span>
                                </span>
                            </button>

                            {/* Import Workspace */}
                            <button
                                className="cosmic-dropdown-item"
                                onClick={async () => {
                                    setIsDropdownOpen(false);
                                    const result = await importWorkspace();
                                    if (result && excalidrawAPI) {
                                        if (result.scene) {
                                            // Add binary files (images) first
                                            if (result.scene.files && Object.keys(result.scene.files).length > 0) {
                                                excalidrawAPI.addFiles(
                                                    Object.values(result.scene.files) as unknown as BinaryFileData[]
                                                );
                                            }
                                            // Restore appState (background, theme) but override scroll/zoom
                                            // so scrollToContent can position the viewport correctly
                                            const restoredAppState = {
                                                ...(result.scene.appState || {}),
                                                scrollX: 0,
                                                scrollY: 0,
                                                zoom: { value: 1 },
                                            };
                                            const importedElements = result.scene.elements as OrderedExcalidrawElement[];
                                            excalidrawAPI.updateScene({
                                                elements: importedElements,
                                                appState: restoredAppState as unknown as AppState,
                                            });
                                            // Scroll to show imported content after render
                                            requestAnimationFrame(() => {
                                                excalidrawAPI.scrollToContent(importedElements, {
                                                    fitToContent: true,
                                                    animate: true,
                                                });
                                            });
                                        }

                                    }
                                }}
                            >
                                <span className="item-icon">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                        <polyline points="17 8 12 3 7 8" />
                                        <line x1="12" y1="3" x2="12" y2="15" />
                                    </svg>
                                </span>
                                <span>
                                    Import Workspace
                                    <span className="item-desc">Restore from .whiteboard.json file</span>
                                </span>
                            </button>

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

            {/* ─── Floating Voice Status Pill (visible when recording/processing) ─── */}
            {!isDropdownOpen && !voiceCmd.isIdle && (
                <div className="voice-status-pill">
                    <div className={`voice-status-dot${voiceCmd.isRecording ? " voice-status-dot--recording" : " voice-status-dot--busy"}`} />
                    <span className="voice-status-text">
                        {voiceCmd.isRecording
                            ? `Listening… ${voiceCmd.duration}s`
                            : voiceCmd.phaseLabel}
                    </span>
                    {voiceCmd.isRecording && (
                        <button
                            className="voice-status-stop"
                            onClick={voiceCmd.stopListening}
                            title="Stop listening"
                        >
                            ■
                        </button>
                    )}
                </div>
            )}
        </div>
    ), [isChatOpen, isDropdownOpen, isCollaborating, roomId, voiceCmd, toggleCollaboration, excalidrawAPI, getCanvasTransform, presentation]);

    return (
        <div style={{ width: "100vw", height: "100vh" }}>
            {/* ─── Canvas Error Boundary ─── */}
            <ErrorBoundary
                fallback={(error, reset) => <CanvasFallback onRetry={reset} />}
                onError={(err) => console.error("[Canvas Boundary]", err)}
            >
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
            </ErrorBoundary>

            {/* ─── Collab Presence Bar ─── */}
            <CollabPresenceBar username={username} />

            {/* ─── Sticky Notes Overlay ─── */}
            <StickyNotesLayer
                excalidrawAPI={excalidrawAPI}
                stickyNotes={stickyNotes}
            />

            {/* ─── Global AI Explain Panel (creates sticky on accept) ─── */}
            <AIExplainPanel
                state={aiExplain.state}
                onAccept={() => {
                    if (!aiExplain.state.response) return;
                    try {
                        const renderedHtml = renderToStaticMarkup(
                            React.createElement(MarkdownRenderer, { content: aiExplain.state.response })
                        );

                        const tmp = document.createElement("div");
                        tmp.innerHTML = renderedHtml;
                        tmp.querySelectorAll("h1,h2,h3,h4,p,li,blockquote,code,pre").forEach((el) => {
                            (el as HTMLElement).style.fontFamily = "inherit";
                        });

                        const processed = tmp.innerHTML;
                        const aiHtml = `<div class="ai-explain-inserted"><hr style="border:none;border-top:1px dashed rgba(0,0,0,0.15);margin:8px 0"><div style="font-size:12px;opacity:0.5;margin-bottom:4px">✨ AI Explanation</div><div>${processed}</div></div>`;

                        // Determine screen position from selection (if any)
                        let screenX = window.innerWidth / 2;
                        let screenY = window.innerHeight / 2;
                        const sel = window.getSelection();
                        if (sel && sel.rangeCount > 0) {
                            try {
                                const rect = sel.getRangeAt(0).getBoundingClientRect();
                                if (rect && (rect.width || rect.height)) {
                                    screenX = rect.left + rect.width / 2;
                                    screenY = rect.top + rect.height / 2;
                                }
                            } catch (err) {
                                // ignore
                            }
                        }

                        const transform = getCanvasTransform();
                        const canvasPos = screenToCanvas(screenX, screenY, transform);

                        stickyNotes.addNote(transform, window.innerWidth, window.innerHeight, { text: aiHtml, canvasX: canvasPos.x, canvasY: canvasPos.y });
                    } catch (err) {
                        console.error("Failed to create sticky from AI response", err);
                    } finally {
                        aiExplain.reset();
                    }
                }}
                onRegenerate={aiExplain.regenerate}
                onCancel={aiExplain.cancel}
            />

            {/* ─── AI Tools Dialog Error Boundary ─── */}
            <Suspense fallback={null}>
                {isAIToolsOpen && (
                    <ErrorBoundary
                        fallback={(error, reset) => (
                            <PanelFallback
                                name="AI Tools"
                                onRetry={reset}
                                onClose={() => setIsAIToolsOpen(false)}
                            />
                        )}
                        onError={(err) => console.error("[AITools Boundary]", err)}
                    >
                        <AIToolsDialog
                            isOpen={isAIToolsOpen}
                            onClose={() => setIsAIToolsOpen(false)}
                            excalidrawAPI={excalidrawAPI}
                            voiceCommand={pendingVoiceCommand}
                            onVoiceCommandDone={handleVoiceCommandDone}
                        />
                    </ErrorBoundary>
                )}
            </Suspense>

            {/* ─── Chat Panel Error Boundary ─── */}
            <Suspense fallback={null}>
                {isChatOpen && (
                    <ErrorBoundary
                        fallback={(error, reset) => (
                            <PanelFallback
                                name="Chat"
                                onRetry={reset}
                                onClose={() => setIsChatOpen(false)}
                            />
                        )}
                        onError={(err) => console.error("[Chat Boundary]", err)}
                    >
                        <ChatPanel
                            isOpen={isChatOpen}
                            onClose={() => setIsChatOpen(false)}
                            excalidrawAPI={excalidrawAPI}
                        />
                    </ErrorBoundary>
                )}
            </Suspense>

            {/* ─── AI Presentation Mode ─── */}
            <Suspense fallback={null}>
                {/* Frame overlay: visible in edit mode when frames exist */}
                {presentation.viewMode === "edit" && presentation.frames.length > 0 && (
                    <FrameOverlay
                        presentation={presentation}
                        excalidrawAPI={excalidrawAPI}
                    />
                )}

                {/* Presentation toolbar: floating slide management panel */}
                {presentation.isToolbarOpen && presentation.viewMode === "edit" && (
                    <PresentationToolbar
                        presentation={presentation}
                        excalidrawAPI={excalidrawAPI}
                    />
                )}

                {/* Fullscreen presentation mode */}
                {presentation.viewMode === "presenting" && (
                    <PresentationMode
                        presentation={presentation}
                        excalidrawAPI={excalidrawAPI}
                    />
                )}
            </Suspense>
        </div>
    );
};

export default App;
