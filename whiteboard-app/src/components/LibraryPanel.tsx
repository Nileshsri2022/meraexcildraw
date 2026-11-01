/**
 * LibraryPanel — Small library UI (Track 5, UI-simple).
 *
 * Uses useLibrary internally; the only prop is the Excalidraw imperative
 * API (null until the canvas is ready, same as App's `excalidrawAPI`
 * state). Inline styles only, so no new CSS file is required.
 *
 * Flow: select elements on the canvas → type a name → "Save selected".
 * "Insert" re-inserts that item onto the current canvas (see useLibrary
 * for the exact addFiles + updateScene mechanism). "Delete" removes it.
 */
import React, { useState } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useLibrary } from '../hooks/useLibrary';

interface LibraryPanelProps {
    excalidrawAPI: ExcalidrawImperativeAPI | null;
}

export const LibraryPanel: React.FC<LibraryPanelProps> = ({ excalidrawAPI }) => {
    const { items, saveSelected, insertItem, deleteItem } = useLibrary();
    const [name, setName] = useState('');

    const handleSave = async () => {
        if (!excalidrawAPI) {
            alert('Canvas not ready yet.');
            return;
        }
        const item = await saveSelected(excalidrawAPI, name);
        if (!item) {
            // Same alert() style App.tsx uses for user-facing messages.
            alert('Select one or more elements on the canvas first, then save.');
            return;
        }
        setName('');
    };

    return (
        <div style={{ padding: 12, minWidth: 260, maxWidth: 320 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Library</div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleSave();
                    }}
                    placeholder="Item name (optional)"
                    aria-label="Library item name"
                    style={{ flex: 1, minWidth: 0 }}
                />
                <button onClick={() => void handleSave()} disabled={!excalidrawAPI}>
                    Save selected
                </button>
            </div>

            {items.length === 0 && (
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                    No saved items yet. Select elements on the canvas and save them here.
                </div>
            )}

            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map((item) => (
                    <li
                        key={item.id}
                        style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, marginBottom: 8 }}
                    >
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                            {item.elements.length} elements · {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button
                                disabled={!excalidrawAPI}
                                onClick={() => {
                                    if (!excalidrawAPI) return;
                                    const count = insertItem(excalidrawAPI, item.id);
                                    if (count === 0) alert('That library item is empty or no longer exists.');
                                }}
                            >
                                Insert
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm(`Delete library item "${item.name}"?`)) {
                                        void deleteItem(item.id);
                                    }
                                }}
                            >
                                Delete
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};
