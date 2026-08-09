import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

export type MessageKind = "info" | "success" | "warning" | "error";

const styles: Record<MessageKind, { box: string; Icon: typeof Info }> = {
  info: { box: "bg-row-done border-row-done-edge text-row-done-text", Icon: Info },
  success: { box: "bg-row-ok border-row-ok-edge text-row-ok-text", Icon: CheckCircle2 },
  warning: { box: "bg-row-warn border-row-warn-edge text-row-warn-text", Icon: AlertTriangle },
  error: { box: "bg-row-late border-row-late-edge text-row-late-text", Icon: AlertTriangle },
};

/**
 * Tunn meddelandelist under handlingsraden, som i Dynamics 365. Används för
 * validering och resultat som ska stå kvar — inte försvinna som en toast.
 */
export function MessageBar({
  kind = "info",
  message,
  onDismiss,
}: {
  kind?: MessageKind;
  message: string;
  onDismiss?: () => void;
}) {
  const { box, Icon } = styles[kind];
  return (
    <div
      role="status"
      className={`flex items-center gap-2 border-l-4 px-3 py-2 text-sm ${box}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Stäng meddelande"
          className="shrink-0 rounded-sm p-1 hover:bg-foreground/10"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
