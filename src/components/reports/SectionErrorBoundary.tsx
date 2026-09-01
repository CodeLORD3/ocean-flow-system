import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

type Props = { title?: string; children: ReactNode };
type State = { error: Error | null };

/**
 * Felgräns per rapportsektion. Kraschar en sektion visas ett felmeddelande
 * i just det kortet i stället för att hela sidan släcks.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Rapporter] ${this.props.title ?? "Sektion"} kraschade:`, error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-destructive">
                {this.props.title ?? "Sektionen"} kunde inte visas
              </p>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {this.state.error.message || "Okänt fel"}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-7 text-xs"
                onClick={() => this.setState({ error: null })}
              >
                Försök igen
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
