/**
 * workspaceBundle — Export / Import the entire workspace as a single JSON file.
 *
 * Bundle format (.whiteboard.json):
 * {
 *   version: 1,
 *   exportedAt: ISO timestamp,
 *   scene: { elements, appState, files },
 *   conversations: [ { id, title, updatedAt, messages: [...] } ],
 *   aiHistory: [ ... ]
 * }
 *
 * Export reads LIVE canvas data (elements, appState, files) passed by the
 * caller, plus chat + AI history from IndexedDB. Import parses the file
 * and writes back into both DBs, then returns the scene data for Excalidraw
 * to restore.
 */

import { loadScene, saveScene, getAIHistory, saveAIResult } from "../data/LocalStorage";
import type { AIHistoryEntry } from "../data/LocalStorage";
import { chatDb } from "../services/chatDb";
import type { Conversation } from "../services/chatDb";
import type { ChatMessage } from "../hooks/useCanvasChat";

// ─── Bundle Types ────────────────────────────────────────────────────────────

export interface WorkspaceBundle {
    version: number;
    exportedAt: string;
    scene: {
        elements: unknown[];
        appState: Record<string, unknown>;
        files: Record<string, unknown>;
    } | null;
    conversations: Array<{
        id: string;
        title: string;
        updatedAt: number;
        messages: ChatMessage[];
    }>;
    aiHistory: AIHistoryEntry[];
}

const BUNDLE_VERSION = 1;
const FILE_EXTENSION = ".whiteboard.json";

// ─── Export ──────────────────────────────────────────────────────────────────

/** Live canvas snapshot passed by the caller */
export interface LiveSceneData {
    elements: readonly unknown[];
    appState: Record<string, unknown>;
    files: Record<string, unknown>;
}

/**
 * Collect all workspace data and trigger a browser file download.
 * Reads the LIVE canvas directly (elements/appState/files) so nothing is stale.
 */
export async function exportWorkspace(liveScene: LiveSceneData): Promise<void> {
    // Use live canvas data — never stale IndexedDB
    const scene: WorkspaceBundle["scene"] = {
        elements: [...liveScene.elements] as unknown[],
        appState: liveScene.appState,
        files: liveScene.files,
    };

    // Gather chat conversations + their messages
    const convList: Conversation[] = await chatDb.loadConversations();
    const conversations: WorkspaceBundle["conversations"] = [];

    for (const conv of convList) {
        const messages = await chatDb.loadMessages(conv.id);
        conversations.push({
            id: conv.id,
            title: conv.title,
            updatedAt: conv.updatedAt,
            messages,
        });
    }

    // Gather AI history
    const aiHistory = await getAIHistory();

    const bundle: WorkspaceBundle = {
        version: BUNDLE_VERSION,
        exportedAt: new Date().toISOString(),
        scene,
        conversations,
        aiHistory,
    };

    // Trigger download
    const json = JSON.stringify(bundle);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-whiteboard-${formatDate()}${FILE_EXTENSION}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── Import ──────────────────────────────────────────────────────────────────

export interface ImportResult {
    scene: WorkspaceBundle["scene"];
    conversationCount: number;
    aiHistoryCount: number;
}

/**
 * Open a file picker, read the selected .whiteboard.json, validate it,
 * and restore conversations + AI history into IndexedDB.
 *
 * Returns the scene data so the caller can feed it to Excalidraw.
 */
export function importWorkspace(): Promise<ImportResult | null> {
    return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".json,.whiteboard.json";

        input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) { resolve(null); return; }

            try {
                const text = await file.text();
                const bundle: WorkspaceBundle = JSON.parse(text);

                // Basic validation
                if (!bundle.version || !bundle.exportedAt) {
                    throw new Error("Invalid workspace file — missing version or exportedAt.");
                }

                // ── Restore scene into IndexedDB ──
                if (bundle.scene) {
                    await saveScene(
                        bundle.scene.elements,
                        bundle.scene.appState,
                        bundle.scene.files,
                    );
                }

                // ── Restore chat conversations ──
                let convCount = 0;
                if (bundle.conversations?.length) {
                    for (const conv of bundle.conversations) {
                        await chatDb.saveConversation({
                            id: conv.id,
                            title: conv.title,
                            updatedAt: conv.updatedAt,
                        });
                        if (conv.messages?.length) {
                            await chatDb.saveMessages(conv.id, conv.messages, { skipTimestamp: true });
                        }
                        convCount++;
                    }
                }

                // ── Restore AI history ──
                let histCount = 0;
                if (bundle.aiHistory?.length) {
                    for (const entry of bundle.aiHistory) {
                        // saveAIResult generates a new id/timestamp, but we want to preserve originals
                        // So we call the lower-level approach via saveAIResult with original data
                        await saveAIResult({
                            type: entry.type,
                            prompt: entry.prompt,
                            result: entry.result,
                            thumbnail: entry.thumbnail,
                            metadata: entry.metadata,
                        });
                        histCount++;
                    }
                }

                resolve({
                    scene: bundle.scene,
                    conversationCount: convCount,
                    aiHistoryCount: histCount,
                });
            } catch (err) {
                console.error("[importWorkspace] Failed:", err);
                alert(`Import failed: ${(err as Error).message}`);
                resolve(null);
            }
        };

        // User cancelled file picker
        input.oncancel = () => resolve(null);
        input.click();
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
