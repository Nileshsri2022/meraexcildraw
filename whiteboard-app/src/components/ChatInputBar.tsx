/**
 * ChatInputBar — Message input with tools toggle, image attach, send, and stop buttons.
 * Extracted from ChatPanel for Single Responsibility (Clean Code §8).
 */
import React, { useRef, useEffect, useCallback, useState, memo } from "react";

const MAX_IMAGE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

interface ChatInputBarProps {
    input: string;
    isStreaming: boolean;
    isOpen: boolean;
    hasActiveTools: boolean;
    activeToolCount: number;
    showToolBar: boolean;
    onInputChange: (value: string) => void;
    onSend: (imageBase64?: string) => void;
    onStop: () => void;
    onToggleToolBar: () => void;
}

/** Convert a File/Blob to a base64 data-URI string. */
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

export const ChatInputBar: React.FC<ChatInputBarProps> = memo(({
    input,
    isStreaming,
    isOpen,
    hasActiveTools,
    activeToolCount,
    showToolBar,
    onInputChange,
    onSend,
    onStop,
    onToggleToolBar,
}) => {
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    // ── Image handling ───────────────────────────────────────────────────
    const attachImage = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/")) return;
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            alert("Image must be under 4 MB.");
            return;
        }
        const base64 = await fileToBase64(file);
        setImagePreview(base64);
    }, []);

    const removeImage = useCallback(() => {
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) attachImage(file);
    }, [attachImage]);

    // Clipboard paste support — intercept Ctrl+V with image data
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.startsWith("image/")) {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) attachImage(file);
                return;
            }
        }
    }, [attachImage]);

    // Drag-and-drop support
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file?.type.startsWith("image/")) attachImage(file);
    }, [attachImage]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
    }, []);

    // ── Send / keyboard ──────────────────────────────────────────────────
    const handleSend = useCallback(() => {
        onSend(imagePreview ?? undefined);
        removeImage();
    }, [onSend, imagePreview, removeImage]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const canSend = !!(input.trim() || imagePreview);

    return (
        <div className="chat-input-wrapper">
            {/* Image preview strip */}
            {imagePreview && (
                <div className="chat-image-preview">
                    <div className="chat-image-preview-thumb">
                        <img src={imagePreview} alt="Attached" />
                        <button
                            className="chat-image-preview-remove"
                            onClick={removeImage}
                            title="Remove image"
                        >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            <div
                className="chat-panel-input"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
            >
                <button
                    className={`chat-tools-toggle ${hasActiveTools ? 'chat-tools-toggle--active' : ''}`}
                    onClick={onToggleToolBar}
                    title={showToolBar ? 'Hide tools' : 'Show tools'}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                    </svg>
                    {hasActiveTools ? <span className="chat-tools-badge">{activeToolCount}</span> : null}
                </button>

                {/* Attach image button */}
                <button
                    className="chat-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                    title="Attach image (or paste / drag-drop)"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                    </svg>
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="chat-attach-file-input"
                    onChange={handleFileChange}
                    tabIndex={-1}
                />

                <textarea
                    ref={inputRef}
                    className="chat-input"
                    value={input}
                    onChange={e => onInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onPaste={handlePaste}
                    placeholder={imagePreview ? 'Describe the image or ask a question...' : hasActiveTools ? 'Ask with tools enabled...' : 'Ask Canvas AI...'}
                    rows={1}
                    disabled={isStreaming}
                />
                {isStreaming ? (
                    <button className="chat-send-btn chat-send-btn--stop" onClick={onStop} title="Stop">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                    </button>
                ) : (
                    <button
                        className="chat-send-btn"
                        onClick={handleSend}
                        disabled={!canSend}
                        title="Send (Enter)"
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
});

ChatInputBar.displayName = "ChatInputBar";
