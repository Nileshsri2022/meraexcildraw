/**
 * useVoiceCommand — Intelligent voice command orchestrator.
 *
 * Records audio → transcribes via STT → classifies intent via LLM →
 * auto-selects the right AI tool → sets the prompt → triggers generation.
 *
 * This is the "say it and it happens" engine.
 */
import { useState, useRef, useCallback } from "react";
import { apiFetch, getErrorMessage } from "../utils/apiClient";
import type { VoiceCommandResponse, STTResponse } from "../utils/apiClient";

type VoiceCommandPhase =
    | "idle"
    | "recording"
    | "transcribing"
    | "classifying"
    | "executing";

/** Human-readable labels for each phase */
export const PHASE_LABELS: Record<VoiceCommandPhase, string> = {
    idle: "",
    recording: "Listening…",
    transcribing: "Transcribing…",
    classifying: "Understanding…",
    executing: "Generating…",
};

export interface VoiceCommandResult {
    tool: "image" | "diagram" | "sketch" | "tts" | "ocr";
    prompt: string;
    style?: string;
    transcript: string;
}

interface UseVoiceCommandOptions {
    /** Called when the intent has been classified and we're about to generate.
     *  The consumer should switch tabs, set the prompt, and trigger generation. */
    onCommand: (result: VoiceCommandResult) => void;
    /** Called when an error occurs */
    onError?: (message: string) => void;
    /** Max recording duration in ms (default: 30s for voice commands) */
    maxDuration?: number;
}

export function useVoiceCommand({
    onCommand,
    onError,
    maxDuration = 30_000,
}: UseVoiceCommandOptions) {
    const [phase, setPhase] = useState<VoiceCommandPhase>("idle");
    const [duration, setDuration] = useState(0);
    const [lastResult, setLastResult] = useState<VoiceCommandResult | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cleanupRecording = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (maxTimerRef.current) {
            clearTimeout(maxTimerRef.current);
            maxTimerRef.current = null;
        }
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        setDuration(0);
    }, []);

    /**
     * Pipeline: audio blob → STT → intent classification → execute
     */
    const processAudio = useCallback(async (audioBlob: Blob) => {
        try {
            // ── Phase 1: Transcribe ───────────────────────────────────────
            setPhase("transcribing");

            const buffer = await audioBlob.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), "")
            );

            const sttData = await apiFetch<STTResponse>("/api/ai/speech-to-text", {
                method: "POST",
                body: JSON.stringify({ audioBase64: base64 }),
            });

            if (!sttData.text?.trim()) {
                onError?.("No speech detected. Try again.");
                setPhase("idle");
                return;
            }

            const transcript = sttData.text.trim();
            console.log(`[VoiceCommand] Transcript: "${transcript}"`);

            // ── Phase 2: Classify Intent ──────────────────────────────────
            setPhase("classifying");

            const classification = await apiFetch<VoiceCommandResponse>("/api/ai/voice-command", {
                method: "POST",
                body: JSON.stringify({ transcript }),
            });

            console.log(`[VoiceCommand] Classification:`, classification);

            const result: VoiceCommandResult = {
                tool: classification.tool,
                prompt: classification.prompt || transcript,
                style: classification.style,
                transcript,
            };

            setLastResult(result);

            // ── Phase 3: Execute ──────────────────────────────────────────
            setPhase("executing");
            onCommand(result);

        } catch (err) {
            onError?.(getErrorMessage(err, "Voice command failed"));
        } finally {
            // The executing phase will be cleared by the consumer
            // when generation completes. We set back to idle here
            // as a safety net after a timeout.
            setTimeout(() => {
                setPhase(prev => prev === "executing" ? "idle" : prev);
            }, 60_000);
        }
    }, [onCommand, onError]);

    const startListening = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                },
            });

            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : MediaRecorder.isTypeSupported("audio/webm")
                    ? "audio/webm"
                    : "audio/mp4";

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            recorder.onstop = () => {
                const audioBlob = new Blob(chunksRef.current, { type: mimeType });
                stream.getTracks().forEach(t => t.stop());

                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }
                if (maxTimerRef.current) {
                    clearTimeout(maxTimerRef.current);
                    maxTimerRef.current = null;
                }

                // Only process if we got meaningful audio (> 0.5s)
                if (audioBlob.size > 1000) {
                    processAudio(audioBlob);
                } else {
                    setPhase("idle");
                    onError?.("Recording too short. Hold the button longer.");
                }
            };

            recorder.onerror = () => {
                cleanupRecording();
                setPhase("idle");
                onError?.("Microphone error. Please try again.");
            };

            recorder.start(250);
            setPhase("recording");
            setDuration(0);

            // Duration timer
            const startTime = Date.now();
            timerRef.current = setInterval(() => {
                setDuration(Math.floor((Date.now() - startTime) / 1000));
            }, 1000);

            // Auto-stop after maxDuration
            maxTimerRef.current = setTimeout(() => {
                if (mediaRecorderRef.current?.state === "recording") {
                    mediaRecorderRef.current.stop();
                }
            }, maxDuration);

        } catch (err) {
            setPhase("idle");
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                onError?.("Microphone access denied. Allow microphone in browser settings.");
            } else {
                onError?.(getErrorMessage(err, "Could not access microphone"));
            }
        }
    }, [cleanupRecording, processAudio, onError, maxDuration]);

    const stopListening = useCallback(() => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    }, []);

    /** Reset to idle (call after generation completes) */
    const resetPhase = useCallback(() => {
        setPhase("idle");
    }, []);

    return {
        phase,
        phaseLabel: PHASE_LABELS[phase],
        isIdle: phase === "idle",
        isRecording: phase === "recording",
        isBusy: phase !== "idle" && phase !== "recording",
        duration,
        lastResult,
        startListening,
        stopListening,
        resetPhase,
    };
}
