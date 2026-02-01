// History management for undo/redo
import { useAtom } from "jotai";
import { elementsAtom, historyAtom } from "./atoms";
import type { WhiteboardElement } from "@whiteboard/element";

const MAX_HISTORY_LENGTH = 100;

export const useHistory = () => {
    const [elements, setElements] = useAtom(elementsAtom);
    const [history, setHistory] = useAtom(historyAtom);

    // Push current state to history
    const pushHistory = () => {
        setHistory((prev) => ({
            past: [...prev.past.slice(-MAX_HISTORY_LENGTH + 1), prev.present],
            present: elements,
            future: [],
        }));
    };

    // Undo to previous state
    const undo = () => {
        if (history.past.length === 0) return;

        const previous = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);

        setHistory({
            past: newPast,
            present: previous,
            future: [history.present, ...history.future],
        });

        setElements(previous);
    };

    // Redo to next state
    const redo = () => {
        if (history.future.length === 0) return;

        const next = history.future[0];
        const newFuture = history.future.slice(1);

        setHistory({
            past: [...history.past, history.present],
            present: next,
            future: newFuture,
        });

        setElements(next);
    };

    // Check if undo/redo is available
    const canUndo = history.past.length > 0;
    const canRedo = history.future.length > 0;

    // Clear history
    const clearHistory = () => {
        setHistory({
            past: [],
            present: elements,
            future: [],
        });
    };

    return {
        pushHistory,
        undo,
        redo,
        canUndo,
        canRedo,
        clearHistory,
    };
};

export const useElements = () => {
    const [elements, setElements] = useAtom(elementsAtom);
    const { pushHistory } = useHistory();

    // Add element
    const addElement = (element: WhiteboardElement) => {
        pushHistory();
        setElements((prev) => [...prev, element]);
    };

    // Update element
    const updateElement = (id: string, updates: Partial<WhiteboardElement>) => {
        setElements((prev) =>
            prev.map((el) =>
                el.id === id
                    ? { ...el, ...updates, version: el.version + 1, updated: Date.now() }
                    : el
            )
        );
    };

    // Delete element (soft delete)
    const deleteElement = (id: string) => {
        pushHistory();
        setElements((prev) =>
            prev.map((el) =>
                el.id === id ? { ...el, isDeleted: true, updated: Date.now() } : el
            )
        );
    };

    // Delete multiple elements
    const deleteElements = (ids: string[]) => {
        pushHistory();
        const idSet = new Set(ids);
        setElements((prev) =>
            prev.map((el) =>
                idSet.has(el.id) ? { ...el, isDeleted: true, updated: Date.now() } : el
            )
        );
    };

    // Clear all elements
    const clearElements = () => {
        pushHistory();
        setElements([]);
    };

    // Replace all elements
    const replaceElements = (newElements: WhiteboardElement[]) => {
        pushHistory();
        setElements(newElements);
    };

    return {
        elements,
        addElement,
        updateElement,
        deleteElement,
        deleteElements,
        clearElements,
        replaceElements,
    };
};
