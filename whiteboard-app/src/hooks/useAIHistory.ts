import { useState, useEffect, useCallback } from "react";
import {
    getAIHistory,
    deleteAIHistoryEntry,
    clearAIHistory,
} from "../data/LocalStorage";
import type { AIHistoryEntry, AIHistoryType } from "../data/LocalStorage";

/**
 * Custom hook to manage AI generation history stored in IndexedDB.
 *
 * Loads history when `shouldLoad` transitions to true (e.g. when the
 * History tab becomes active), and exposes filtering, deletion, and
 * clearing functionality.
 */
export function useAIHistory(shouldLoad: boolean) {
    const [history, setHistory] = useState<AIHistoryEntry[]>([]);
    const [filter, setFilter] = useState<AIHistoryType | "all">("all");

    // Load from IndexedDB when activated
    useEffect(() => {
        if (shouldLoad) {
            getAIHistory().then(setHistory).catch(() => setHistory([]));
        }
    }, [shouldLoad]);

    const filtered = filter === "all"
        ? history
        : history.filter((e) => e.type === filter);

    const deleteEntry = useCallback(async (id: string) => {
        await deleteAIHistoryEntry(id);
        setHistory((prev) => prev.filter((e) => e.id !== id));
    }, []);

    const clearAll = useCallback(async () => {
        await clearAIHistory();
        setHistory([]);
    }, []);

    return {
        history: filtered,
        allHistory: history,
        filter,
        setFilter,
        deleteEntry,
        clearAll,
    };
}
