/**
 * useLibrary — Save selected elements as a named library item, list/delete
 * items, and re-insert an item onto the canvas (Track 5, smallest viable).
 *
 * Storage: items live in the SAME IndexedDB database as the single scene
 * ('whiteboard-db', see data/LocalStorage.ts, v5 'library-items' store).
 * Library code never touches the 'scenes' store, so it cannot disturb the
 * single-scene restore path.
 *
 * ONLY Excalidraw imperative APIs used here are ones already used in
 * App.tsx (verified by reading App.tsx at main 3b6510d):
 *   - excalidrawAPI.getSceneElements()      (App export handler)
 *   - excalidrawAPI.getAppState()           (App export handler, explain bulb)
 *   - appState.selectedElementIds          (App explain bulb, cast via `as any`
 *                                            exactly as App.tsx does)
 *   - excalidrawAPI.getFiles()              (App export handler)
 *   - excalidrawAPI.addFiles(...)           (App restore + import handlers:
 *                                            files FIRST, then updateScene)
 *   - excalidrawAPI.updateScene({ elements, appState })
 *                                            (App restore + import handlers)
 * Re-insert is therefore: addFiles(item files) + updateScene with the
 * existing scene elements plus the cloned item elements, with the current
 * appState passed through — the same call shape App.tsx already uses.
 * No other Excalidraw API is assumed. (This file is still UNVERIFIED at
 * runtime: no build/test run was possible in this track — see README.)
 *
 * Known smallest-viable limitation: when a cloned element's id already
 * exists on the canvas it gets a fresh id, but arrow bindings / container
 * references that pointed at the old id are NOT remapped. In the normal
 * case (inserting into a different board or an empty area) ids are kept
 * exactly, so bindings survive. A full binding remap is out of scope.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import {
    listLibraryItems,
    saveLibraryItem,
    deleteLibraryItem,
    type LibraryItem,
} from '../data/LocalStorage';

const INSERT_OFFSET = 24;

function cloneElements(elements: readonly unknown[]): Array<Record<string, unknown>> {
    // Plain JSON clone: library elements are plain Excalidraw element objects
    // (the same shape saveScene already stores as `unknown[]`).
    return JSON.parse(JSON.stringify(elements)) as Array<Record<string, unknown>>;
}

function freshId(index: number): string {
    return `lib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${index}`;
}

/**
 * Re-insert a library item onto the canvas via the given imperative API.
 * Returns the number of elements inserted. Pure helper (no React state),
 * so App or any component can call it directly.
 */
export function insertLibraryItem(
    api: ExcalidrawImperativeAPI,
    item: LibraryItem,
): number {
    if (item.elements.length === 0) return 0;

    // Files first, exactly as App's restore/import handlers do.
    if (item.files && Object.keys(item.files).length > 0) {
        api.addFiles(Object.values(item.files) as never);
    }

    const existing = api.getSceneElements() as unknown as Array<Record<string, unknown>>;
    const existingIds = new Set(existing.map((el) => el.id as string));

    const cloned = cloneElements(item.elements).map((el, i) => {
        // Fresh id only on collision; otherwise keep the original id so any
        // bindings between the inserted elements keep working.
        if (existingIds.has(el.id as string)) el.id = freshId(i);
        // Nudge so the insert does not land exactly on top of the original.
        if (typeof el.x === 'number') el.x += INSERT_OFFSET;
        if (typeof el.y === 'number') el.y += INSERT_OFFSET;
        return el;
    });

    api.updateScene({
        elements: [...existing, ...cloned] as unknown as OrderedExcalidrawElement[],
        appState: api.getAppState(),
    });
    return cloned.length;
}

export function useLibrary() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async (): Promise<LibraryItem[]> => {
        const all = await listLibraryItems();
        setItems(all);
        setLoading(false);
        return all;
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    /**
     * Save the CURRENTLY SELECTED elements as a named library item.
     * Selection is read the same way App's explain bulb does:
     * getAppState().selectedElementIds + getSceneElements() filtered by id.
     * Returns the saved item, or null when nothing is selected (caller
     * should tell the user to select something first).
     */
    const saveSelected = useCallback(async (
        api: ExcalidrawImperativeAPI,
        name: string,
    ): Promise<LibraryItem | null> => {
        const appState = api.getAppState();
        const selIds = Object.keys(
            ((appState as unknown as { selectedElementIds?: Record<string, boolean> }).selectedElementIds) || {},
        );
        if (selIds.length === 0) return null;
        const selected = (api.getSceneElements() as unknown as Array<Record<string, unknown>>)
            .filter((el) => selIds.includes(el.id as string));
        if (selected.length === 0) return null;
        const files = (api.getFiles() || {}) as unknown as Record<string, unknown>;
        const item = await saveLibraryItem(name, selected, files);
        if (item) await refresh();
        return item;
    }, [refresh]);

    const insert = useCallback((api: ExcalidrawImperativeAPI, id: string): number => {
        const item = items.find((it) => it.id === id);
        if (!item) return 0;
        return insertLibraryItem(api, item);
    }, [items]);

    const remove = useCallback(async (id: string): Promise<void> => {
        await deleteLibraryItem(id);
        await refresh();
    }, [refresh]);

    return { items, loading, refresh, saveSelected, insertItem: insert, deleteItem: remove };
}
