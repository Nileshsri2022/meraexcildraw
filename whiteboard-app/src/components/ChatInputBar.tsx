/**
 * ChatInputBar — Message input with tools toggle, send, and stop buttons.
 * Extracted from ChatPanel for Single Responsibility (Clean Code §8).
 */
import React, { useRef, useEffect, useCallback, memo } from "react";

interface ChatInputBarProps {
    input: string;
    isStreaming: boolean;
    isOpen: boolean;
    hasActiveTools: boolean;
    activeToolCount: number;
    showToolBar: boolean;
    onInputChange: (value: string) => void;
    onSend: () => void;
    onStop: () => void;
    onToggleToolBar: () => void;
}

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

    // Focus input when panel opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 300);
        }
    }, [isOpen]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    }, [onSend]);

    return (
        <div className="chat-panel-input">
            <button
                className={`chat-tools-toggle ${hasActiveTools ? 'chat-tools-toggle--active' : ''}`}
                onClick={onToggleToolBar}
                title={showToolBar ? 'Hide tools' : 'Show tools'}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                </svg>
                {hasActiveTools && <span className="chat-tools-badge">{activeToolCount}</span>}
            </button>
            <textarea
                ref={inputRef}
                className="chat-input"
                value={input}
                onChange={e => onInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasActiveTools ? 'Ask with tools enabled...' : 'Ask Canvas AI...'}
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
                    onClick={onSend}
                    disabled={!input.trim()}
                    title="Send (Enter)"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="22" y1="2" x2="11" y2="13" />
                        <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                </button>
            )}
        </div>
    );
});

ChatInputBar.displayName = "ChatInputBar";
