import { useMemo, useState } from "react";
import { Plus, Search, ShoppingBasket } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import CountStepper from "@/components/inventory/mobile/CountStepper";
import { useProducts } from "@/hooks/useProducts";
import { useAddOrderLine } from "@/hooks/useStoreReplenishment";
import { fmtQty } from "@/lib/mobileCount";

/**
 * Lägg en vara direkt på butikens beställning till grossisten.
 * Ingen lagerrörelse skapas här — raden hamnar på dagens utkast.
 */
export default function AddReplenishLineSheet({
  storeId,
  wantedDate,
  staffName,
  dayLabel,
}: {
  storeId: string | null;
  wantedDate: string;
  staffName: string | null;
  dayLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string; unit: string } | null>(null);
  const [qty, setQty] = useState(0);
  const [comment, setComment] = useState("");
  const products = useProducts();
  const addLine = useAddOrderLine();

  const hits = useMemo(() => {
    const term = q.trim().toLowerCase();
    const rows = products.data ?? [];
    if (!term) return rows.slice(0, 30);
    return rows
      .filter((p: any) => String(p.name || "").toLowerCase().includes(term))
      .slice(0, 40);
  }, [q, products.data]);

  const close = () => {
    setOpen(false);
    setQ("");
    setPicked(null);
    setQty(0);
    setComment("");
  };

  const save = async () => {
    if (!storeId || !picked) return;
    if (!(qty > 0)) {
      toast.error("Välj en mängd först.");
      return;
    }
    try {
      await addLine.mutateAsync({
        storeId,
        productId: picked.id,
        quantity: qty,
        unit: picked.unit || "kg",
        comment: comment.trim() || null,
        source: "manuell",
        wantedDate,
        staffName,
      });
      toast.success(`På beställningen: ${picked.name} ${fmtQty(qty, picked.unit || "kg")}`, {
        position: "top-center",
      });
      close();
    } catch (e: any) {
      toast.error(e?.message || "Kunde inte lägga varan på beställningen.");
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={!storeId}
        onClick={() => setOpen(true)}
        className="flex h-16 min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground disabled:opacity-50"
      >
        <Plus className="h-6 w-6" /> Lägg till vara
      </button>

      <Sheet open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <SheetContent
          side="bottom"
          className="flex max-h-[92vh] flex-col rounded-t-3xl px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
        >
          <SheetHeader className="text-left">
            <SheetTitle className="font-heading text-[22px] leading-tight">
              {picked ? `Beställ ${picked.name}` : "Lägg till vara"}
            </SheetTitle>
          </SheetHeader>

          {picked ? (
            <div className="mt-3 space-y-3 overflow-y-auto">
              <CountStepper value={qty} unit={picked.unit || "kg"} onChange={setQty} />
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
                disabled={addLine.isPending}
                className="flex h-16 min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[20px] font-semibold text-primary-foreground disabled:opacity-50"
              >
                <ShoppingBasket className="h-6 w-6" />
                {dayLabel ? `Lägg på beställningen till ${dayLabel}` : "Lägg på beställningen"}
              </button>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="h-14 min-h-[56px] w-full rounded-2xl border border-border bg-card text-[18px] font-semibold active:bg-muted"
              >
                Välj en annan vara
              </button>
            </div>
          ) : (
            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Sök vara"
                  className="h-14 min-h-[56px] pl-11 text-[18px]"
                />
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                {products.isLoading && (
                  <p className="text-[17px] text-muted-foreground">Hämtar varor…</p>
                )}
                {!products.isLoading && hits.length === 0 && (
                  <p className="text-[17px] text-muted-foreground">Ingen vara matchar sökningen.</p>
                )}
                {hits.map((p: any) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setPicked({ id: p.id, name: p.name, unit: p.unit || "kg" });
                      setQty(p.unit === "st" ? 1 : 1);
                    }}
                    className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2 text-left active:bg-muted"
                  >
                    {p.image_url ? (
                      <img
                        src={p.image_url}
                        alt=""
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <ShoppingBasket className="h-6 w-6 text-muted-foreground" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[18px] font-semibold leading-snug">
                        {p.name}
                      </span>
                      <span className="block text-[16px] text-muted-foreground">
                        {p.category ? `${p.category} · ` : ""}
                        {p.unit || "kg"}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
