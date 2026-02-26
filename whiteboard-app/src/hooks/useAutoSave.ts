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
    const { enabled = true, debounceMs = 2000 } = options;

    const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [hasSaved, setHasSaved] = useState(false);

    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingDataRef = useRef<{
        elements: readonly unknown[];
        appState: Record<string, unknown>;
        files: Record<string, unknown>;
    } | null>(null);
    const isSavingRef = useRef(false);

    // Check if there's saved data on mount
    useEffect(() => {
        hasSavedScene().then(setHasSaved);
    }, []);

    // Perform the actual save
    const performSave = useCallback(async () => {
        if (!pendingDataRef.current || isSavingRef.current) return;

        const { elements, appState, files } = pendingDataRef.current;
        pendingDataRef.current = null;

        // Don't save empty scenes
        if (elements.length === 0) return;

        isSavingRef.current = true;
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
        } finally {
            isSavingRef.current = false;
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

    // Flush pending save immediately (for beforeunload / unmount)
    const flushSave = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        if (pendingDataRef.current) {
            const { elements, appState, files } = pendingDataRef.current;
            pendingDataRef.current = null;
            if (elements.length > 0) {
                // Fire-and-forget — we can't await in beforeunload
                saveScene(elements as never[], appState, files).catch((e) =>
                    console.error('[useAutoSave] Flush save failed:', e)
                );
            }
        }
    }, []);

    // Save on page refresh / close
    useEffect(() => {
        const handleBeforeUnload = () => {
            flushSave();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            // Also flush on unmount
            flushSave();
        };
    }, [flushSave]);

    // Cleanup timeout on unmount (flushSave above handles the data)
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
