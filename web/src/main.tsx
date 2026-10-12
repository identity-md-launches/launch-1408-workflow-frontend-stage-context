import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadRuntime } from "./config";
import "./styles.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="boot-screen">
        <h1>The wall needs a fresh start.</h1>
        <p>Something could not be displayed. Reload to reconnect safely.</p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById("root")!);
root.render(
  <div className="boot-screen" role="status">
    <span className="eyebrow">The Comb</span>
    <h1>Opening the hive…</h1>
    <p>
      Loading the attested deployment and verifying its contract interfaces.
    </p>
  </div>,
);
loadRuntime()
  .then((runtime) =>
    root.render(
      <ErrorBoundary>
        <App runtime={runtime} />
      </ErrorBoundary>,
    ),
  )
  .catch((e: Error) =>
    root.render(
      <main className="boot-screen">
        <span className="eyebrow">The Comb</span>
        <h1>Unable to open the wall.</h1>
        <p role="alert">{e.message}</p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Retry loading
        </button>
      </main>,
    ),
  );
