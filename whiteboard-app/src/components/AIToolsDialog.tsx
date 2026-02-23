import React, { useState, useCallback, useEffect, useRef } from "react";
import "katex/dist/katex.min.css";
import { useBlockExcalidrawKeys } from "../hooks/useBlockExcalidrawKeys";
import { useAIHistory } from "../hooks/useAIHistory";
import { useTTS } from "../hooks/useTTS";
import { useAIGeneration } from "../hooks/useAIGeneration";
import { useVoiceRecorder } from "../hooks/useVoiceRecorder";
import type { AITab, AIToolsDialogProps } from "../types/ai-tools";
import type { AIHistoryEntry } from "../data/LocalStorage";
import { parseMermaidToExcalidraw } from "@excalidraw/mermaid-to-excalidraw";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { addImageToCanvas } from "../utils/addImageToCanvas";

// ─── Extracted UI Components ───
import { IconDiagram, IconImage, IconSketch, IconOCR, IconTTS, IconHistory } from "./Icons";
import { FormLabel, FormTextarea, FormSelect, FormSlider, FormInput } from "./FormComponents";
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

/** Voice command tool → AI tab mapping (hoisted per rendering-hoist-jsx) */
const TOOL_TO_TAB: Record<string, AITab> = {
    image: "image",
    diagram: "diagram",
    sketch: "sketch",
    tts: "tts",
    ocr: "ocr",
};

export const AIToolsDialog: React.FC<AIToolsDialogProps> = ({
    isOpen,
    onClose,
    excalidrawAPI,
    initialTab = "diagram",
    voiceCommand,
    onVoiceCommandDone,
}) => {
    const [activeTab, setActiveTab] = useState<AITab>(initialTab);
    const { history: filteredHistory, allHistory, filter: historyFilter, setFilter: setHistoryFilter, deleteEntry: deleteHistoryEntry, clearAll: clearAllHistory } = useAIHistory(activeTab === "history" && isOpen);

    // All generation logic extracted into a single hook
    const gen = useAIGeneration(excalidrawAPI, onClose);

    // ── Reuse history entry: re-apply a past AI result to the canvas ──
    const reuseHistoryEntry = useCallback(async (entry: AIHistoryEntry) => {
        if (!excalidrawAPI) return;

        try {
            switch (entry.type) {
                case "diagram": {
                    // Re-parse stored Mermaid code into Excalidraw elements
                    const { elements: skeleton } = await parseMermaidToExcalidraw(entry.result);
                    const newElements = convertToExcalidrawElements(skeleton);
                    const current = excalidrawAPI.getSceneElements();
                    excalidrawAPI.updateScene({ elements: [...current, ...newElements] });
                    excalidrawAPI.scrollToContent(newElements, { fitToContent: true });
                    break;
                }
                case "image":
                case "sketch": {
                    // Re-add stored base64 image to canvas
                    if (entry.result?.startsWith("data:")) {
                        await addImageToCanvas(excalidrawAPI, entry.result, {
                            x: 100, y: 100, width: 512, height: 512,
                            idPrefix: `reuse-${entry.type}`,
                        });
                        excalidrawAPI.scrollToContent(undefined, { fitToContent: true });
                    }
                    break;
                }
                case "ocr": {
                    // Copy extracted text to clipboard
                    if (entry.result) {
                        await navigator.clipboard.writeText(entry.result);
                        alert("📋 OCR text copied to clipboard!");
                    }
                    break;
                }
                case "tts":
                    // TTS doesn't have a visual canvas result
                    break;
            }
        } catch (err) {
            console.error("Failed to reuse history entry:", err);
            alert(`Failed to reuse: ${(err as Error).message}`);
        }
    }, [excalidrawAPI]);

    // Per-tab voice-to-prompt (simple STT → fills textarea)
    const handleTranscript = useCallback(
        (text: string) => gen.setPrompt((prev: string) => prev ? `${prev} ${text}` : text),
        [gen.setPrompt],
    );
    const handleVoiceError = useCallback(
        (msg: string) => gen.setError(msg),
        [gen.setError],
    );
    const voice = useVoiceRecorder({
        onTranscript: handleTranscript,
        onError: handleVoiceError,
    });

    // Text-to-Speech
    const tts = useTTS(activeTab === "tts" && isOpen, gen.setLoading, gen.setError);

    // ─── Incoming Voice Command (from App.tsx) ────────────────────────
    // Refs to always access the latest gen/tts functions (avoids stale closures).
    // Updated via useEffect (not during render) per react-best-practices.
    const genRef = useRef(gen);
    const ttsRef = useRef(tts);

    useEffect(() => { genRef.current = gen; });
    useEffect(() => { ttsRef.current = tts; });

    useEffect(() => {
        if (!voiceCommand) return;

        // Step 1: Switch to the correct tab
        const targetTab = TOOL_TO_TAB[voiceCommand.tool] || "image";
        setActiveTab(targetTab);

        // Step 2: Set the prompt (for non-TTS tools)
        if (voiceCommand.tool === "tts") {
            // TTS has its own separate text state
            ttsRef.current.setText(voiceCommand.prompt || "");
        } else if (voiceCommand.prompt) {
            genRef.current.setPrompt(voiceCommand.prompt);
        }

        // Step 3: Set diagram style if applicable
        if (voiceCommand.tool === "diagram" && voiceCommand.style) {
            genRef.current.setStyle(voiceCommand.style);
        }

        genRef.current.setError(null);

        // Step 4: Auto-execute after state settles
        // TTS needs a longer delay because voices may need to load
        const delay = voiceCommand.tool === "tts" ? 500 : 200;
        const timer = setTimeout(() => {
            const g = genRef.current;
            const t = ttsRef.current;
            const tool = voiceCommand.tool;

            if (tool === "image") {
                g.generateImage();
            } else if (tool === "diagram") {
                g.generateDiagram();
            } else if (tool === "sketch") {
                g.generateSketchImage();
            } else if (tool === "ocr") {
                g.performOcr();
            } else if (tool === "tts") {
                t.speak();
            }

            onVoiceCommandDone?.();
        }, delay);

        return () => clearTimeout(timer);
    }, [voiceCommand, onVoiceCommandDone]);


    const handleGenerate = () => {
        if (activeTab === "diagram") gen.generateDiagram();
        else if (activeTab === "image") gen.generateImage();
        else if (activeTab === "sketch") gen.generateSketchImage();
        else gen.performOcr();
    };

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
                        <PromptSection activeTab={activeTab} prompt={gen.prompt} setPrompt={gen.setPrompt} voice={voice} />
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
                            reuseEntry={reuseHistoryEntry}
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
