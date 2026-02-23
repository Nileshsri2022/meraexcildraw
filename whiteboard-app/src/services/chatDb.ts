import { openDB, IDBPDatabase } from 'idb';
import { ChatMessage } from '../hooks/useCanvasChat';

const DB_NAME = 'CosmicChatDB';
const STORE_NAME = 'messages';
const VERSION = 1;

export interface ChatDB {
    saveMessages(messages: ChatMessage[]): Promise<void>;
    loadMessages(): Promise<ChatMessage[]>;
    clearMessages(): Promise<void>;
}

class ChatDBImpl implements ChatDB {
    private dbPromise: Promise<IDBPDatabase>;

    constructor() {
        this.dbPromise = openDB(DB_NAME, VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            },
        });
    }

    async saveMessages(messages: ChatMessage[]): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        // Clear old ones and save new ones to keep it simple and orderly
        // Or we can just put/add individually. Given the context, we likely want a clean sync.
        await store.clear();
        for (const msg of messages) {
            await store.put(msg);
        }
        await tx.done;
    }

    async loadMessages(): Promise<ChatMessage[]> {
        const db = await this.dbPromise;
        const messages = await db.getAll(STORE_NAME);
        // Sort by timestamp just in case
        return messages.sort((a, b) => a.timestamp - b.timestamp);
    }

    async clearMessages(): Promise<void> {
        const db = await this.dbPromise;
        const tx = db.transaction(STORE_NAME, 'readwrite');
        await tx.objectStore(STORE_NAME).clear();
        await tx.done;
    }
}

export const chatDb = new ChatDBImpl();
