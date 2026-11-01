/**
 * useAppShell — dropdown + voice-command shell state for App.
 *
 * Extracted verbatim (no behaviour change) from whiteboard-app/src/App.tsx:
 * - the sparkle-dropdown open/close state and its click-outside handling
 * - the voice-command pending-command state plus its handlers
 *   (handleVoiceCommand, handleVoiceError, handleVoiceCommandDone and the
 *   useVoiceCommand wiring)
 *
 * App keeps owning `isAIToolsOpen` itself. A classified voice command opens
 * that dialog, so App passes a stable callback for it (`onVoiceCommand`);
 * the hook only calls it, exactly as App's original handleVoiceCommand
 * called setIsAIToolsOpen(true). Keeping the dialog state in App avoids
 * moving unrelated AI-dialog logic into this shell hook.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { useVoiceCommand } from "./useVoiceCommand";
import type { VoiceCommandResult } from "./useVoiceCommand";

export interface UseAppShellOptions {
    /** Called when a voice command is classified (App opens the AI Tools dialog). */
    onVoiceCommand?: () => void;
}

export function useAppShell({ onVoiceCommand }: UseAppShellOptions = {}) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Voice command state: stores the classified command to pass to AIToolsDialog
    const [pendingVoiceCommand, setPendingVoiceCommand] = useState<VoiceCommandResult | null>(null);

    // ─── Voice Command System ────────────────────────────────────────
    const handleVoiceCommand = useCallback((result: VoiceCommandResult) => {
        // Store the command and open the dialog — the dialog will auto-execute it
        setPendingVoiceCommand(result);
        onVoiceCommand?.();
        setIsDropdownOpen(false);
    }, [onVoiceCommand]);

    const handleVoiceError = useCallback((msg: string) => {
        console.error("[VoiceCommand]", msg);
        // Could show a toast here in the future
    }, []);

    const voiceCmd = useVoiceCommand({
        onCommand: handleVoiceCommand,
        onError: handleVoiceError,
    });

    const handleVoiceCommandDone = useCallback(() => {
        setPendingVoiceCommand(null);
        voiceCmd.resetPhase();
    }, [voiceCmd.resetPhase]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return {
        isDropdownOpen,
        setIsDropdownOpen,
        dropdownRef,
        pendingVoiceCommand,
        voiceCmd,
        handleVoiceCommandDone,
    };
}
