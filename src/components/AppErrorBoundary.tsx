import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

const RELOAD_FLAG = "mt_chunk_reload_at";

/** Ett trasigt chunk-anrop efter ny driftsättning ger vit sida — ladda om en gång. */
function isStaleBundleError(error: Error) {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return (
    msg.includes("dynamically imported module") ||
    msg.includes("failed to fetch dynamically") ||
    msg.includes("importing a module script failed") ||
    msg.includes("chunkloaderror") ||
    msg.includes("unexpected token '<'")
  );
}

/**
 * Global felgräns. Utan den släcks hela sidan (vit skärm) så fort någon
 * komponent kastar ett fel, vilket är exakt vad som hände på Rapporter.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[App] Ohanterat renderingsfel:", error, info.componentStack);
    if (isStaleBundleError(error)) {
      const last = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
            <h1 className="text-base font-semibold text-foreground">Något gick fel</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sidan kunde inte visas. Ladda om sidan eller gå tillbaka till Översikt.
            </p>
            <p className="mt-3 break-words rounded-md bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
              {this.state.error.message || "Okänt fel"}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Ladda om
              </button>
              <button
                type="button"
                onClick={() => {
                  window.location.href = "/";
                }}
                className="rounded-md border px-3 py-1.5 text-xs font-medium text-foreground"
              >
                Till Översikt
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
