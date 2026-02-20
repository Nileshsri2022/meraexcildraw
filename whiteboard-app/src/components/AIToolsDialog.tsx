import React, { useState } from "react";
import "katex/dist/katex.min.css";
import { useBlockExcalidrawKeys } from "../hooks/useBlockExcalidrawKeys";
import { useAIHistory } from "../hooks/useAIHistory";
import { useTTS } from "../hooks/useTTS";
import { useAIGeneration } from "../hooks/useAIGeneration";
import type { AITab, AIToolsDialogProps } from "../types/ai-tools";

// ─── Extracted UI Components ───
import { IconDiagram, IconImage, IconSketch, IconOCR, IconTTS, IconSparkle, IconHistory } from "./Icons";
import { FormLabel, FormTextarea, FormSelect, FormSlider, FormInput, InfoBanner } from "./FormComponents";
import { PromptSection, ImageSettings, SketchSettings, DiagramSettings } from "./TabPanels";
import { TtsTabPanel, HistoryTabPanel } from "./TtsHistoryPanels";
import { OcrTabPanel } from "./OcrTabPanel";

// ─── Hoisted Constants (rendering-hoist-jsx) ───

/** Sidebar tab definitions — hoisted to avoid re-creating on each render */
const SIDEBAR_TABS = [
    { id: "diagram" as const, label: "Diagram", icon: <IconDiagram /> },
    { id: "image" as const, label: "Image", icon: <IconImage /> },
    { id: "sketch" as const, label: "Sketch", icon: <IconSketch /> },
    { id: "ocr" as const, label: "OCR", icon: <IconOCR /> },
    { id: "tts" as const, label: "TTS", icon: <IconTTS /> },
] as const;

