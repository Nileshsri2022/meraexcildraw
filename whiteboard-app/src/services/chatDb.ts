import { openDB, IDBPDatabase } from 'idb';
import { ChatMessage } from '../hooks/useCanvasChat';

export interface Conversation {
    id: string;
    title: string;
    updatedAt: number;
}

const DB_NAME = 'CosmicChatDB';
const MSG_STORE = 'messages';
const CONV_STORE = 'conversations';
const VERSION = 2; // Bump version for conversion support

export interface ChatDB {
    saveMessages(conversationId: string, messages: ChatMessage[], options?: { skipTimestamp?: boolean }): Promise<void>;
    loadMessages(conversationId: string): Promise<ChatMessage[]>;
    clearConversation(conversationId: string): Promise<void>;

    saveConversation(conv: Conversation): Promise<void>;
    loadConversations(): Promise<Conversation[]>;
    deleteConversation(conversationId: string): Promise<void>;
    searchConversations(query: string): Promise<string[]>; // Returns list of conversation IDs that match
}

class ChatDBImpl implements ChatDB {
    private dbPromise: Promise<IDBPDatabase>;

    constructor() {
        this.dbPromise = openDB(DB_NAME, VERSION, {
            upgrade(db, oldVersion, newVersion, transaction) {
                if (oldVersion < 1) {
                    db.createObjectStore(MSG_STORE, { keyPath: 'id' });
                }
                if (oldVersion < 2) {
                    if (!db.objectStoreNames.contains(CONV_STORE)) {
                        db.createObjectStore(CONV_STORE, { keyPath: 'id' });
                    }
                    if (transaction) {
                        const msgStore = transaction.objectStore(MSG_STORE);
                        if (!msgStore.indexNames.contains('conversationId')) {
                            msgStore.createIndex('conversationId', 'conversationId');
                        }
                    }
                }
            },
        });
    }

    async saveMessages(conversationId: string, messages: ChatMessage[], options?: { skipTimestamp?: boolean }): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction([MSG_STORE, CONV_STORE], 'readwrite');
        const msgStore = tx.objectStore(MSG_STORE);
        const convStore = tx.objectStore(CONV_STORE);

        // Delete existing messages for this conversation to overwrite
        if (msgStore.indexNames.contains('conversationId')) {
            const index = msgStore.index('conversationId');
            let cursor = await index.openCursor(IDBKeyRange.only(conversationId));
            while (cursor) {
                await cursor.delete();
                cursor = await cursor.continue();
            }
        }

        // Add new ones
        for (const msg of messages) {
            await msgStore.put({ ...msg, conversationId });
        }

        // Update conversation's updatedAt unless skipped
        if (!options?.skipTimestamp) {
            let conv = await convStore.get(conversationId);
            if (!conv) {
                // Fallback: This shouldn't happen usually but ensures robustness
                conv = { id: conversationId, title: "New Conversation", updatedAt: Date.now() };
            } else {
                conv.updatedAt = Date.now();
            }
            await convStore.put(conv);
        }

        await tx.done;
    }

    async loadMessages(conversationId: string): Promise<ChatMessage[]> {
        const db = await this.dbPromise;
        if (!db.objectStoreNames.contains(MSG_STORE)) return [];

        const tx = db.transaction(MSG_STORE, 'readonly');
        const store = tx.objectStore(MSG_STORE);

        if (!store.indexNames.contains('conversationId')) {
            // Fallback for old schema if upgrade hasn't finished or something
            return [];
        }

        const messages = await db.getAllFromIndex(MSG_STORE, 'conversationId', conversationId);
        return messages.sort((a, b) => a.timestamp - b.timestamp);
    }

    async clearConversation(conversationId: string): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction(MSG_STORE, 'readwrite');
        const index = tx.objectStore(MSG_STORE).index('conversationId');
        let cursor = await index.openCursor(IDBKeyRange.only(conversationId));
        while (cursor) {
            await cursor.delete();
            cursor = await cursor.continue();
        }
        await tx.done;
    }

    async saveConversation(conv: Conversation): Promise<void> {
        const db = await this.dbPromise;
        await db.put(CONV_STORE, conv);
    }

    async loadConversations(): Promise<Conversation[]> {
        const db = await this.dbPromise;
        if (!db.objectStoreNames.contains(CONV_STORE)) return [];
        const convs = await db.getAll(CONV_STORE);
        return convs.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    async deleteConversation(conversationId: string): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction([MSG_STORE, CONV_STORE], 'readwrite');
        await tx.objectStore(CONV_STORE).delete(conversationId);

        const msgStore = tx.objectStore(MSG_STORE);
        const index = msgStore.index('conversationId');
        let cursor = await index.openCursor(IDBKeyRange.only(conversationId));
        while (cursor) {
            await cursor.delete();
            cursor = await cursor.continue();
        }
        await tx.done;
    }

    async searchConversations(query: string): Promise<string[]> {
        const db = await this.dbPromise;
        const tx = db.transaction(MSG_STORE, 'readonly');
        const store = tx.objectStore(MSG_STORE);
        const matchingIds = new Set<string>();
        const lowerQuery = query.toLowerCase();

        let cursor = await store.openCursor();
        while (cursor) {
            const msg = cursor.value;
            if (msg.content && msg.content.toLowerCase().includes(lowerQuery)) {
                matchingIds.add(msg.conversationId);
            }
            cursor = await cursor.continue();
        }

        return Array.from(matchingIds);
    }
}

export const chatDb = new ChatDBImpl();
