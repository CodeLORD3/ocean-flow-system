import { Loader2, AlertTriangle, Inbox } from "lucide-react";
import logoAsset from "@/assets/fiskskaldjur-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  state: "loading" | "empty" | "error";
  title?: string;
  message?: string;
  onRetry?: () => void;
  fullscreen?: boolean;
  className?: string;
};

const DEFAULTS = {
  loading: "Laddar…",
  empty: "Här finns inget ännu",
  error: "Något gick fel",
};

/** Gemensamt läge för laddar, tomt och fel — med logga, svensk text och Försök igen. */
export function PageState({ state, title, message, onRetry, fullscreen, className }: Props) {
  const Icon = state === "loading" ? Loader2 : state === "error" ? AlertTriangle : Inbox;
  return (
    <div
      role={state === "error" ? "alert" : "status"}
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 p-6 text-center",
        fullscreen ? "min-h-[100dvh] bg-background" : "min-h-[40vh]",
        className,
      )}
    >
      <img src={(logoAsset as { url: string }).url} alt="" className="h-14 w-auto opacity-90" />
      <Icon
        className={cn(
          "h-6 w-6",
          state === "loading" && "animate-spin text-muted-foreground",
          state === "error" && "text-destructive",
          state === "empty" && "text-muted-foreground",
        )}
      />
      <p className="text-base font-medium text-foreground">{title ?? DEFAULTS[state]}</p>
      {message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      {onRetry && state !== "loading" && (
        <Button className="h-11 min-w-[10rem] text-base" onClick={onRetry}>
          Försök igen
        </Button>
      )}
    </div>
  );
}
