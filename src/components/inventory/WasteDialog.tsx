import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { recordMovement } from "@/lib/stockLedger";
import { logActivity } from "@/hooks/useActivityLog";
import { Trash2 } from "lucide-react";

const WASTE_REASONS = [
  "Utgånget datum",
  "Kvalitetsbrist",
  "Trasigt emballage",
  "Kylkedja bruten",
  "Provsmakning",
  "Övrigt",
];

const num = (v: string) => {
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

/** Kassation/svinn — bokförs som en utgående lagerrörelse med orsak. */
export default function WasteDialog({
  open,
  onOpenChange,
  items,
  locationName,
  storeId,
  currency = "SEK",
  initialRowId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Rader från product_stock_locations för aktuell lagerplats */
  items: any[];
  locationName?: string;
  storeId?: string | null;
  currency?: string;
  /** Förvald lagerrad (product_stock_locations.id), t.ex. från en produktrad i lagret. */
  initialRowId?: string | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rowId, setRowId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState(WASTE_REASONS[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRowId(initialRowId || "");
  }, [open, initialRowId]);

  const options = useMemo(
    () =>
      (items || [])
        .filter((i: any) => Number(i.quantity) > 0)
        .sort((a: any, b: any) =>
          String(a.products?.name || "").localeCompare(String(b.products?.name || ""), "sv"),
        ),
    [items],
  );

  const selected = options.find((o: any) => o.id === rowId);
  const cost = Number(selected?.avg_cost ?? selected?.unit_cost ?? 0);
  const value = num(qty) * cost;

  const submit = async () => {
    if (!selected || num(qty) <= 0) return;
    setSaving(true);
    try {
      await recordMovement({
        productId: selected.product_id,
        locationId: selected.location_id,
        quantityKg: num(qty),
        movementType: "svinn",
        unitCost: cost || null,
        referenceType: "svinn",
        note: `${reason}${note ? ` · ${note}` : ""}`,
      });
      await logActivity({
        action_type: "delete",
        description: `Svinn: ${selected.products?.name} ${num(qty)} kg · ${reason} · ${Math.round(value)} ${currency}`,
        entity_type: "storage_location",
        entity_id: selected.location_id,
        store_id: storeId || null,
      });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      toast({ title: "Svinn bokfört", description: `${num(qty)} kg · ${reason}` });
      setRowId("");
      setQty("");
      setNote("");
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Kunde inte bokföra", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-base uppercase tracking-wide">
            <Trash2 className="h-4 w-4" /> Kassation / svinn
          </DialogTitle>
          <DialogDescription className="text-xs">
            {locationName ? `${locationName} — ` : ""}Bokförs som utgående lagerrörelse med orsak.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide">Produkt</span>
            <select
              value={rowId}
              onChange={(e) => setRowId(e.target.value)}
              className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Välj produkt…</option>
              {options.map((o: any) => (
                <option key={o.id} value={o.id}>
                  {o.products?.name} — {Number(o.quantity).toLocaleString("sv-SE")} kg
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Kilo</span>
              <Input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="decimal"
                placeholder="0,0"
                className="h-10 text-right font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide">Orsak</span>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {WASTE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide">Kommentar</span>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="text-sm" />
          </div>

          {selected && num(qty) > 0 && (
            <p className="text-xs text-muted-foreground">
              Kostpris {cost.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} {currency}/kg ·
              svinnvärde{" "}
              <span className="font-semibold text-foreground">
                {value.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} {currency}
              </span>
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={saving || !selected || num(qty) <= 0}
          >
            {saving ? "Bokför…" : "Bokför svinn"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
