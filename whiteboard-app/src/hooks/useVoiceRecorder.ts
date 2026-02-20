/**
 * useVoiceRecorder — Mic recording hook with automatic STT transcription.
 *
 * Records audio using MediaRecorder API, converts to base64,
 * sends to the ElevenLabs STT endpoint, and returns the transcribed text.
 *
 * @example
 *   const { isRecording, isTranscribing, startRecording, stopRecording, error } = useVoiceRecorder({
 *       onTranscript: (text) => setPrompt(prev => prev + text),
 *   });
 */
import { useState, useRef, useCallback } from "react";
import { apiFetch, getErrorMessage } from "../utils/apiClient";
import type { STTResponse } from "../utils/apiClient";

interface UseVoiceRecorderOptions {
    /** Called with the transcribed text when STT completes */
    onTranscript: (text: string) => void;
    /** Called when an error occurs */
    onError?: (message: string) => void;
    /** Max recording duration in ms (default: 60s) */
    maxDuration?: number;
}

type RecorderState = "idle" | "recording" | "transcribing";

export function useVoiceRecorder({
    onTranscript,
    onError,
    maxDuration = 60_000,
}: UseVoiceRecorderOptions) {
    const [state, setState] = useState<RecorderState>("idle");
    const [duration, setDuration] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cleanup = useCallback(() => {
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

    const transcribe = useCallback(async (audioBlob: Blob) => {
        setState("transcribing");

        try {
            // Convert blob to base64
            const buffer = await audioBlob.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), "")
            );

            const data = await apiFetch<STTResponse>("/api/ai/speech-to-text", {
                method: "POST",
                body: JSON.stringify({ audioBase64: base64 }),
            });

            if (data.text) {
                onTranscript(data.text);
            } else {
                onError?.("No speech detected. Try again.");
            }
        } catch (err) {
            onError?.(getErrorMessage(err, "Failed to transcribe audio"));
        } finally {
            setState("idle");
        }
    }, [onTranscript, onError]);

    const startRecording = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 16000,
                },
            });

            // Check supported MIME types
            const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : MediaRecorder.isTypeSupported("audio/webm")
                    ? "audio/webm"
                    : "audio/mp4";

            const recorder = new MediaRecorder(stream, { mimeType });
            mediaRecorderRef.current = recorder;
            chunksRef.current = [];

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
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

                // Only transcribe if we got meaningful audio (> 0.5s)
                if (audioBlob.size > 1000) {
                    transcribe(audioBlob);
                } else {
                    setState("idle");
                    onError?.("Recording too short. Hold the button longer.");
                }
            };

            recorder.onerror = () => {
                cleanup();
                setState("idle");
                onError?.("Microphone error. Please try again.");
            };

            recorder.start(250); // Collect in 250ms chunks
            setState("recording");
            setDuration(0);

            // Duration timer (visual feedback)
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
            setState("idle");
            if (err instanceof DOMException && err.name === "NotAllowedError") {
                onError?.("Microphone access denied. Please allow microphone access in your browser settings.");
            } else {
                onError?.(getErrorMessage(err, "Could not access microphone"));
            }
        }
    }, [cleanup, transcribe, onError, maxDuration]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current?.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    }, []);

    return {
        state,
        isRecording: state === "recording",
        isTranscribing: state === "transcribing",
        duration,
        startRecording,
        stopRecording,
    };
}
