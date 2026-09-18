import { useState } from "react";
import { ShoppingBasket, X } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import CountStepper from "@/components/inventory/mobile/CountStepper";
import { useAddOrderLine, useRemoveOrderLine } from "@/hooks/useStoreReplenishment";
import { fmtQty } from "@/lib/mobileCount";
import type { ReplenishLine } from "@/lib/storeReplenishment";

/**
 * Beställ en vara till butiken direkt från räkningen. Ingen lagerrörelse
 * skapas här — varan hamnar på butikens utkast till grossisten och flyttas
 * först när leveransen skickas och tas emot.
 */
export default function OrderSheet({
  storeId,
  staffName,
  productId,
  productName,
  unit,
  wantedDate,
  existing,
  editable,
}: {
  storeId: string;
  staffName: string | null;
  productId: string;
  productName: string;
  unit: string;
  wantedDate: string;
  existing?: ReplenishLine | null;
  editable: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState(0);
  const [comment, setComment] = useState("");
  const addLine = useAddOrderLine();
  const removeLine = useRemoveOrderLine();

  const save = async () => {
    if (!(qty > 0)) {
      toast.error("Välj en mängd först.");
      return;
    }
    try {
      await addLine.mutateAsync({
        storeId,
        productId,
        quantity: qty,
        unit,
        comment: comment.trim() || null,
        source: "inventering",
        wantedDate,
        staffName,
      });
      setOpen(false);
      setComment("");
      // Meddelandet läggs högst upp: längst ner täcker det knappzonen.
      toast.success(`På beställningen: ${fmtQty(qty, unit)}`, { position: "top-center" });
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte lägga på beställningen.");
    }
  };

  const openSheet = () => {
    setQty(existing ? Number(existing.quantity_ordered) : 0);
    setComment(existing?.comment ?? "");
    setOpen(true);
  };

  return (
    <>
      {existing ? (
        <div className="flex h-14 min-h-[56px] items-center gap-2 rounded-2xl border border-primary/50 bg-primary/10 px-3">
          <button
            type="button"
            onClick={editable ? openSheet : undefined}
            className="flex min-w-0 flex-1 items-center gap-2 text-left text-[18px] font-semibold"
          >
            <ShoppingBasket className="h-6 w-6 shrink-0 text-primary" />
            <span className="truncate">
              På beställningen: {fmtQty(Number(existing.quantity_ordered), existing.unit)}
            </span>
          </button>
          {editable && (
            <button
              type="button"
              aria-label="Ta bort från beställningen"
              onClick={async () => {
                await removeLine.mutateAsync(existing.id);
                toast.success("Togs bort från beställningen", { position: "top-center" });
              }}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card"
            >
              <X className="h-6 w-6" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={openSheet}
          className="flex h-14 min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 text-[18px] font-semibold active:bg-muted"
        >
          <ShoppingBasket className="h-6 w-6 shrink-0 text-primary" />
          <span className="truncate">Beställ till imorgon</span>
        </button>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl px-4 pb-6 pt-4">
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading text-[22px] leading-tight">
              Beställ {productName}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-3">
            <CountStepper value={qty} unit={unit} onChange={setQty} />
            <div className="grid grid-cols-4 gap-2">
              {[1, 2, 5, 10].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQty(n)}
                  className="h-14 min-h-[56px] rounded-2xl border border-border bg-card text-[20px] font-semibold tabular-nums active:bg-muted"
                >
                  {n}
                </button>
              ))}
            </div>
            <Input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Kort kommentar (valfritt)"
              className="h-14 min-h-[56px] text-[18px]"
            />
            <button
              type="button"
              onClick={save}
              className="flex h-16 min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground active:opacity-90"
            >
              <ShoppingBasket className="h-6 w-6" /> Lägg på beställningen
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
