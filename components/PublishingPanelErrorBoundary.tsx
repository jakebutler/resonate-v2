"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

export class PublishingPanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("PersistedPublishingPanel render failure", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-lg border border-[#7a3b00]/30 bg-[#fff8f1] p-5 text-sm text-[#4a2b00]">
            <h2 className="text-base font-semibold">Calendar temporarily unavailable</h2>
            <p className="mt-2">
              Publishing data loaded, but the calendar UI hit a client-side error. Refresh the
              page or use Convex-backed workflows while we investigate.
            </p>
            <p className="mt-2 font-mono text-xs text-[#7a3b00]/80">
              {this.state.error.message}
            </p>
            <button
              className="mt-4 rounded-md border border-black/15 bg-white px-3 py-2 text-sm font-medium hover:bg-black/5"
              onClick={() => this.setState({ error: null })}
              type="button"
            >
              Try again
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
