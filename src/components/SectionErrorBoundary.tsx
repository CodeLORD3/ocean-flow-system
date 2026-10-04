import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode; label?: string };
type State = { error: Error | null };

/** Felgräns för en del av sidan, så att ett fel inte tömmer hela skärmen. */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label ?? "Sektion"}] Renderingsfel:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-[15px] sm:text-sm">
        <p className="font-medium text-foreground">{this.props.label ?? "Den här delen"} kunde inte visas.</p>
        <p className="mt-1 text-muted-foreground">{this.state.error.message}</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => this.setState({ error: null })}>
          Försök igen
        </Button>
      </div>
    );
  }
}
