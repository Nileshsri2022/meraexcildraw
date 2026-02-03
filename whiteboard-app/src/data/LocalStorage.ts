import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface WhiteboardDB extends DBSchema {
    scenes: {
        key: string;
        value: {
            id: string;
            elements: unknown[];
            appState: Record<string, unknown>;
            files: Record<string, unknown>; // Added for images
            timestamp: number;
        };
    };
}

const DB_NAME = 'whiteboard-db';
const DB_VERSION = 2; // Bumped version for schema change
const SCENE_KEY = 'current-scene';

let dbInstance: IDBPDatabase<WhiteboardDB> | null = null;

async function getDB(): Promise<IDBPDatabase<WhiteboardDB>> {
    if (dbInstance) return dbInstance;

    dbInstance = await openDB<WhiteboardDB>(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion) {
            // Delete old store if exists and recreate
            if (db.objectStoreNames.contains('scenes')) {
                db.deleteObjectStore('scenes');
            }
            db.createObjectStore('scenes', { keyPath: 'id' });
        },
    });

    return dbInstance;
}

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

        // Only save relevant appState properties
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
            files: files, // Save files (images)
            timestamp: Date.now(),
        });

        console.log('[LocalStorage] Scene saved', {
            elementCount: elements.length,
            fileCount: Object.keys(files).length
        });
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
            console.log('[LocalStorage] Scene loaded', {
                elementCount: scene.elements.length,
                fileCount: Object.keys(scene.files || {}).length,
                savedAt: new Date(scene.timestamp).toLocaleString()
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

/**
 * Delete saved scene from IndexedDB
 */
export async function deleteScene(): Promise<void> {
    try {
        const db = await getDB();
        await db.delete('scenes', SCENE_KEY);
        console.log('[LocalStorage] Scene deleted');
    } catch (error) {
        console.error('[LocalStorage] Failed to delete scene:', error);
    }
}

/**
 * Check if there's a saved scene
 */
export async function hasSavedScene(): Promise<boolean> {
    try {
        const db = await getDB();
        const scene = await db.get('scenes', SCENE_KEY);
        return !!scene;
    } catch (error) {
        return false;
    }
}
