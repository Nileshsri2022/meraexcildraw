/**
 * useAIExplain — Reusable hook for "Explain with AI" functionality.
 *
 * Streams an AI explanation from the chat service via SSE.
 * Can handle both text and image explanations (vision model).
 *
 * Usage:
 *   const ai = useAIExplain();
 *   ai.explain({ text: "What is React?" });           // text explain
 *   ai.explain({ text: "", imageData: dataUrl });      // image explain
 *   ai.regenerate();                                   // re-ask with better clarity
 *   ai.cancel();                                       // abort in-flight request
 *   ai.reset();                                        // clear state
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchEventSource } from "@microsoft/fetch-event-source";

// ─── Public types ────────────────────────────────────────────────────────────

export interface AIExplainState {
    /** Whether an AI request is in progress */
    loading: boolean;
    /** The streamed response accumulated so far */
    response: string;
    /** The original prompt text */
    prompt: string;
    /** Image data URI (if the request was for an image) */
    imageData?: string;
    /** Session ID for follow-up / regenerate requests */
    sessionId?: string;
}

export interface AIExplainContent {
    /** Selected text to explain */
    text: string;
    /** Optional base-64 / data-URI image to explain (triggers vision model) */
    imageData?: string;
}

export interface UseAIExplainOptions {
    /** Override the chat service base URL. Defaults to VITE_CHAT_URL || localhost:3003 */
    chatServiceUrl?: string;
    /** Custom system prompt prefix for text explanations */
    textPrompt?: (text: string) => string;
    /** Custom system prompt prefix for image explanations */
    imagePrompt?: (text: string) => string;
    /** Custom regeneration prompt for text */
    regenerateTextPrompt?: (text: string) => string;
    /** Custom regeneration prompt for images */
    regenerateImagePrompt?: (text: string) => string;
}

export interface UseAIExplainReturn {
    /** Current AI explain state */
    state: AIExplainState;
    /** Start explaining content (text and/or image) */
    explain: (content: AIExplainContent) => void;
    /** Regenerate with a "better clarity" follow-up in the same session */
    regenerate: () => void;
    /** Abort the in-flight request and clear state */
    cancel: () => void;
    /** Clear state without aborting (use after accepting the result) */
    reset: () => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CHAT_URL =
    (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_CHAT_URL) ||
    "http://localhost:3003";

const defaultTextPrompt = (text: string) =>
    `Explain the following text concisely and clearly:\n\n"${text}"`;

const defaultImagePrompt = (text: string) =>
    `Explain this image concisely. What does it show? ${text ? `Context: "${text}"` : ""}`;

const defaultRegenerateText = (text: string) =>
    `The previous explanation wasn't clear enough. Please provide a more detailed, clearer, and better-structured explanation of:\n\n"${text}"`;

const defaultRegenerateImage = (text: string) =>
    `The previous explanation wasn't clear enough. Please provide a more detailed and clearer explanation of this image. ${text ? `Context: "${text}"` : ""}`;

// ─── Initial state ───────────────────────────────────────────────────────────

const INITIAL_STATE: AIExplainState = {
    loading: false,
    response: "",
    prompt: "",
};

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useAIExplain(options: UseAIExplainOptions = {}): UseAIExplainReturn {
    const {
        chatServiceUrl = DEFAULT_CHAT_URL,
        textPrompt = defaultTextPrompt,
        imagePrompt = defaultImagePrompt,
        regenerateTextPrompt = defaultRegenerateText,
        regenerateImagePrompt = defaultRegenerateImage,
    } = options;

    const [state, setState] = useState<AIExplainState>(INITIAL_STATE);

    // Keep a ref to the AbortController so we can cancel without stale closures
    const controllerRef = useRef<AbortController | null>(null);

    // ── Internal: fire SSE request ───────────────────────────────────────
    const sendRequest = useCallback(
        (message: string, imageData?: string, sessionId?: string) => {
            // Abort any previous request
            controllerRef.current?.abort();

            const controller = new AbortController();
            controllerRef.current = controller;

            setState((prev) => ({
                ...prev,
                loading: true,
                response: "",
                sessionId: sessionId ?? prev.sessionId,
            }));

            let accumulated = "";
            let newSessionId = sessionId;

            fetchEventSource(`${chatServiceUrl}/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message,
                    session_id: sessionId || undefined,
                    image_data: imageData || undefined,
                }),
                signal: controller.signal,
                openWhenHidden: true,
                onmessage(event) {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === "token" && data.token) {
                            accumulated += data.token;
                            setState((prev) => ({ ...prev, response: accumulated }));
                        } else if (data.type === "done") {
                            newSessionId = data.session_id || newSessionId;
                            setState((prev) => ({
                                ...prev,
                                loading: false,
                                sessionId: newSessionId,
                            }));
                        } else if (data.type === "error") {
                            setState((prev) => ({
                                ...prev,
                                loading: false,
                                response: prev.response || `Error: ${data.error}`,
                            }));
                        }
                    } catch {
                        // ignore parse errors from partial chunks
                    }
                },
                onerror(err) {
                    console.error("AI Explain SSE error:", err);
                    setState((prev) => ({
                        ...prev,
                        loading: false,
                        response: prev.response || "Failed to reach AI service.",
                    }));
                },
            });
        },
        [chatServiceUrl],
    );

    // ── explain(content) ─────────────────────────────────────────────────
    const explain = useCallback(
        (content: AIExplainContent) => {
            const message = content.imageData
                ? imagePrompt(content.text)
                : textPrompt(content.text);

            setState({
                loading: true,
                response: "",
                prompt: content.text,
                imageData: content.imageData,
            });

            sendRequest(message, content.imageData);
        },
        [sendRequest, textPrompt, imagePrompt],
    );

    // ── regenerate() ─────────────────────────────────────────────────────
    const regenerate = useCallback(() => {
        const message = state.imageData
            ? regenerateImagePrompt(state.prompt)
            : regenerateTextPrompt(state.prompt);

        setState((prev) => ({ ...prev, loading: true, response: "" }));
        sendRequest(message, state.imageData, state.sessionId);
    }, [state.prompt, state.imageData, state.sessionId, sendRequest, regenerateTextPrompt, regenerateImagePrompt]);

    // ── cancel() ─────────────────────────────────────────────────────────
    const cancel = useCallback(() => {
        controllerRef.current?.abort();
        controllerRef.current = null;
        setState(INITIAL_STATE);
    }, []);

    // ── reset() ──────────────────────────────────────────────────────────
    const reset = useCallback(() => {
        setState(INITIAL_STATE);
    }, []);

    // ── Cleanup on unmount ───────────────────────────────────────────────
    useEffect(() => {
        return () => {
            controllerRef.current?.abort();
        };
    }, []);

    return { state, explain, regenerate, cancel, reset };
}