export const AIToolsDialog: React.FC<AIToolsDialogProps> = ({
    isOpen,
    onClose,
    excalidrawAPI,
    initialTab = "diagram"
}) => {
    const [activeTab, setActiveTab] = useState<AITab>(initialTab);
    const { history: filteredHistory, allHistory, filter: historyFilter, setFilter: setHistoryFilter, deleteEntry: deleteHistoryEntry, clearAll: clearAllHistory } = useAIHistory(activeTab === "history" && isOpen);

    // All generation logic extracted into a single hook
    const gen = useAIGeneration(excalidrawAPI, onClose);

    // Text-to-Speech
    const tts = useTTS(activeTab === "tts" && isOpen, gen.setLoading, gen.setError);

    const handleGenerate =
        activeTab === "diagram"
            ? gen.generateDiagram
            : activeTab === "image"
                ? gen.generateImage
                : activeTab === "sketch"
                    ? gen.generateSketchImage
                    : gen.performOcr;

    // Sidebar toggle state
    const [sidebarOpen, setSidebarOpen] = useState(true);

    // Block Excalidraw keyboard shortcuts while dialog is open
    useBlockExcalidrawKeys(isOpen);

    if (!isOpen) return null;

    return (
        <div
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(0, 0, 0, 0.6)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 9999,
            }}
            onClick={onClose}
        >
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                .ai-dialog-scrollbar::-webkit-scrollbar { width: 6px; }
                .ai-dialog-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .ai-dialog-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 3px; }
                .ai-dialog-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
            `}</style>
            <div
                style={{
                    backgroundColor: "#232329",
                    borderRadius: "14px",
                    width: "min(680px, 90vw)",
                    height: "min(520px, 80vh)",
                    display: "flex",
                    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08)",
                    overflow: "hidden",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* ─── Left Sidebar ─── */}
                {sidebarOpen && (
                    <div style={{
                        width: "180px",
                        minWidth: "180px",
                        backgroundColor: "#1e1e24",
                        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
                        padding: "16px 0",
                        display: "flex",
                        flexDirection: "column",
                    }}>
                        <div style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            margin: "0 0 16px 0",
                            padding: "0 16px",
                        }}>
                            <h2 style={{
                                margin: 0,
                                fontSize: "15px",
                                fontWeight: 600,
                                color: "#e4e4e7",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                            }}>
                                <IconSparkle /> AI Tools
                            </h2>
                            <button
                                onClick={() => setSidebarOpen(false)}
                                style={{
                                    width: "26px",
                                    height: "26px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    backgroundColor: "transparent",
                                    color: "#6b7280",
                                    cursor: "pointer",
                                    fontSize: "13px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#e4e4e7"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#6b7280"; }}
                            >
                                ✕
                            </button>
                        </div>

                        <nav style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px" }}>
                            {SIDEBAR_TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => { setActiveTab(tab.id); gen.setError(null); }}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        padding: "8px 12px",
                                        borderRadius: "8px",
                                        border: "none",
                                        backgroundColor: activeTab === tab.id ? "rgba(99, 102, 241, 0.15)" : "transparent",
                                        color: activeTab === tab.id ? "#a5b4fc" : "#9ca3af",
                                        cursor: "pointer",
                                        fontSize: "13px",
                                        fontWeight: activeTab === tab.id ? 600 : 400,
                                        transition: "all 0.15s ease",
                                        width: "100%",
                                        textAlign: "left" as const,
                                    }}
                                >
                                    <span style={{ display: "flex", alignItems: "center" }}>{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                            {/* Divider */}
                            <div style={{ height: "1px", backgroundColor: "rgba(255,255,255,0.07)", margin: "6px 4px" }} />
                            {/* History Tab */}
                            <button
                                onClick={() => { setActiveTab("history"); gen.setError(null); }}
                                style={{
                                    display: "flex", alignItems: "center", gap: "10px",
                                    padding: "8px 12px", borderRadius: "8px", border: "none",
                                    backgroundColor: activeTab === "history" ? "rgba(99, 102, 241, 0.15)" : "transparent",
                                    color: activeTab === "history" ? "#a5b4fc" : "#9ca3af",
                                    cursor: "pointer", fontSize: "13px",
                                    fontWeight: activeTab === "history" ? 600 : 400,
                                    transition: "all 0.15s ease", width: "100%", textAlign: "left" as const,
                                }}
                            >
                                <span style={{ display: "flex", alignItems: "center" }}><IconHistory /></span>
                                History
                            </button>
                        </nav>
                    </div>
                )}

                {/* ─── Right Content Panel ─── */}
                <div
                    className="ai-dialog-scrollbar"
                    style={{
                        flex: 1,
                        padding: "24px 32px",
                        overflowY: "auto",
                    }}
                >
                    {/* Section header */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        marginBottom: "20px",
                    }}>
                        {!sidebarOpen && (
                            <button
                                onClick={() => setSidebarOpen(true)}
                                style={{
                                    width: "28px",
                                    height: "28px",
                                    borderRadius: "6px",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    backgroundColor: "transparent",
                                    color: "#9ca3af",
                                    cursor: "pointer",
                                    fontSize: "14px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    transition: "all 0.15s ease",
                                    flexShrink: 0,
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#e4e4e7"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#9ca3af"; }}
                                title="Show sidebar"
                            >
                                ☰
                            </button>
                        )}
                        <h3 style={{
                            margin: 0,
                            fontSize: "16px",
                            fontWeight: 600,
                            color: "#e4e4e7",
                            textTransform: "capitalize" as const,
                        }}>
                            {activeTab === "ocr" ? "OCR" : activeTab === "tts" ? "Text to Speech" : activeTab}
                        </h3>
                    </div>

                    {(activeTab === "diagram" || activeTab === "image" || activeTab === "sketch") && (
                        <PromptSection activeTab={activeTab} prompt={gen.prompt} setPrompt={gen.setPrompt} />
                    )}

                    {activeTab === "image" && (
                        <ImageSettings
                            imgWidth={gen.imgWidth} setImgWidth={gen.setImgWidth}
                            imgHeight={gen.imgHeight} setImgHeight={gen.setImgHeight}
                            imgSteps={gen.imgSteps} setImgSteps={gen.setImgSteps}
                            imgSeed={gen.imgSeed} setImgSeed={gen.setImgSeed}
                            imgRandomSeed={gen.imgRandomSeed} setImgRandomSeed={gen.setImgRandomSeed}
                        />
                    )}

                    {activeTab === "sketch" && (
                        <SketchSettings
                            sketchPipeline={gen.sketchPipeline} setSketchPipeline={gen.setSketchPipeline}
                            sketchPreprocessor={gen.sketchPreprocessor} setSketchPreprocessor={gen.setSketchPreprocessor}
                            sketchResolution={gen.sketchResolution} setSketchResolution={gen.setSketchResolution}
                            sketchSteps={gen.sketchSteps} setSketchSteps={gen.setSketchSteps}
                            sketchGuidance={gen.sketchGuidance} setSketchGuidance={gen.setSketchGuidance}
                            sketchSeed={gen.sketchSeed} setSketchSeed={gen.setSketchSeed}
                        />
                    )}

                    {activeTab === "ocr" && (
                        <OcrTabPanel
                            ocrImage={gen.ocrImage}
                            ocrResult={gen.ocrResult}
                            ocrMarkdownRef={gen.ocrMarkdownRef}
                            onUpload={gen.handleOcrImageUpload}
                            onCapture={gen.captureCanvas}
                            onAddAsImage={gen.addOcrAsImage}
                            onAddAsText={gen.addOcrAsText}
                            onClear={gen.clearOcr}
                        />
                    )}

                    {activeTab === "tts" && (
                        <TtsTabPanel tts={tts} loading={gen.loading} />
                    )}

                    {activeTab === "history" && (
                        <HistoryTabPanel
                            filteredHistory={filteredHistory}
                            allHistory={allHistory}
                            historyFilter={historyFilter}
                            setHistoryFilter={setHistoryFilter}
                            deleteEntry={deleteHistoryEntry}
                            clearAll={clearAllHistory}
                        />
                    )}

                    {/* Style selector (only for diagrams) */}
                    {activeTab === "diagram" && (
                        <DiagramSettings style={gen.style} setStyle={gen.setStyle} />
                    )}

                    {/* Error Display */}
                    {activeTab !== "history" && gen.error && (
                        <div style={{
                            padding: "10px 12px",
                            marginBottom: "14px",
                            maxWidth: "480px",
                            backgroundColor: "rgba(239, 68, 68, 0.15)",
                            border: "1px solid rgba(239, 68, 68, 0.4)",
                            borderRadius: "8px",
                            color: "#fca5a5",
                            fontSize: "12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}>
                            <span>⚠️</span> {gen.error}
                        </div>
                    )}

                    {/* Action Buttons - Not shown for tts or history tabs */}
                    {activeTab !== "tts" && activeTab !== "history" && (
                        <div style={{ display: "flex", gap: "10px", maxWidth: "480px" }}>
                            <button
                                onClick={handleGenerate}
                                disabled={gen.loading || (activeTab === "ocr" ? !gen.ocrImage : !gen.prompt.trim())}
                                style={{
                                    flex: 1,
                                    padding: "12px 18px",
                                    borderRadius: "10px",
                                    border: "none",
                                    backgroundColor: gen.loading || (activeTab === "ocr" ? !gen.ocrImage : !gen.prompt.trim())
                                        ? "rgba(255, 255, 255, 0.06)"
                                        : "rgba(255, 255, 255, 0.08)",
                                    color: gen.loading || (activeTab === "ocr" ? !gen.ocrImage : !gen.prompt.trim()) ? "#6b7280" : "#e4e4e7",
                                    cursor: gen.loading || (activeTab === "ocr" ? !gen.ocrImage : !gen.prompt.trim()) ? "not-allowed" : "pointer",
                                    fontSize: "14px",
                                    fontWeight: 500,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: "8px",
                                    transition: "all 0.15s ease",
                                }}
                                onMouseEnter={(e) => {
                                    const isDisabled = activeTab === "ocr" ? !gen.ocrImage : !gen.prompt.trim();
                                    if (!gen.loading && !isDisabled) {
                                        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.12)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    const isDisabled = activeTab === "ocr" ? !gen.ocrImage : !gen.prompt.trim();
                                    if (!gen.loading && !isDisabled) {
                                        e.currentTarget.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
                                    }
                                }}
                            >
                                {gen.loading ? (
                                    <>
                                        <span style={{
                                            width: "16px",
                                            height: "16px",
                                            border: "2px solid transparent",
                                            borderTopColor: "currentColor",
                                            borderRadius: "50%",
                                            animation: "spin 0.8s linear infinite",
                                            display: "inline-block",
                                        }} />
                                        {activeTab === "ocr" ? "Extracting..." : "Generating..."}
                                    </>
                                ) : (
                                    <>
                                        {activeTab === "ocr" ? "📝 Extract Text" : "◆ Generate " + (activeTab === "diagram" ? "Diagram" : activeTab === "image" ? "Image" : "from Sketch")}
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Footer */}
                    <div style={{
                        marginTop: "20px",
                        fontSize: "12px",
                        color: "#6b7280",
                        textAlign: "center",
                        maxWidth: "480px",
                    }}>
                        {activeTab === "diagram" && "Powered by Kimi-K2 + Mermaid-to-Excalidraw"}
                        {activeTab === "image" && "Powered by Z-Image-Turbo • Ultra-fast generation"}
                        {activeTab === "sketch" && "Powered by ControlNet v1.1 • May take 30-60s on cold start"}
                        {activeTab === "ocr" && "Powered by PaddleOCR-VL"}
                        {activeTab === "tts" && "Powered by ElevenLabs Text-to-Speech"}
                    </div>
                </div>
            </div>
        </div>
    );
};

