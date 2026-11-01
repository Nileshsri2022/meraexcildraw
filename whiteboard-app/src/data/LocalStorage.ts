import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { StickyNote } from '../types/sticky-notes';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AIHistoryType = 'diagram' | 'image' | 'sketch' | 'ocr' | 'tts';

export interface AIHistoryEntry {
    id: string;
    type: AIHistoryType;
    prompt: string;           // user input / description
    result: string;           // mermaid code, base64 image, or plain text
    thumbnail?: string;       // base64 small preview (images only)
    timestamp: number;
    metadata?: Record<string, unknown>; // seed, voice, width, etc.
}

// ─── Track 5: Multiple boards + Library (v5, additive only) ───────────────
// A Board is a full scene snapshot (same element/appState/files shape as the
// single 'scenes' record) plus a name and created/updated timestamps. The
// single-scene record under SCENE_KEY ('current-scene') is NOT touched by
// any board function below, so users with no boards keep the old restore
// path exactly as before (see useBoards.resolveInitialScene).
export interface Board {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    elements: unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
}

/** Metadata-only view of a board, for list UIs that do not need scene data. */
export interface BoardMeta {
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    elementCount: number;
}

// A LibraryItem is a named snapshot of selected elements (+ their files),
// saved so it can be re-inserted onto any canvas later.
export interface LibraryItem {
    id: string;
    name: string;
    createdAt: number;
    elements: unknown[];
    files: Record<string, unknown>;
}

interface WhiteboardDB extends DBSchema {
    scenes: {
        key: string;
        value: {
            id: string;
            elements: unknown[];
            appState: Record<string, unknown>;
            files: Record<string, unknown>;
            timestamp: number;
        };
    };
    'ai-history': {
        key: string;
        value: AIHistoryEntry;
        indexes: { 'by-type': AIHistoryType; 'by-timestamp': number };
    };
    'sticky-notes': {
        key: string;
        value: StickyNote;
        indexes: { 'by-zIndex': number; 'by-updatedAt': number };
    };
    // Track 5 (v5): one record per board, one record per library item.
    boards: {
        key: string;
        value: Board;
        indexes: { 'by-updatedAt': number };
    };
    'library-items': {
        key: string;
        value: LibraryItem;
        indexes: { 'by-createdAt': number };
    };
}

// ─── DB Setup ────────────────────────────────────────────────────────────────

const DB_NAME = 'whiteboard-db';
const DB_VERSION = 5; // bumped (Track 5): added boards + library-items stores
const SCENE_KEY = 'current-scene';
const MAX_HISTORY_ENTRIES = 50; // keep last 50 per tab type

let dbInstance: IDBPDatabase<WhiteboardDB> | null = null;

async function getDB(): Promise<IDBPDatabase<WhiteboardDB>> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<WhiteboardDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            // ── scenes store (v1/v2) ──
            if (!db.objectStoreNames.contains('scenes')) {
                db.createObjectStore('scenes', { keyPath: 'id' });
            }

            // ── ai-history store (v3) ──
            if (!db.objectStoreNames.contains('ai-history')) {
                const store = db.createObjectStore('ai-history', { keyPath: 'id' });
                store.createIndex('by-type', 'type');
                store.createIndex('by-timestamp', 'timestamp');
            }

            // ── sticky-notes store (v4) ──
            if (!db.objectStoreNames.contains('sticky-notes')) {
                const store = db.createObjectStore('sticky-notes', { keyPath: 'id' });
                store.createIndex('by-zIndex', 'zIndex');
                store.createIndex('by-updatedAt', 'updatedAt');
            }

            // ── boards store (v5, Track 5) ──
            if (!db.objectStoreNames.contains('boards')) {
                const store = db.createObjectStore('boards', { keyPath: 'id' });
                store.createIndex('by-updatedAt', 'updatedAt');
            }

            // ── library-items store (v5, Track 5) ──
            if (!db.objectStoreNames.contains('library-items')) {
                const store = db.createObjectStore('library-items', { keyPath: 'id' });
                store.createIndex('by-createdAt', 'createdAt');
            }
        },
    });

    return dbInstance;
}

// ─── Scene CRUD ───────────────────────────────────────────────────────────────

/**
 * Save current scene to IndexedDB (including images)
 */
