/**
 * AIExplainPanel — Reusable UI panel for displaying AI explanations.
 *
 * Shows a streaming response with Accept / Regenerate / Cancel actions.
 * Can be dropped into any component that uses the useAIExplain hook.
 *
 * Usage:
 *   const ai = useAIExplain();
 *   <AIExplainPanel
 *       state={ai.state}
 *       onAccept={() => { doSomething(ai.state.response); ai.reset(); }}
 *       onRegenerate={ai.regenerate}
 *       onCancel={ai.cancel}
 *   />
 */
import React from "react";
import type { AIExplainState } from "../hooks/useAIExplain";
import MarkdownRenderer from "./MarkdownRenderer";
import "../styles/ai-explain.css";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface AIExplainPanelProps {
    /** Current AI explain state from the useAIExplain hook */
    state: AIExplainState;
    /** Called when the user accepts the AI response */
    onAccept: () => void;
    /** Called when the user wants a regenerated response */
    onRegenerate: () => void;
    /** Called when the user cancels / dismisses the panel */
    onCancel: () => void;
    /** Additional CSS class for the outer container */
    className?: string;
    /** Inline style (e.g. fontSize) to align with host container */
    style?: React.CSSProperties;
}

// ─── Sparkle SVG (star icon) ─────────────────────────────────────────────────

export const AISparkleIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8l-6.2 4.5 2.4-7.4L2 9.4h7.6z" />
    </svg>
);

// ─── Component ───────────────────────────────────────────────────────────────

export const AIExplainPanel: React.FC<AIExplainPanelProps> = ({
    state,
    onAccept,
    onRegenerate,
    onCancel,
    className,
    style,
}) => {
    if (!state.loading && !state.response) return null;

    return (
        <div className={`ai-explain-panel${className ? ` ${className}` : ""}`} style={style}>
            {/* Header */}
            <div className="ai-explain-panel-header">
                <span className="ai-explain-panel-title">
                    <AISparkleIcon size={14} />
                    AI Explanation
                </span>
                {state.loading && <span className="ai-explain-spinner" />}
            </div>

            {/* Body: streaming text */}
            <div className="ai-explain-panel-body">
                {state.response ? (
                    <div className="ai-explain-panel-text">
                        <MarkdownRenderer content={state.response} />
                    </div>
                ) : (
                    <div className="ai-explain-panel-text ai-explain-panel-text--thinking">
                        Thinking...
                    </div>
                )}
            </div>

            {/* Actions: Accept / Regenerate / Cancel */}
            {!state.loading && state.response && (
                <div className="ai-explain-panel-actions">
                    <button
                        className="ai-explain-btn ai-explain-btn--accept"
                        onClick={onAccept}
                        title="Accept and insert"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Accept
                    </button>
                    <button
                        className="ai-explain-btn ai-explain-btn--reject"
                        onClick={onRegenerate}
                        title="Regenerate with better clarity"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
                        </svg>
                        Regenerate
                    </button>
                    <button
                        className="ai-explain-btn ai-explain-btn--cancel"
                        onClick={onCancel}
                        title="Dismiss"
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Loading: only cancel */}
            {state.loading && (
                <div className="ai-explain-panel-actions">
                    <button
                        className="ai-explain-btn ai-explain-btn--cancel"
                        onClick={onCancel}
                        title="Cancel"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};
