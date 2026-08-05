import { toast } from "sonner";
import { Check, X, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useMySignatureRequests,
  useRespondSignatureRequest,
} from "@/hooks/useChecklist";

/** Inkorg för signaturförfrågningar som gäller den inloggade personen. */
export function SignatureRequestInbox() {
  const { data: requests = [] } = useMySignatureRequests();
  const respond = useRespondSignatureRequest();

  if (requests.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <p className="text-xs sm:text-sm font-semibold text-foreground">
          Signaturförfrågningar ({requests.length})
        </p>
      </div>
      <div className="space-y-1.5">
        {requests.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-card px-2.5 py-2"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {r.checklist_items?.time_label ? `${r.checklist_items.time_label} · ` : ""}
                {r.checklist_items?.task || "Uppgift"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {r.requested_by_name || "Någon"} vill sätta din signatur{" "}
                <span className="font-mono font-semibold">{r.requested_signature}</span>
                {r.previous_signature ? ` (nu ${r.previous_signature})` : ""}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate(
                    { request: r, accept: true },
                    { onSuccess: () => toast.success("Signaturen är nu ändrad till dig.") }
                  )
                }
              >
                <Check className="h-3.5 w-3.5 mr-1" /> Acceptera
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate(
                    { request: r, accept: false },
                    { onSuccess: () => toast.success("Förfrågan avvisad — signaturen ligger kvar.") }
                  )
                }
              >
                <X className="h-3.5 w-3.5 mr-1" /> Avvisa
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