export async function saveScene(
    elements: readonly unknown[],
    appState: Record<string, unknown>,
    files: Record<string, unknown> = {}
): Promise<void> {
    try {
        const db = await getDB();
        const stateToSave: Record<string, unknown> = {
            viewBackgroundColor: appState.viewBackgroundColor,
            zoom: appState.zoom,
            scrollX: appState.scrollX,
            scrollY: appState.scrollY,
            theme: appState.theme,
        };

        await db.put('scenes', {
            id: SCENE_KEY,
            elements: [...elements] as unknown[],
            appState: stateToSave,
            files,
            timestamp: Date.now(),
        });

        if (import.meta.env.DEV) {
            console.log('[LocalStorage] Scene saved', {
                elementCount: elements.length,
                fileCount: Object.keys(files).length,
            });
        }
    } catch (error) {
        console.error('[LocalStorage] Failed to save scene:', error);
    }
}

/**
 * Load saved scene from IndexedDB (including images)
 */
export async function loadScene(): Promise<{
    elements: unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
} | null> {
    try {
        const db = await getDB();
        const scene = await db.get('scenes', SCENE_KEY);

        if (scene) {
            if (import.meta.env.DEV) console.log('[LocalStorage] Scene loaded', {
                elementCount: scene.elements.length,
                fileCount: Object.keys(scene.files || {}).length,
                savedAt: new Date(scene.timestamp).toLocaleString(),
            });
            return {
                elements: scene.elements,
                appState: scene.appState,
                files: scene.files || {},
            };
        }

        return null;
    } catch (error) {
        console.error('[LocalStorage] Failed to load scene:', error);
        return null;
    }
}

/** Delete saved scene from IndexedDB */
export async function deleteScene(): Promise<void> {
    try {
        const db = await getDB();
        await db.delete('scenes', SCENE_KEY);
        if (import.meta.env.DEV) console.log('[LocalStorage] Scene deleted');
    } catch (error) {
        console.error('[LocalStorage] Failed to delete scene:', error);
    }
}

/** Check if there is a saved scene */
export async function hasSavedScene(): Promise<boolean> {
    try {
        const db = await getDB();
        const scene = await db.get('scenes', SCENE_KEY);
        return !!scene;
    } catch {
        return false;
    }
}

// ─── AI History CRUD ──────────────────────────────────────────────────────────

/**
 * Save a new AI generation result to history.
 * Automatically prunes oldest entries if MAX_HISTORY_ENTRIES is exceeded.
 */
export async function saveAIResult(
    entry: Omit<AIHistoryEntry, 'id' | 'timestamp'>
): Promise<AIHistoryEntry> {
    const db = await getDB();
    const newEntry: AIHistoryEntry = {
        ...entry,
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
    };

    await db.put('ai-history', newEntry);

    // Prune oldest if over limit
    const all = await db.getAllFromIndex('ai-history', 'by-timestamp');
    if (all.length > MAX_HISTORY_ENTRIES) {
        const toDelete = all.slice(0, all.length - MAX_HISTORY_ENTRIES);
        const tx = db.transaction('ai-history', 'readwrite');
        await Promise.all(toDelete.map(e => tx.store.delete(e.id)));
        await tx.done;
    }

    if (import.meta.env.DEV) console.log(`[AI History] Saved ${entry.type} result (${newEntry.id})`);
    return newEntry;
}

/**
 * Get all AI history entries, newest first.
 */
export async function getAIHistory(): Promise<AIHistoryEntry[]> {
    try {
        const db = await getDB();
        const all = await db.getAllFromIndex('ai-history', 'by-timestamp');
        return all.reverse(); // newest first
    } catch (error) {
        console.error('[AI History] Failed to load history:', error);
        return [];
    }
}

/**
 * Get AI history filtered by type, newest first.
 */
