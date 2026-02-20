import React from "react";
import { FormLabel, FormTextarea, FormSelect, FormSlider, FormInput } from "./FormComponents";
import { LAYOUT } from "../constants/theme";

// ─── Mic SVG Icons ───────────────────────────────────────────────────────────

const MicIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
);

const StopIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
);

const SpinnerIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
);

// ─── Voice Mic Button ────────────────────────────────────────────────────────

interface VoiceMicButtonProps {
    isRecording: boolean;
    isTranscribing: boolean;
    duration: number;
    onStart: () => void;
    onStop: () => void;
}

const VoiceMicButton = ({ isRecording, isTranscribing, duration, onStart, onStop }: VoiceMicButtonProps) => {
    const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

    const btnClass = [
        "voice-mic-btn",
        isRecording && "voice-mic-btn--recording",
        isTranscribing && "voice-mic-btn--transcribing",
    ].filter(Boolean).join(" ");

    return (
        <div className="voice-mic-container">
            <button
                className={btnClass}
                onClick={isRecording ? onStop : onStart}
                disabled={isTranscribing}
                title={isRecording ? "Stop recording" : isTranscribing ? "Transcribing..." : "Voice input — speak your prompt"}
                type="button"
            >
                {isTranscribing ? <SpinnerIcon /> : isRecording ? <StopIcon /> : <MicIcon />}
            </button>
            {isRecording && (
                <span className="voice-mic-duration">{formatDuration(duration)}</span>
            )}
            {isTranscribing && (
                <span className="voice-mic-status">Transcribing...</span>
            )}
        </div>
    );
};

// ─── Shared Props ────────────────────────────────────────────────────────────

interface PromptSectionProps {
    activeTab: "diagram" | "image" | "sketch";
    prompt: string;
    setPrompt: (val: string) => void;
    /** Voice recorder state (optional — mic hidden if not provided) */
    voice?: {
        isRecording: boolean;
        isTranscribing: boolean;
        duration: number;
        startRecording: () => void;
        stopRecording: () => void;
    };
}

/**
 * Prompt textarea shared by Diagram, Image, and Sketch tabs.
 * Includes an optional mic button for voice-to-prompt.
 */
