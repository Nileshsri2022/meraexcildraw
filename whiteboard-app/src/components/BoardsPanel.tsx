/**
 * BoardsPanel — Small boards list UI (Track 5, UI-simple).
 *
 * Presentational only: all IndexedDB work lives in useBoards (the hook),
 * and App wires the callbacks (see App.track5-integration.md). Inline
 * styles only, so no new CSS file or class name is required.
 *
 * Props:
 *   boards         — from useBoards().boards
 *   activeBoardId  — from useBoards().activeBoardId (null = single scene)
 *   onSwitch(id)   — switch to a board (App restores its scene)
 *   onCreate(name) — create a board; App passes the live canvas scene
 *   onRename(id, name), onDuplicate(id), onDelete(id)
 *
 * When `activeBoardId` is null the panel shows a "Single scene (default)"
 * row, making the no-boards fallback visible instead of hidden.
 */
import React, { useState } from 'react';
import type { Board } from '../data/LocalStorage';

interface BoardsPanelProps {
    boards: Board[];
    activeBoardId: string | null;
    onSwitch: (id: string) => void;
    onCreate: (name: string) => void;
    onRename: (id: string, name: string) => void;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
}

export const BoardsPanel: React.FC<BoardsPanelProps> = ({
    boards,
    activeBoardId,
    onSwitch,
    onCreate,
    onRename,
    onDuplicate,
    onDelete,
}) => {
    const [newName, setNewName] = useState('');
    const [renamingId, setRenamingId] = useState<string | null>(null);
    const [renameText, setRenameText] = useState('');

    return (
        <div style={{ padding: 12, minWidth: 260, maxWidth: 320 }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Boards</div>

            {activeBoardId === null && (
                <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>
                    ● Single scene (default) — your existing saved board
                </div>
            )}

            {boards.length === 0 && (
                <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 8 }}>
                    No boards yet. Create one to keep several whiteboards.
                </div>
            )}

            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {boards.map((board) => {
                    const isActive = board.id === activeBoardId;
                    return (
                        <li
                            key={board.id}
                            style={{
                                border: isActive ? '2px solid #4f46e5' : '1px solid #ddd',
                                borderRadius: 8,
                                padding: 8,
                                marginBottom: 8,
                            }}
                        >
                            {renamingId === board.id ? (
                                <span style={{ display: 'flex', gap: 6 }}>
                                    <input
                                        value={renameText}
                                        onChange={(e) => setRenameText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && renameText.trim()) {
                                                onRename(board.id, renameText);
                                                setRenamingId(null);
                                            }
                                            if (e.key === 'Escape') setRenamingId(null);
                                        }}
                                        // eslint-disable-next-line jsx-a11y/no-autofocus
                                        autoFocus
                                        style={{ flex: 1, minWidth: 0 }}
                                    />
                                    <button
                                        onClick={() => {
                                            if (renameText.trim()) onRename(board.id, renameText);
                                            setRenamingId(null);
                                        }}
                                    >
                                        Save
                                    </button>
                                </span>
                            ) : (
                                <>
                                    <button
                                        onClick={() => onSwitch(board.id)}
                                        disabled={isActive}
                                        title={isActive ? 'Current board' : 'Open this board'}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            textAlign: 'left',
                                            fontWeight: isActive ? 700 : 400,
                                            background: 'none',
                                            border: 'none',
                                            cursor: isActive ? 'default' : 'pointer',
                                            padding: 0,
                                        }}
                                    >
                                        {isActive ? '● ' : ''}{board.name}
                                    </button>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                        {board.elements.length} elements · updated{' '}
                                        {new Date(board.updatedAt).toLocaleDateString()}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => {
                                                setRenamingId(board.id);
                                                setRenameText(board.name);
                                            }}
                                        >
                                            Rename
                                        </button>
                                        <button onClick={() => onDuplicate(board.id)}>Duplicate</button>
                                        <button
                                            onClick={() => {
                                                if (
                                                    // Same confirm() pattern App.tsx uses for Clear Local Data.
                                                    confirm(`Delete board "${board.name}"? This cannot be undone.`)
                                                ) {
                                                    onDelete(board.id);
                                                }
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>

            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && newName.trim()) {
                            onCreate(newName);
                            setNewName('');
                        }
                    }}
                    placeholder="New board name"
                    aria-label="New board name"
                    style={{ flex: 1, minWidth: 0 }}
                />
                <button
                    onClick={() => {
                        if (!newName.trim()) return;
                        onCreate(newName);
                        setNewName('');
                    }}
                >
                    + New
                </button>
            </div>
        </div>
    );
};
