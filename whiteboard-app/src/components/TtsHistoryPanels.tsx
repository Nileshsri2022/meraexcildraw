import React from "react";
import { FormLabel, FormTextarea, FormSelect, InfoBanner } from "./FormComponents";
import type { AIHistoryEntry, AIHistoryType } from "../data/LocalStorage";

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

export const TtsTabPanel = ({ tts, loading }: TtsTabPanelProps) => (
    <div style={{ marginBottom: "14px", maxWidth: "480px" }}>
        {/* Hidden audio element for playback */}
        <audio ref={tts.audioRef} style={{ display: "none" }} />

        <InfoBanner color="indigo">
            💡 <strong>Tip:</strong> Copy text from canvas (Ctrl+C), then open this tab. Text will auto-fill.
        </InfoBanner>

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
            onClick={tts.speak}
            disabled={loading || !tts.text.trim()}
            style={{
                marginTop: "14px",
                width: "100%",
                padding: "12px 20px",
                borderRadius: "8px",
                border: "none",
                backgroundColor: (loading || !tts.text.trim()) ? "#4b5563" : "#10b981",
                color: "#ffffff",
                cursor: (loading || !tts.text.trim()) ? "not-allowed" : "pointer",
                fontSize: "14px",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
            }}
        >
            {loading ? (
                <>
                    <span style={{
                        width: "14px", height: "14px",
                        border: "2px solid transparent", borderTopColor: "#fff",
                        borderRadius: "50%", animation: "spin 0.8s linear infinite",
                    }} />
                    Generating speech...
                </>
            ) : "🔊 Speak Text"}
        </button>

        {tts.audio && (
            <div style={{ marginTop: "16px" }}>
                <label style={{
                    display: "block", marginBottom: "8px",
                    color: "#10b981", fontSize: "13px", fontWeight: 500,
                }}>✅ Audio Generated:</label>
                <audio controls src={tts.audio} style={{ width: "100%", borderRadius: "8px" }} />
                <button
                    onClick={tts.reset}
                    style={{
                        marginTop: "8px", padding: "8px 14px", borderRadius: "6px",
                        border: "1px solid rgba(255,255,255,0.2)",
                        backgroundColor: "transparent", color: "#9ca3af",
                        cursor: "pointer", fontSize: "12px",
                    }}
                >
                    🔄 New
                </button>
            </div>
        )}
    </div>
);

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
}

export const HistoryTabPanel = ({
    filteredHistory, allHistory,
    historyFilter, setHistoryFilter,
    deleteEntry, clearAll,
}: HistoryTabPanelProps) => (
    <div style={{ maxWidth: "560px" }}>
        {/* Filter bar */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
            {FILTERS.map(f => (
                <button key={f} onClick={() => setHistoryFilter(f)} style={{
                    padding: "4px 12px", borderRadius: "20px", border: "none", cursor: "pointer",
                    fontSize: "11px", fontWeight: 500,
                    backgroundColor: historyFilter === f ? "rgba(99,102,241,0.25)" : "rgba(255,255,255,0.06)",
                    color: historyFilter === f ? "#a5b4fc" : "#9ca3af",
                    transition: "all 0.15s ease",
                }}>
                    {f === "all" ? "All" : TYPE_META[f].label}
                </button>
            ))}
            {allHistory.length > 0 && (
                <button onClick={clearAll} style={{
                    marginLeft: "auto", padding: "4px 12px", borderRadius: "20px",
                    border: "1px solid rgba(239,68,68,0.3)", cursor: "pointer",
                    fontSize: "11px", backgroundColor: "transparent", color: "#f87171",
                }}>
                    Clear all
                </button>
            )}
        </div>

        {/* Empty state */}
        {filteredHistory.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#6b7280" }}>
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>🕐</div>
                <div style={{ fontSize: "13px" }}>No history yet.</div>
                <div style={{ fontSize: "12px", marginTop: "4px" }}>Generated content will appear here.</div>
            </div>
        )}

        {/* History list */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {filteredHistory.map(entry => {
                const meta = TYPE_META[entry.type];
                const date = new Date(entry.timestamp);
                const timeStr = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const dateStr = date.toLocaleDateString([], { month: "short", day: "numeric" });

                return (
                    <div key={entry.id} style={{
                        display: "flex", alignItems: "center", gap: "10px",
                        padding: "8px 10px", borderRadius: "8px",
                        backgroundColor: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.06)",
                    }}>
                        <span style={{
                            fontSize: "10px", fontWeight: 600, padding: "2px 8px",
                            borderRadius: "10px", backgroundColor: `${meta.color}22`,
                            color: meta.color, flexShrink: 0, whiteSpace: "nowrap",
                        }}>
                            {meta.label}
                        </span>
                        <span style={{
                            flex: 1, minWidth: 0, fontSize: "12px", color: "#d1d5db",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {entry.prompt}
                        </span>
                        <span style={{ fontSize: "10px", color: "#6b7280", flexShrink: 0, whiteSpace: "nowrap" }}>
                            {dateStr} {timeStr}
                        </span>
                        <button title="Delete" onClick={() => deleteEntry(entry.id)} style={{
                            padding: "2px 6px", borderRadius: "4px", border: "none", cursor: "pointer",
                            fontSize: "11px", backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171",
                            flexShrink: 0, lineHeight: 1,
                        }}>✕</button>
                    </div>
                );
            })}
        </div>
    </div>
);