export const PromptSection = ({ activeTab, prompt, setPrompt, voice }: PromptSectionProps) => (
    <div style={{ marginBottom: "14px", maxWidth: LAYOUT.formMaxWidth }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <FormLabel>
                {activeTab === "diagram"
                    ? "Describe your diagram:"
                    : activeTab === "image"
                        ? "✨ Your Prompt:"
                        : "Describe the final image style:"}
            </FormLabel>
            {voice && (
                <VoiceMicButton
                    isRecording={voice.isRecording}
                    isTranscribing={voice.isTranscribing}
                    duration={voice.duration}
                    onStart={voice.startRecording}
                    onStop={voice.stopRecording}
                />
            )}
        </div>
        <FormTextarea
            value={prompt}
            onChange={setPrompt}
            placeholder={
                activeTab === "diagram"
                    ? "e.g., User login authentication flow with error handling"
                    : activeTab === "image"
                        ? "e.g., A futuristic city skyline at sunset with flying cars"
                        : "e.g., High-quality anime style, vibrant colors, clean lines"
            }
        />
    </div>
);

// ─── Image Tab Settings ──────────────────────────────────────────────────────

interface ImageSettingsProps {
    imgWidth: number; setImgWidth: (v: number) => void;
    imgHeight: number; setImgHeight: (v: number) => void;
    imgSteps: number; setImgSteps: (v: number) => void;
    imgSeed: number; setImgSeed: (v: number) => void;
    imgRandomSeed: boolean; setImgRandomSeed: (v: boolean) => void;
}

export const ImageSettings = ({
    imgWidth, setImgWidth, imgHeight, setImgHeight,
    imgSteps, setImgSteps, imgSeed, setImgSeed,
    imgRandomSeed, setImgRandomSeed,
}: ImageSettingsProps) => (
    <div style={{ marginBottom: "14px", maxWidth: LAYOUT.formMaxWidth }}>

        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
                <FormSlider label="Height" value={imgHeight} onChange={setImgHeight} min={512} max={2048} step={64} accentColor="#eab308" />
            </div>
            <div style={{ flex: 1 }}>
                <FormSlider label="Width" value={imgWidth} onChange={setImgWidth} min={512} max={2048} step={64} accentColor="#eab308" />
            </div>
        </div>

        <FormSlider label="Inference Steps" value={imgSteps} onChange={setImgSteps} min={1} max={20} step={1} accentColor="#eab308" hint="9 steps = 8 DiT forwards (recommended)" />

        <div style={{ marginBottom: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <FormLabel>Seed</FormLabel>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", fontSize: "12px", color: "#9ca3af" }}>
                    <input
                        type="checkbox"
                        checked={imgRandomSeed}
                        onChange={(e) => setImgRandomSeed(e.target.checked)}
                        style={{ accentColor: "#eab308", cursor: "pointer" }}
                    />
                    🎲 Random Seed
                </label>
            </div>
            <FormInput type="number" value={imgSeed} onChange={(v) => setImgSeed(Number(v))} disabled={imgRandomSeed} min={0} max={2147483647} />
        </div>
    </div>
);

// ─── Sketch Tab Settings ─────────────────────────────────────────────────────

interface SketchSettingsProps {
    sketchPipeline: string; setSketchPipeline: (v: string) => void;
    sketchPreprocessor: string; setSketchPreprocessor: (v: string) => void;
    sketchResolution: number; setSketchResolution: (v: number) => void;
    sketchSteps: number; setSketchSteps: (v: number) => void;
    sketchGuidance: number; setSketchGuidance: (v: number) => void;
    sketchSeed: number; setSketchSeed: (v: number) => void;
}

export const SketchSettings = ({
    sketchPipeline, setSketchPipeline,
    sketchPreprocessor, setSketchPreprocessor,
    sketchResolution, setSketchResolution,
    sketchSteps, setSketchSteps,
    sketchGuidance, setSketchGuidance,
    sketchSeed, setSketchSeed,
}: SketchSettingsProps) => (
    <div style={{ marginBottom: "14px", maxWidth: LAYOUT.formMaxWidth }}>

        <div style={{ marginBottom: "12px" }}>
            <FormLabel>Pipeline:</FormLabel>
            <FormSelect value={sketchPipeline} onChange={setSketchPipeline}>
                <option value="scribble">✏️ Scribble (rough freehand sketches)</option>
                <option value="canny">🔲 Canny (clean edge outlines)</option>
                <option value="softedge">🌊 SoftEdge (smooth edges)</option>
                <option value="lineart">🖊️ Lineart (clean line drawings)</option>
                <option value="depth">📐 Depth (depth-based generation)</option>
                <option value="normal">🗺️ Normal Map</option>
                <option value="mlsd">📏 MLSD (straight lines / architecture)</option>
                <option value="segmentation">🎨 Segmentation (semantic maps)</option>
            </FormSelect>
        </div>

        <div style={{ marginBottom: "12px" }}>
            <FormLabel>Preprocessor:</FormLabel>
            <FormSelect value={sketchPreprocessor} onChange={setSketchPreprocessor}>
                <option value="HED">HED (Soft edges — best for rough sketches)</option>
                <option value="None">None (Direct — best for clean line art)</option>
            </FormSelect>
        </div>

        <FormSlider label="Image Resolution" value={sketchResolution} onChange={setSketchResolution} min={256} max={768} step={128} />

        <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
            <div style={{ flex: 1 }}>
                <FormSlider label="Steps" value={sketchSteps} onChange={setSketchSteps} min={10} max={40} step={5} />
            </div>
            <div style={{ flex: 1 }}>
                <FormSlider label="Guidance" value={sketchGuidance} onChange={setSketchGuidance} min={1} max={20} step={0.5} />
            </div>
        </div>

        <div style={{ marginBottom: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <FormLabel>Seed</FormLabel>
                <button
                    onClick={() => setSketchSeed(Math.floor(Math.random() * 2147483647))}
                    style={{
                        padding: "2px 8px", borderRadius: "4px",
                        border: "1px solid rgba(255, 255, 255, 0.15)",
                        backgroundColor: "transparent", color: "#9ca3af",
                        cursor: "pointer", fontSize: "11px",
                    }}
                >
                    🎲 Random
                </button>
            </div>
            <FormInput type="number" value={sketchSeed} onChange={(v) => setSketchSeed(Number(v))} min={0} max={2147483647} />
        </div>
    </div>
);

// ─── Diagram Tab Settings ────────────────────────────────────────────────────

interface DiagramSettingsProps {
    style: string;
    setStyle: (v: string) => void;
}

export const DiagramSettings = ({ style, setStyle }: DiagramSettingsProps) => (
    <div style={{ marginBottom: "14px", maxWidth: LAYOUT.formMaxWidth }}>
        <FormLabel>Diagram Type:</FormLabel>
        <FormSelect value={style} onChange={setStyle}>
            <option value="flowchart">Flowchart</option>
            <option value="sequence">Sequence Diagram</option>
            <option value="class">Class Diagram</option>
            <option value="mindmap">Mind Map</option>
        </FormSelect>
    </div>
);