export async function getAIHistoryByType(type: AIHistoryType): Promise<AIHistoryEntry[]> {
    try {
        const db = await getDB();
        const all = await db.getAllFromIndex('ai-history', 'by-type', type);
        return all.toSorted((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
        console.error('[AI History] Failed to load history by type:', error);
        return [];
    }
}

/**
 * Delete a single AI history entry by ID.
 */
export async function deleteAIHistoryEntry(id: string): Promise<void> {
    try {
        const db = await getDB();
        await db.delete('ai-history', id);
        if (import.meta.env.DEV) console.log(`[AI History] Deleted entry ${id}`);
    } catch (error) {
        console.error('[AI History] Failed to delete entry:', error);
    }
}

/**
 * Clear ALL AI history entries.
 */
export async function clearAIHistory(): Promise<void> {
    try {
        const db = await getDB();
        await db.clear('ai-history');
        if (import.meta.env.DEV) console.log('[AI History] Cleared all history');
    } catch (error) {
        console.error('[AI History] Failed to clear history:', error);
    }
}

// ─── Sticky Notes CRUD ───────────────────────────────────────────────────────

/**
 * Load all sticky notes, ordered by zIndex ascending.
 */
export async function loadStickyNotes(): Promise<StickyNote[]> {
    try {
        const db = await getDB();
        const all = await db.getAllFromIndex('sticky-notes', 'by-zIndex');
        return all;
    } catch (error) {
        console.error('[StickyNotes] Failed to load:', error);
        return [];
    }
}

/**
 * Save (upsert) a single sticky note.
 */
export async function saveStickyNote(note: StickyNote): Promise<void> {
    try {
        const db = await getDB();
        await db.put('sticky-notes', note);
        if (import.meta.env.DEV) console.log(`[StickyNotes] Saved note ${note.id}`);
    } catch (error) {
        console.error('[StickyNotes] Failed to save:', error);
    }
}

/**
 * Save all sticky notes in one transaction (bulk upsert).
 */
export async function saveAllStickyNotes(notes: StickyNote[]): Promise<void> {
    try {
        const db = await getDB();
        const tx = db.transaction('sticky-notes', 'readwrite');
        await Promise.all(notes.map(n => tx.store.put(n)));
        await tx.done;
        if (import.meta.env.DEV) console.log(`[StickyNotes] Bulk saved ${notes.length} notes`);
    } catch (error) {
        console.error('[StickyNotes] Failed to bulk save:', error);
    }
}

/**
 * Delete a single sticky note by ID.
 */
export async function deleteStickyNote(id: string): Promise<void> {
    try {
        const db = await getDB();
        await db.delete('sticky-notes', id);
        if (import.meta.env.DEV) console.log(`[StickyNotes] Deleted note ${id}`);
    } catch (error) {
        console.error('[StickyNotes] Failed to delete:', error);
    }
}

/**
 * Delete ALL sticky notes.
 */
export async function clearAllStickyNotes(): Promise<void> {
    try {
        const db = await getDB();
        await db.clear('sticky-notes');
        if (import.meta.env.DEV) console.log('[StickyNotes] Cleared all notes');
    } catch (error) {
        console.error('[StickyNotes] Failed to clear:', error);
    }
}

// ─── Boards CRUD (Track 5) ─────────────────────────────────────────────────
// All functions here touch ONLY the 'boards' store. They never read or write
// the single-scene record ('current-scene'), so the pre-existing restore
// path (loadScene) keeps working unchanged for users with no boards.
// appState is filtered to the same subset saveScene() keeps
// (viewBackgroundColor, zoom, scrollX, scrollY, theme) so board snapshots
// stay consistent with single-scene snapshots.

function makeBoardId(): string {
    // Same id style as saveAIResult(): `hist_<ms>_<rand>` in this file.
    return `board_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function filterAppState(appState: Record<string, unknown>): Record<string, unknown> {
    return {
        viewBackgroundColor: appState.viewBackgroundColor,
        zoom: appState.zoom,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        theme: appState.theme,
    };
}

/** List all boards, most recently updated first. Returns [] on error. */
export async function listBoards(): Promise<Board[]> {
    try {
        const db = await getDB();
        const all = await db.getAllFromIndex('boards', 'by-updatedAt');
        return all.reverse(); // newest first (mirrors getAIHistory)
    } catch (error) {
        console.error('[Boards] Failed to list:', error);
        return [];
    }
}

/** True when at least one board exists. Used for the no-boards fallback. */
export async function hasBoards(): Promise<boolean> {
    try {
        const db = await getDB();
        return (await db.count('boards')) > 0;
    } catch {
        return false;
    }
}

/** Get one board by id, or undefined when missing. */
export async function getBoard(id: string): Promise<Board | undefined> {
    try {
        const db = await getDB();
        return await db.get('boards', id);
    } catch (error) {
        console.error('[Boards] Failed to get board:', error);
        return undefined;
    }
}

/**
 * Create a board. When `scene` is omitted the board starts empty; callers
 * that create a board from the live canvas pass the current scene so
 * nothing is lost. The name is trimmed; an empty name becomes "Untitled board".
 */
export async function createBoard(
    name: string,
    scene?: { elements: readonly unknown[]; appState: Record<string, unknown>; files: Record<string, unknown> },
): Promise<Board> {
    const db = await getDB();
    const now = Date.now();
    const board: Board = {
        id: makeBoardId(),
        name: name.trim() || 'Untitled board',
        createdAt: now,
        updatedAt: now,
        elements: scene ? [...scene.elements] : [],
        appState: scene ? filterAppState(scene.appState) : {},
        files: scene ? scene.files : {},
    };
    await db.put('boards', board);
    if (import.meta.env.DEV) console.log(`[Boards] Created board ${board.id}`);
    return board;
}

/** Rename a board. No-op (returns undefined) when the board does not exist. */
export async function renameBoard(id: string, name: string): Promise<Board | undefined> {
    try {
        const db = await getDB();
        const board = await db.get('boards', id);
        if (!board) return undefined;
        board.name = name.trim() || board.name;
        board.updatedAt = Date.now();
        await db.put('boards', board);
        return board;
    } catch (error) {
        console.error('[Boards] Failed to rename:', error);
        return undefined;
    }
}

/**
 * Duplicate a board (new id, "<name> copy", same scene snapshot).
 * Returns undefined when the source board does not exist.
 */
export async function duplicateBoard(id: string): Promise<Board | undefined> {
    try {
        const db = await getDB();
        const src = await db.get('boards', id);
        if (!src) return undefined;
        const now = Date.now();
        const copy: Board = {
            ...src,
            id: makeBoardId(),
            name: `${src.name} copy`,
            createdAt: now,
            updatedAt: now,
            elements: [...src.elements],
            appState: { ...src.appState },
            files: { ...src.files },
        };
        await db.put('boards', copy);
        return copy;
    } catch (error) {
        console.error('[Boards] Failed to duplicate:', error);
        return undefined;
    }
}

/** Delete a board. Deleting the last board restores the no-boards fallback. */
export async function deleteBoard(id: string): Promise<void> {
    try {
        const db = await getDB();
        await db.delete('boards', id);
        if (import.meta.env.DEV) console.log(`[Boards] Deleted board ${id}`);
    } catch (error) {
        console.error('[Boards] Failed to delete:', error);
    }
}

/**
 * Overwrite a board's scene snapshot (the board auto-save target).
 * Mirrors saveScene(): skips empty element lists so a blank canvas never
 * wipes a board — callers that must clear a board should delete it instead.
 * Updates updatedAt and returns the saved board, or undefined when missing.
 */
export async function saveBoardScene(
    id: string,
    elements: readonly unknown[],
    appState: Record<string, unknown>,
    files: Record<string, unknown> = {},
): Promise<Board | undefined> {
    try {
        if (elements.length === 0) return await getBoard(id);
        const db = await getDB();
        const board = await db.get('boards', id);
        if (!board) return undefined;
        board.elements = [...elements] as unknown[];
        board.appState = filterAppState(appState);
        board.files = files;
        board.updatedAt = Date.now();
        await db.put('boards', board);
        if (import.meta.env.DEV) {
            console.log('[Boards] Scene saved', { boardId: id, elementCount: elements.length });
        }
        return board;
    } catch (error) {
        console.error('[Boards] Failed to save scene:', error);
        return undefined;
    }
}

// ─── Library CRUD (Track 5) ─────────────────────────────────────────────────
// Same pattern as the AI-history store above: keyPath 'id', one index, no
// interaction with the 'scenes' store, so library use never disturbs restore.

function makeLibraryId(): string {
    return `lib_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** List all library items, newest first. Returns [] on error. */
export async function listLibraryItems(): Promise<LibraryItem[]> {
    try {
        const db = await getDB();
        const all = await db.getAllFromIndex('library-items', 'by-createdAt');
        return all.reverse(); // newest first (mirrors getAIHistory)
    } catch (error) {
        console.error('[Library] Failed to list:', error);
        return [];
    }
}

/** Get one library item by id, or undefined when missing. */
export async function getLibraryItem(id: string): Promise<LibraryItem | undefined> {
    try {
        const db = await getDB();
        return await db.get('library-items', id);
    } catch (error) {
        console.error('[Library] Failed to get item:', error);
        return undefined;
    }
}

/**
 * Save elements as a named library item. Empty element lists are rejected
 * (returns null) — there is nothing useful to re-insert. `files` is stored
 * verbatim as passed by the caller (see useLibrary: it passes
 * excalidrawAPI.getFiles()); no fileId filtering is assumed here.
 */
export async function saveLibraryItem(
    name: string,
    elements: readonly unknown[],
    files: Record<string, unknown> = {},
): Promise<LibraryItem | null> {
    try {
        if (elements.length === 0) return null;
        const db = await getDB();
        const item: LibraryItem = {
            id: makeLibraryId(),
            name: name.trim() || 'Untitled item',
            createdAt: Date.now(),
            elements: [...elements] as unknown[],
            files,
        };
        await db.put('library-items', item);
        if (import.meta.env.DEV) console.log(`[Library] Saved item ${item.id} (${elements.length} elements)`);
        return item;
    } catch (error) {
        console.error('[Library] Failed to save:', error);
        return null;
    }
}

/** Delete a library item. */
export async function deleteLibraryItem(id: string): Promise<void> {
    try {
        const db = await getDB();
        await db.delete('library-items', id);
        if (import.meta.env.DEV) console.log(`[Library] Deleted item ${id}`);
    } catch (error) {
        console.error('[Library] Failed to delete:', error);
    }
}
