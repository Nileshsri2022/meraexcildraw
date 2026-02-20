import { useState, useCallback, useRef, useEffect } from "react";
import { saveAIResult } from "../data/LocalStorage";

const AI_SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3002";

interface Voice {
    id: string;
    name: string;
    category: string;
}

/**
 * Custom hook encapsulating all Text-to-Speech state, voice
 * fetching, clipboard auto-read, and the speak callback.
 *
 * `isActive` should be true when the TTS tab is visible and the dialog is open.
 */
export function useTTS(
    isActive: boolean,
    setLoading: (v: boolean) => void,
    setError: (v: string | null) => void,
) {
    const [text, setText] = useState("");
    const [audio, setAudio] = useState<string | null>(null);
    const [voice, setVoice] = useState("");
    const [voices, setVoices] = useState<Voice[]>([]);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Fetch available voices (once per session)
    useEffect(() => {
        if (!isActive || voices.length > 0) return;

        let cancelled = false;
        setLoadingVoices(true);

        fetch(`${AI_SERVER_URL}/api/ai/voices`)
            .then((r) => (r.ok ? r.json() : Promise.reject(r)))
            .then((data) => {
                if (cancelled) return;
                setVoices(data.voices);
                if (data.voices.length > 0 && !voice) {
                    setVoice(data.voices[0].id);
                }
            })
            .catch(() => { /* silently fail – voices not critical */ })
            .finally(() => { if (!cancelled) setLoadingVoices(false); });

        return () => { cancelled = true; };
    }, [isActive, voices.length, voice]);

    // Auto-read clipboard when tab opens
    useEffect(() => {
        if (!isActive) return;
        navigator.clipboard.readText()
            .then((t) => { if (t?.trim()) setText(t); })
            .catch(() => { /* clipboard may not be available */ });
    }, [isActive]);

    const speak = useCallback(async () => {
        if (!text.trim()) {
            setError("Please enter or paste text to speak");
            return;
        }

        setLoading(true);
        setError(null);
        setAudio(null);

        try {
            const res = await fetch(`${AI_SERVER_URL}/api/ai/text-to-speech`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text, voiceId: voice }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Failed to generate speech");
            }

            const data = await res.json();
            setAudio(data.audio);

            // Save to history
            saveAIResult({ type: "tts", prompt: text, result: data.audio, metadata: { voiceId: voice } }).catch(() => { });

            // Auto-play
            if (audioRef.current) {
                audioRef.current.src = data.audio;
                audioRef.current.play();
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to generate speech");
        } finally {
            setLoading(false);
        }
    }, [text, voice, setLoading, setError]);

    const reset = useCallback(() => {
        setAudio(null);
        setText("");
    }, []);

    return {
        text, setText,
        audio, setAudio,
        voice, setVoice,
        voices, loadingVoices,
        audioRef,
        speak, reset,
    };
}
