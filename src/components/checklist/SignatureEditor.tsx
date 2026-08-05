import { useState } from "react";
import { toast } from "sonner";
import { PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStaff } from "@/hooks/useStaff";
import { useSetChecklistSignature, staffInitials, ChecklistItem } from "@/hooks/useChecklist";

/** Signaturcell som kan ändras i efterhand — för en rad eller alla klara uppgifter. */
export function SignatureEditor({
  item,
  storeId,
  allItems,
  className,
}: {
  item: ChecklistItem;
  storeId?: string | null;
  allItems: ChecklistItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { data: staff = [] } = useStaff(storeId || undefined);
  const setSignature = useSetChecklistSignature();

  const suggestions = Array.from(
    new Set(staff.map((s) => staffInitials(s.first_name, s.last_name)).filter((s) => s && s !== "–"))
  );

  const apply = (signature: string, scope: "row" | "all") => {
    const ids =
      scope === "row"
        ? [item.id]
        : allItems.filter((i) => i.section === item.section && i.signature).map((i) => i.id);
    setSignature.mutate(
      { ids, signature },
      {
        onSuccess: (sig) => {
          setOpen(false);
          setDraft("");
          toast.success(
            scope === "row"
              ? `Signaturen ändrad till ${sig}.`
              : `${ids.length} uppgifter i ${item.section.toLowerCase()} signerade med ${sig}.`
          );
        },
        onError: (e: any) => toast.error(e.message || "Kunde inte ändra signaturen."),
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
          title="Klicka för att ändra signatur"
        >
          {item.signature || "–"}
          <PenLine className="h-3 w-3 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 space-y-2.5" align="end">
        <div>
          <p className="text-xs font-semibold text-foreground">Ändra signatur</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Sätt rätt person på uppgiften i efterhand.
          </p>
        </div>

        {suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <Button
                key={s}
                variant={draft === s ? "default" : "outline"}
                size="sm"
                className="h-7 px-2 text-[11px] font-mono"
                onClick={() => setDraft(s)}
              >
                {s}
              </Button>
            ))}
          </div>
        )}

        <Input
          autoFocus
          value={draft}
          placeholder="Initialer, t.ex. EF"
          maxLength={8}
          className="h-8 text-xs uppercase"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && draft.trim() && apply(draft, "row")}
        />

        <div className="flex flex-col gap-1.5">
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!draft.trim() || setSignature.isPending}
            onClick={() => apply(draft, "row")}
          >
            Spara på denna uppgift
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            disabled={!draft.trim() || setSignature.isPending}
            onClick={() => apply(draft, "all")}
          >
            Sätt på alla signerade i {item.section.toLowerCase()}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
