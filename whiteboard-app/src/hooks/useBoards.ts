/**
 * useBoards — Multiple boards (Track 5, smallest viable version).
 *
 * Storage: boards live in the SAME IndexedDB database as the single scene
 * ('whiteboard-db', see data/LocalStorage.ts, v5 'boards' store). The active
 * board id is kept in localStorage under ACTIVE_BOARD_KEY because it must be
 * readable synchronously on mount; if it is missing or stale it is ignored
 * and the most recently updated board is used instead.
 *
 * BACKWARD COMPATIBILITY (the no-boards fallback):
 * `resolveInitialScene()` is the ONLY restore entry point this hook offers.
 * When no boards exist it calls the untouched existing `loadScene()` — the
 * exact single-scene ('current-scene') restore path App.tsx uses today —
 * and returns `{ source: 'single', scene }`. Board code never reads or
 * writes the 'current-scene' record, so a user with no boards sees zero
 * behaviour change. Only when at least one board exists does restore come
 * from a board instead.
 *
 * Auto-save routing (see the integration snippet): when `activeBoardId` is
 * set, App should call `saveActiveBoard(...)` instead of useAutoSave's
 * `triggerSave(...)`. `saveActiveBoard` debounces at 2000ms and skips empty
 * scenes, mirroring useAutoSave's defaults (debounceMs = 2000, "Don't save
 * empty scenes"). When no board is active, keep calling `triggerSave` as
 * today and the single scene keeps auto-saving.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    listBoards,
    getBoard,
    createBoard,
    renameBoard,
    duplicateBoard,
    deleteBoard,
    saveBoardScene,
    loadScene,
    type Board,
} from '../data/LocalStorage';

/** localStorage key for the active board id (see header note). */
export const ACTIVE_BOARD_KEY = 'whiteboard-active-board-id';

export interface BoardScene {
    elements: unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
}

export type InitialSceneResult =
    | { source: 'board'; board: Board; scene: BoardScene }
    | { source: 'single'; scene: BoardScene | null }
    | { source: 'empty'; scene: null };

export interface LiveSceneInput {
    elements: readonly unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
}

function readStoredActiveId(): string | null {
    try {
        return window.localStorage.getItem(ACTIVE_BOARD_KEY);
    } catch {
        return null;
    }
}

function writeStoredActiveId(id: string | null): void {
    try {
        if (id) window.localStorage.setItem(ACTIVE_BOARD_KEY, id);
        else window.localStorage.removeItem(ACTIVE_BOARD_KEY);
    } catch {
        // Non-fatal: the in-memory active id still works for this session.
    }
}

