import { useEffect } from "react";

/**
 * Block Excalidraw keyboard shortcuts while a dialog is open.
 *
 * Excalidraw registers capture-phase document listeners for shortcuts
 * (spacebar → pan, letter keys → tool shortcuts). This hook adds our
 * own capture-phase listeners that call stopImmediatePropagation() on
 * every keyboard event while `isActive` is true, preventing Excalidraw
 * from stealing focus from inputs/textareas.
 *
 * Escape is exempted so the dialog can still be closed with the keyboard.
 */
export function useBlockExcalidrawKeys(isActive: boolean) {
    useEffect(() => {
        if (!isActive) return;

        const block = (e: KeyboardEvent) => {
            if (e.key === "Escape") return;
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        document.addEventListener("keydown", block, true);
        document.addEventListener("keyup", block, true);
        document.addEventListener("keypress", block, true);

        return () => {
            document.removeEventListener("keydown", block, true);
            document.removeEventListener("keyup", block, true);
            document.removeEventListener("keypress", block, true);
        };
    }, [isActive]);
}
