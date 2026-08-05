import { useState } from "react";
import { toast } from "sonner";
import { PenLine, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStaff } from "@/hooks/useStaff";
import {
  useRequestSignatureChange,
  useCancelSignatureRequest,
  staffInitials,
  ChecklistItem,
  SignatureRequest,
} from "@/hooks/useChecklist";

/** Signaturcell — ändring sker via förfrågan som mottagaren måste acceptera. */
export function SignatureEditor({
  item,
  storeId,
  allItems,
  pendingRequests = [],
  className,
}: {
  item: ChecklistItem;
  storeId?: string | null;
  allItems: ChecklistItem[];
  pendingRequests?: SignatureRequest[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const { data: staff = [] } = useStaff(storeId || undefined);
  const request = useRequestSignatureChange();
  const cancel = useCancelSignatureRequest();

  const pending = pendingRequests.find((r) => r.item_id === item.id);
  const selected = staff.find((s) => s.id === targetId);

  const send = (scope: "row" | "all") => {
    if (!selected) return;
    const items =
      scope === "row"
        ? [item]
        : allItems.filter((i) => i.section === item.section && i.signature);
    request.mutate(
      {
        items,
        signature: staffInitials(selected.first_name, selected.last_name),
        targetStaffId: selected.id,
        dayId: item.day_id,
        storeId,
      },
      {
        onSuccess: ({ sig, count }) => {
          setOpen(false);
          setTargetId(null);
          toast.success(
            `Förfrågan skickad till ${selected.first_name} (${sig}) för ${count} uppgift${count === 1 ? "" : "er"}. Signaturen ändras när den accepteras.`
          );
        },
        onError: (e: any) => toast.error(e.message || "Kunde inte skicka förfrågan."),
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-foreground hover:bg-muted transition-colors",
            className
          )}
          title={
            pending
              ? `Väntar på att ${pending.requested_signature} accepterar signaturbytet`
              : "Klicka för att begära signaturbyte"
          }
        >
          {item.signature || "–"}
          {pending ? (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              <Clock className="h-3 w-3" />
              {pending.requested_signature}?
            </span>
          ) : (
            <PenLine className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-2.5" align="end">
        <div>
          <p className="text-xs font-semibold text-foreground">Begär signaturbyte</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Signaturen ändras först när personen accepterar förfrågan.
          </p>
        </div>

        {pending && (
          <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 space-y-1.5">
            <p className="text-[11px] text-foreground">
              Väntar på svar från <span className="font-semibold">{pending.requested_signature}</span>. Nuvarande
              signatur ligger kvar tills dess.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 w-full text-[11px]"
              disabled={cancel.isPending}
              onClick={() =>
                cancel.mutate(pending.id, {
                  onSuccess: () => {
                    setOpen(false);
                    toast.success("Förfrågan avbruten.");
                  },
                })
              }
            >
              Avbryt förfrågan
            </Button>
          </div>
        )}

        {staff.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Ingen personal registrerad på butiken — lägg upp personal för att kunna skicka förfrågan.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {staff.map((s) => (
              <Button
                key={s.id}
                variant={targetId === s.id ? "default" : "outline"}
                size="sm"
                className="h-7 px-2 text-[11px]"
                onClick={() => setTargetId(s.id)}
              >
                <span className="font-mono mr-1">{staffInitials(s.first_name, s.last_name)}</span>
                {s.first_name}
              </Button>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!targetId || request.isPending}
            onClick={() => send("row")}
          >
            Skicka förfrågan för denna uppgift
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!targetId || request.isPending}
            onClick={() => send("all")}
          >
            Skicka för alla signerade i {item.section.toLowerCase()}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
