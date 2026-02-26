/**
 * ErrorBoundary — Catches React render errors and displays
 * a graceful fallback UI instead of white-screening the app.
 *
 * Usage:
 *   <ErrorBoundary fallback={<MyFallback />}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 * Or with the render-prop pattern:
 *   <ErrorBoundary fallback={(error, reset) => <MyFallback error={error} onRetry={reset} />}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 */
import React, { Component } from "react";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ErrorBoundaryProps {
    children: React.ReactNode;
    /** Static fallback element, or render function receiving (error, resetFn) */
    fallback?:
        | React.ReactNode
        | ((error: Error, reset: () => void) => React.ReactNode);
    /** Optional callback when an error is caught */
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error("[ErrorBoundary] Caught error:", error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    resetError = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError && this.state.error) {
            const { fallback } = this.props;

            // Render-prop pattern
            if (typeof fallback === "function") {
                return fallback(this.state.error, this.resetError);
            }

            // Static fallback element
            if (fallback) {
                return fallback;
            }

            // Default minimal fallback
            return <DefaultFallback error={this.state.error} onRetry={this.resetError} />;
        }

        return this.props.children;
    }
}

// ─── Preset Fallback UIs ─────────────────────────────────────────────────────

interface FallbackProps {
    error: Error;
    onRetry: () => void;
}

/** Generic default fallback — used when no custom fallback is provided */
const DefaultFallback: React.FC<FallbackProps> = ({ error, onRetry }) => (
    <div className="eb-fallback">
        <div className="eb-fallback__icon">⚠️</div>
        <h3 className="eb-fallback__title">Something went wrong</h3>
        <p className="eb-fallback__message">{error.message}</p>
        <button className="eb-fallback__btn" onClick={onRetry}>
            Try Again
        </button>
    </div>
);

/** Sidebar/panel fallback — for ChatPanel, AIToolsDialog */
export const PanelFallback: React.FC<{ name: string; onRetry: () => void; onClose?: () => void }> = ({
    name,
    onRetry,
    onClose,
}) => (
    <div className="eb-fallback eb-fallback--panel">
        <div className="eb-fallback__icon">💬</div>
        <h3 className="eb-fallback__title">{name} crashed</h3>
        <p className="eb-fallback__message">
            An unexpected error occurred. Your canvas data is safe.
        </p>
        <div className="eb-fallback__actions">
            <button className="eb-fallback__btn" onClick={onRetry}>
                Reload {name}
            </button>
            {onClose && (
                <button className="eb-fallback__btn eb-fallback__btn--secondary" onClick={onClose}>
                    Close
                </button>
            )}
        </div>
    </div>
);

/** Full-page fallback — for the canvas / top-level app */
export const CanvasFallback: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
    <div className="eb-fallback eb-fallback--canvas">
        <div className="eb-fallback__icon">🎨</div>
        <h3 className="eb-fallback__title">Canvas failed to render</h3>
        <p className="eb-fallback__message">
            The drawing canvas encountered an error. Your work is saved locally — try reloading.
        </p>
        <div className="eb-fallback__actions">
            <button className="eb-fallback__btn" onClick={onRetry}>
                Retry
            </button>
            <button
                className="eb-fallback__btn eb-fallback__btn--secondary"
                onClick={() => window.location.reload()}
            >
                Reload Page
            </button>
        </div>
    </div>
);

export default ErrorBoundary;
