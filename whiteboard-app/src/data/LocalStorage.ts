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
}

// ─── DB Setup ────────────────────────────────────────────────────────────────

const DB_NAME = 'whiteboard-db';
const DB_VERSION = 4; // bumped: added sticky-notes store
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
