import { useEffect, useRef, useState, useCallback } from 'react';
import { saveScene, loadScene, deleteScene, hasSavedScene } from '../data/LocalStorage';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface UseAutoSaveOptions {
    enabled?: boolean;
    debounceMs?: number;
}

interface UseAutoSaveReturn {
    saveStatus: SaveStatus;
    lastSaved: Date | null;
    triggerSave: (
        elements: readonly unknown[],
        appState: Record<string, unknown>,
        files: Record<string, unknown>
    ) => void;
    clearSavedData: () => Promise<void>;
    loadSavedData: () => Promise<{
        elements: unknown[];
        appState: Record<string, unknown>;
        files: Record<string, unknown>;
    } | null>;
    hasSaved: boolean;
}

export function useAutoSave(options: UseAutoSaveOptions = {}): UseAutoSaveReturn {
    const { enabled = true, debounceMs = 5000 } = options;

    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [hasSaved, setHasSaved] = useState(false);

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDataRef = useRef<{
        elements: readonly unknown[];
        appState: Record<string, unknown>;
        files: Record<string, unknown>;
    } | null>(null);

    // Check if there's saved data on mount
    useEffect(() => {
        hasSavedScene().then(setHasSaved);
    }, []);

    // Perform the actual save
    const performSave = useCallback(async () => {
        if (!pendingDataRef.current) return;

        const { elements, appState, files } = pendingDataRef.current;

        // Don't save empty scenes
        if (elements.length === 0) return;

        try {
            setSaveStatus('saving');
            await saveScene(elements as never[], appState, files);
            setLastSaved(new Date());
            setSaveStatus('saved');
            setHasSaved(true);

            // Reset to idle after 2 seconds
            setTimeout(() => setSaveStatus('idle'), 2000);
        } catch (error) {
            console.error('[useAutoSave] Save failed:', error);
            setSaveStatus('error');
        }
    }, []);

    // Trigger save with debounce
    const triggerSave = useCallback((
        elements: readonly unknown[],
        appState: Record<string, unknown>,
        files: Record<string, unknown>
    ) => {
        if (!enabled) return;

        // Store pending data
        pendingDataRef.current = { elements, appState, files };

        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Schedule save
        saveTimeoutRef.current = setTimeout(performSave, debounceMs);
    }, [enabled, debounceMs, performSave]);

    // Load saved data
    const loadSavedData = useCallback(async () => {
        return await loadScene();
    }, []);

    // Clear saved data
    const clearSavedData = useCallback(async () => {
        await deleteScene();
        setHasSaved(false);
        setLastSaved(null);
        setSaveStatus('idle');
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    return {
        saveStatus,
        lastSaved,
        triggerSave,
        clearSavedData,
        loadSavedData,
        hasSaved,
    };
}
