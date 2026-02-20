import React, { useState } from "react";
import "katex/dist/katex.min.css";
import { useBlockExcalidrawKeys } from "../hooks/useBlockExcalidrawKeys";
import { useAIHistory } from "../hooks/useAIHistory";
import { useTTS } from "../hooks/useTTS";
import { useAIGeneration } from "../hooks/useAIGeneration";
import type { AITab, AIToolsDialogProps } from "../types/ai-tools";

// ─── Extracted UI Components ───
import { IconDiagram, IconImage, IconSketch, IconOCR, IconTTS, IconHistory } from "./Icons";
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

    const isDisabled = activeTab === "ocr" ? !gen.ocrImage : !gen.prompt.trim();

    return (
        <div className="ai-dialog-overlay" onClick={onClose}>
            <div className="ai-dialog" onClick={(e) => e.stopPropagation()}>
                {/* ─── Left Sidebar ─── */}
                {sidebarOpen && (
                    <div className="ai-sidebar">
                        <div className="ai-sidebar-header">
                            <h2 className="ai-sidebar-title">
                                <span className="aurora-dot" />
                                AI Tools
                            </h2>
                            <button
                                className="ai-sidebar-close"
                                onClick={() => setSidebarOpen(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <nav className="ai-sidebar-nav">
                            {SIDEBAR_TABS.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`ai-tab-btn${activeTab === tab.id ? " ai-tab-btn--active" : ""}`}
                                    onClick={() => { setActiveTab(tab.id); gen.setError(null); }}
                                >
                                    <span className="ai-tab-icon">{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                            <div className="ai-sidebar-divider" />
                            <button
                                className={`ai-tab-btn${activeTab === "history" ? " ai-tab-btn--active" : ""}`}
                                onClick={() => { setActiveTab("history"); gen.setError(null); }}
                            >
                                <span className="ai-tab-icon"><IconHistory /></span>
                                History
                            </button>
                        </nav>
                    </div>
                )}

                {/* ─── Right Content Panel ─── */}
                <div className="ai-content">
                    {/* Section header */}
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
                        {!sidebarOpen && (
                            <button
                                className="ai-sidebar-close"
                                onClick={() => setSidebarOpen(true)}
                                title="Show sidebar"
                                style={{ flexShrink: 0 }}
                            >
                                ☰
                            </button>
                        )}
                        <h3 className="ai-content-title" style={{ margin: 0 }}>
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

                    {activeTab === "diagram" && (
                        <DiagramSettings style={gen.style} setStyle={gen.setStyle} />
                    )}

                    {/* Error Display */}
                    {activeTab !== "history" && gen.error && (
                        <div className="ai-error" style={{ maxWidth: "480px" }}>
                            <span>⚠️</span> {gen.error}
                        </div>
                    )}

                    {/* Action Button */}
                    {activeTab !== "tts" && activeTab !== "history" && (
                        <div style={{ maxWidth: "480px" }}>
                            <button
                                className={`ai-generate-btn${gen.loading ? " ai-generate-btn--loading" : ""}`}
                                onClick={handleGenerate}
                                disabled={gen.loading || isDisabled}
                            >
                                {gen.loading
                                    ? (activeTab === "ocr" ? "Extracting..." : "Generating...")
                                    : (activeTab === "ocr"
                                        ? "📝 Extract Text"
                                        : `◆ Generate ${activeTab === "diagram" ? "Diagram" : activeTab === "image" ? "Image" : "from Sketch"}`
                                    )
                                }
                            </button>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="ai-footer" style={{ marginTop: "20px", padding: 0, border: "none", background: "none" }}>
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

