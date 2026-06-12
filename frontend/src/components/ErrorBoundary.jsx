import React from "react";
import { captureFromBoundary } from "@/lib/observability";

/**
 * Top-level React Error Boundary.
 *
 * Catches render-time errors in any descendant so a single component crash
 * doesn't take down the entire admin UI. In dev the stack is printed to the
 * console; in production we keep the message terse for the user. When
 * Sentry is enabled (REACT_APP_SENTRY_DSN present), every caught error is
 * also reported via `captureFromBoundary` with the `scope` tag.
 *
 * Usage:
 *   <ErrorBoundary scope="admin"> ... </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.props.scope || "root", error, info?.componentStack);
    captureFromBoundary(error, info, this.props.scope || "root");
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message || "Unexpected error";
    return (
      <div
        role="alert"
        aria-live="assertive"
        data-testid="error-boundary-fallback"
        className="min-h-[60vh] flex items-center justify-center px-6"
        style={{ background: "#FAFAF8" }}
      >
        <div className="max-w-lg w-full border border-[#E0DDD5] bg-white p-10">
          <div className="text-[10px] tracking-[0.25em] uppercase font-mono text-[#C0392B] mb-4">
            Something broke
          </div>
          <h2 className="font-serif text-3xl tracking-tight text-[#1C1C1E] leading-tight">
            We caught the error before it took the rest of the screen down.
          </h2>
          <p className="text-sm text-[#6B6B6B] mt-4 leading-relaxed">
            The rest of the application is unaffected. You can retry this view or
            reload the page. If the problem persists, share this message with support:
          </p>
          <pre className="mt-4 p-3 bg-[#F0EDE6] text-[11px] font-mono text-[#1C1C1E] whitespace-pre-wrap break-all border border-[#E0DDD5]">
            {msg}
          </pre>
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              data-testid="error-boundary-retry"
              onClick={this.handleReset}
              className="px-5 py-2.5 text-[11px] tracking-[0.2em] uppercase font-mono border border-[#1A1F3D] text-[#1A1F3D] hover:bg-[#1A1F3D] hover:text-white transition-colors"
            >
              Retry
            </button>
            <button
              type="button"
              data-testid="error-boundary-reload"
              onClick={this.handleReload}
              className="px-5 py-2.5 text-[11px] tracking-[0.2em] uppercase font-mono text-white"
              style={{ background: "#1A1F3D" }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