export function useBoards() {
    const [boards, setBoards] = useState<Board[]>([]);
    const [activeBoardId, setActiveBoardId] = useState<string | null>(() => readStoredActiveId());
    const [loading, setLoading] = useState(true);

    // Debounced board auto-save, mirroring useAutoSave (2s, skip empty).
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingRef = useRef<LiveSceneInput | null>(null);
    const activeIdRef = useRef<string | null>(activeBoardId);
    activeIdRef.current = activeBoardId;

    const refresh = useCallback(async (): Promise<Board[]> => {
        const all = await listBoards();
        setBoards(all);
        setLoading(false);
        return all;
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    /**
     * Resolve what App should restore on mount. Call this ONCE (instead of
     * loadSavedData) when the integration snippet is applied. The caller
     * then restores the returned scene with the existing App pattern:
     * addFiles(...) first, then updateScene({ elements, appState }).
     */
    const resolveInitialScene = useCallback(async (): Promise<InitialSceneResult> => {
        const all = await listBoards();
        setBoards(all);
        setLoading(false);
        if (all.length === 0) {
            // ── No boards: EXACT old path, untouched ──
            const scene = await loadScene();
            setActiveBoardId(null);
            writeStoredActiveId(null);
            return scene ? { source: 'single', scene } : { source: 'empty', scene: null };
        }
        const storedId = readStoredActiveId();
        const target = all.find((b) => b.id === storedId) ?? all[0];
        setActiveBoardId(target.id);
        writeStoredActiveId(target.id);
        return {
            source: 'board',
            board: target,
            scene: { elements: target.elements, appState: target.appState, files: target.files },
        };
    }, []);

    /** Flush a pending debounced board save immediately (switch/unload path). */
    const flushActiveBoardSave = useCallback(async (): Promise<void> => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        const pending = pendingRef.current;
        pendingRef.current = null;
        const id = activeIdRef.current;
        if (pending && id && pending.elements.length > 0) {
            await saveBoardScene(id, pending.elements, pending.appState, pending.files);
        }
    }, []);

    // Flush on page close, mirroring useAutoSave's beforeunload handling.
    useEffect(() => {
        const handleBeforeUnload = () => {
            // Fire-and-forget, as in useAutoSave.flushSave.
            void flushActiveBoardSave();
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            void flushActiveBoardSave();
        };
    }, [flushActiveBoardSave]);

    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, []);

    /** Debounced save of the live canvas into the ACTIVE board (no-op if none). */
    const saveActiveBoard = useCallback((scene: LiveSceneInput): void => {
        if (!activeIdRef.current) return;
        pendingRef.current = scene;
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
            void flushActiveBoardSave();
        }, 2000);
    }, [flushActiveBoardSave]);

    const create = useCallback(async (name: string, scene?: LiveSceneInput): Promise<Board> => {
        const board = await createBoard(name, scene);
        const all = await refresh();
        void all;
        setActiveBoardId(board.id);
        writeStoredActiveId(board.id);
        return board;
    }, [refresh]);

    const rename = useCallback(async (id: string, name: string): Promise<void> => {
        await renameBoard(id, name);
        await refresh();
    }, [refresh]);

    const duplicate = useCallback(async (id: string): Promise<Board | undefined> => {
        const copy = await duplicateBoard(id);
        await refresh();
        return copy;
    }, [refresh]);

    /**
     * Delete a board. Return value tells App what (if anything) to restore:
     * - a Board: the deleted board WAS active, and this is the board that
     *   just became active (most recently updated remaining board) — App
     *   should restore its scene;
     * - null: the deleted board was active and none remain — App should
     *   fall back to the single-scene restore path;
     * - undefined: the deleted board was NOT active — App must NOT touch
     *   the canvas (the visible board is unchanged).
     */
    const remove = useCallback(async (id: string): Promise<Board | null | undefined> => {
        await flushActiveBoardSave();
        await deleteBoard(id);
        const remaining = await refresh();
        if (activeIdRef.current === id) {
            const next = remaining[0] ?? null;
            setActiveBoardId(next ? next.id : null);
            writeStoredActiveId(next ? next.id : null);
            return next;
        }
        return undefined;
    }, [refresh, flushActiveBoardSave]);

    /**
     * Switch boards. When `liveScene` (the outgoing canvas) is passed, it is
     * saved into the outgoing board first so no work is lost; otherwise any
     * pending debounced save is flushed first. Returns the target board's
     * scene for App to restore via addFiles + updateScene, or null when the
     * target board does not exist.
     */
    const switchBoard = useCallback(async (
        id: string,
        liveScene?: LiveSceneInput,
    ): Promise<BoardScene | null> => {
        const outgoingId = activeIdRef.current;
        if (outgoingId && outgoingId !== id) {
            if (liveScene && liveScene.elements.length > 0) {
                await saveBoardScene(outgoingId, liveScene.elements, liveScene.appState, liveScene.files);
            } else {
                await flushActiveBoardSave();
            }
        }
        const target = await getBoard(id);
        if (!target) return null;
        setActiveBoardId(target.id);
        writeStoredActiveId(target.id);
        await refresh();
        return { elements: target.elements, appState: target.appState, files: target.files };
    }, [refresh, flushActiveBoardSave]);

    const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

    return {
        boards,
        activeBoardId,
        activeBoard,
        loading,
        refresh,
        resolveInitialScene,
        saveActiveBoard,
        flushActiveBoardSave,
        createBoard: create,
        renameBoard: rename,
        duplicateBoard: duplicate,
        deleteBoard: remove,
        switchBoard,
    };
}
