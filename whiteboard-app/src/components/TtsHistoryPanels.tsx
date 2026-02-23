import React from "react";
import { FormLabel, FormTextarea, FormSelect } from "./FormComponents";
import type { AIHistoryEntry, AIHistoryType } from "../types/ai-tools";

// ─── TTS Tab Panel ───────────────────────────────────────────────────────────

interface TtsTabPanelProps {
    tts: {
        text: string;
        setText: (v: string) => void;
        audio: string | null;
        audioRef: React.Ref<HTMLAudioElement>;
        voice: string;
        setVoice: (v: string) => void;
        voices: Array<{ id: string; name: string; category: string }>;
        loadingVoices: boolean;
        speak: () => void;
        reset: () => void;
    };
    loading: boolean;
}

export const TtsTabPanel = React.memo(({ tts, loading }: TtsTabPanelProps) => (
    <div style={{ marginBottom: "14px", maxWidth: "480px" }}>
        <audio ref={tts.audioRef} style={{ display: "none" }} />

        <FormLabel>Text to speak:</FormLabel>
        <FormTextarea
            value={tts.text}
            onChange={tts.setText}
            placeholder="Enter or paste text here to convert to speech..."
        />

        <div style={{ marginTop: "12px" }}>
            <FormLabel>Voice:</FormLabel>
            <FormSelect value={tts.voice} onChange={tts.setVoice}>
                {tts.loadingVoices ? (
                    <option>Loading voices...</option>
                ) : tts.voices.length === 0 ? (
                    <option>No voices available</option>
                ) : (
                    tts.voices.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                            {voice.name} ({voice.category})
                        </option>
                    ))
                )}
            </FormSelect>
        </div>

        <button
            className={`ai-speak-btn${loading ? " ai-generate-btn--loading" : ""}`}
            onClick={tts.speak}
            disabled={loading || !tts.text.trim()}
            style={{ marginTop: "14px" }}
        >
            {loading ? "Generating speech..." : "🔊 Speak Text"}
        </button>

        {tts.audio && (
            <div className="ai-audio-result">
                <label>✅ Audio Generated:</label>
                <audio controls src={tts.audio} />
                <button className="ai-btn-secondary" onClick={tts.reset} style={{ marginTop: "8px" }}>
                    🔄 New
                </button>
            </div>
        )}
    </div>
));

TtsTabPanel.displayName = "TtsTabPanel";

// ─── History Tab Panel ───────────────────────────────────────────────────────

const TYPE_META: Record<string, { label: string; color: string }> = {
    diagram: { label: "Diagram", color: "#818cf8" },
    image: { label: "Image", color: "#34d399" },
    sketch: { label: "Sketch", color: "#f472b6" },
    ocr: { label: "OCR", color: "#fbbf24" },
    tts: { label: "TTS", color: "#60a5fa" },
};

const FILTERS: Array<AIHistoryType | "all"> = ["all", "diagram", "image", "sketch", "ocr", "tts"];

interface HistoryTabPanelProps {
    filteredHistory: AIHistoryEntry[];
    allHistory: AIHistoryEntry[];
    historyFilter: AIHistoryType | "all";
    setHistoryFilter: (f: AIHistoryType | "all") => void;
    deleteEntry: (id: string) => void;
    clearAll: () => void;
    reuseEntry?: (entry: AIHistoryEntry) => void;
}

export const HistoryTabPanel = React.memo(({
    filteredHistory, allHistory,
    historyFilter, setHistoryFilter,
    deleteEntry, clearAll, reuseEntry,
}: HistoryTabPanelProps) => (
    <div style={{ maxWidth: "560px" }}>
        {/* Filter bar */}
        <div className="ai-filter-bar">
            {FILTERS.map(f => (
                <button
                    key={f}
                    className={`ai-filter-pill${historyFilter === f ? " ai-filter-pill--active" : ""}`}
                    onClick={() => setHistoryFilter(f)}
                >
                    {f === "all" ? "All" : TYPE_META[f].label}
                </button>
            ))}
            {allHistory.length > 0 && (
                <button className="ai-filter-pill ai-filter-pill--danger" onClick={clearAll}>
                    Clear all
                </button>
            )}
        </div>

        {/* Empty state */}
        {filteredHistory.length === 0 && (
            <div className="ai-empty-state">
                <div className="emoji">🕐</div>
                <div className="title">No history yet.</div>
                <div className="subtitle">Generated content will appear here.</div>
            </div>
        )}

        {/* History list */}
        <div className="ai-history-list">
            {filteredHistory.map(entry => {
                const meta = TYPE_META[entry.type];
                const date = new Date(entry.timestamp);
                const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });

                return (
                    <div key={entry.id} className="ai-history-card">
                        <span
                            className="ai-history-badge"
                            style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
                        >
                            {meta.label}
                        </span>
                        <span className="ai-history-prompt">{entry.prompt}</span>
                        <span className="ai-history-time">{dateStr} {timeStr}</span>
                        {reuseEntry && (
                            <button
                                className="ai-history-reuse"
                                title="Add to canvas"
                                onClick={() => reuseEntry(entry)}
                            >
                                ✓
                            </button>
                        )}
                        <button
                            className="ai-history-delete"
                            title="Delete"
                            onClick={() => deleteEntry(entry.id)}
                        >
                            ✕
                        </button>
                    </div>
                );
            })}
        </div>
    </div>
));

HistoryTabPanel.displayName = "HistoryTabPanel";
