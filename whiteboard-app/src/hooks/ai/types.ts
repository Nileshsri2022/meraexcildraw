/**
 * Shared context passed to each AI generation sub-hook.
 *
 * Enables sub-hooks to coordinate on shared UI state
 * (loading spinner, error banner, prompt field) without
 * prop-drilling or lifting everything into the coordinator.
 */
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

export interface AIGenerationContext {
    excalidrawAPI: ExcalidrawImperativeAPI | null;
    onClose: () => void;
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setError: React.Dispatch<React.SetStateAction<string | null>>;
}
