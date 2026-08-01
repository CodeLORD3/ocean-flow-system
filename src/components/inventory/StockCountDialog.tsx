import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { logActivity } from "@/hooks/useActivityLog";
import { Plus, Trash2, ClipboardCheck } from "lucide-react";

export interface StockCountScope {
  locationId: string;
  locationName: string;
  storeId?: string | null;
  storeName?: string | null;
  /** Om satt begränsas inrapporteringen till denna produktkategori */
  category?: string | null;
  /** Befintliga rader i product_stock_locations för scopet */
  items: any[];
}

interface Row {
  key: string;
  productId: string;
  name: string;
  /** START (FRÅN LAGER) kg */
  start: string;
  /** DATUM (FRÅN LAGER) */
  startDate: string;
  /** PÅFYLLT UNDER DAGEN kg */
  refill: string;
  /** SLUT (VID STÄNGNING) kg */
  end: string;
  /** KÄLLA VID STÄNGNING (placeras tillbaka på) */
  source: string;
  unitCost: string;
}

const EMPTY_ROWS = 6;
const MIN_ROWS = 18;

const num = (v: string) => {
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

const dec = (n: number, d = 1) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const todayISO = () => new Date().toISOString().slice(0, 10);

const blankRow = (i: number): Row => ({
  key: `b${i}-${Math.random().toString(36).slice(2)}`,
  productId: "",
  name: "",
  start: "",
  startDate: "",
  refill: "",
  end: "",
  source: "",
  unitCost: "",
});

export default function StockCountDialog({
  open,
  onOpenChange,
  scope,
  products,
  currency,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: StockCountScope | null;
  products: any[];
  currency: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [sheetDate, setSheetDate] = useState(todayISO());
  const [responsible, setResponsible] = useState("");
  const [notes, setNotes] = useState("");

  const productOptions = useMemo(() => {
    const list = (products || []).filter((p: any) =>
      scope?.category ? (p.category || "Övrigt") === scope.category : true,
    );
    return list.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "sv"));
  }, [products, scope?.category]);

  useEffect(() => {
    if (!open || !scope) return;
    setSheetDate(todayISO());
    setResponsible("");
    setNotes("");
    const existing: Row[] = (scope.items || [])
      .slice()
      .sort((a: any, b: any) =>
        String(a.products?.name || "").localeCompare(String(b.products?.name || ""), "sv"),
      )
      .map((s: any, i: number) => ({
        key: `e${i}-${s.product_id}`,
        productId: s.product_id,
        name: s.products?.name || "",
        start: String(Number(s.quantity) || 0).replace(".", ","),
        startDate: "",
        refill: "",
        end: "",
        source: scope.locationName,
        unitCost: String(Number(s.unit_cost) || Number(s.products?.cost_price) || 0).replace(
          ".",
          ",",
        ),
      }));
    const blanksNeeded = Math.max(EMPTY_ROWS, MIN_ROWS - existing.length);
    setRows([...existing, ...Array.from({ length: blanksNeeded }, (_, i) => blankRow(i))]);
  }, [open, scope]);

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickProduct = (key: string, name: string) => {
    const match = productOptions.find(
      (p: any) => String(p.name).toLowerCase() === name.toLowerCase().trim(),
    );
    setRows((prev) =>
      prev.map((r) =>
        r.key === key
          ? {
              ...r,
              name,
              productId: match?.id || "",
              unitCost:
                match && num(r.unitCost) === 0
                  ? String(Number(match.cost_price) || 0).replace(".", ",")
                  : r.unitCost,
            }
          : r,
      ),
    );
  };

  const sold = (r: Row) => num(r.start) + num(r.refill) - num(r.end);

  const active = rows.filter((r) => r.productId && (r.name.trim() !== ""));
  const totals = {
    start: active.reduce((s, r) => s + num(r.start), 0),
    refill: active.reduce((s, r) => s + num(r.refill), 0),
    end: active.reduce((s, r) => s + num(r.end), 0),
    sold: active.reduce((s, r) => s + sold(r), 0),
    value: active.reduce((s, r) => s + num(r.end) * num(r.unitCost), 0),
  };

  const fmtMoney = (n: number) =>
    `${n.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} ${currency}`;

  const submit = async () => {
    if (!scope) return;
    setSaving(true);
    try {
      // Slutvärdet (SLUT vid stängning) blir det nya lagersaldot
      const keep = active.filter((r) => num(r.end) > 0);
      if (keep.length > 0) {
        const { error } = await supabase.from("product_stock_locations").upsert(
          keep.map((r) => ({
            product_id: r.productId,
            location_id: scope.locationId,
            quantity: num(r.end),
            unit_cost: num(r.unitCost) || null,
            updated_at: new Date().toISOString(),
          })) as any,
          { onConflict: "product_id,location_id" },
        );
        if (error) throw error;
      }

      const keptIds = new Set(keep.map((r) => r.productId));
      const removeIds = (scope.items || [])
        .map((s: any) => s.product_id)
        .filter((id: string) => !keptIds.has(id));
      if (removeIds.length > 0) {
        const { error } = await supabase
          .from("product_stock_locations")
          .delete()
          .eq("location_id", scope.locationId)
          .in("product_id", removeIds);
        if (error) throw error;
      }

      await logActivity({
        action_type: "update",
        description: `Lagerinrapportering: ${scope.category ? `${scope.category} — ` : ""}${scope.locationName} · ${keep.length} produkter · sålt ${dec(totals.sold)} kg · ${fmtMoney(totals.value)}`,
        entity_type: "storage_location",
        entity_id: scope.locationId,
        store_id: scope.storeId || null,
        details: {
          category: scope.category || null,
          sheet_date: sheetDate,
          responsible: responsible || null,
          notes: notes || null,
          totals,
          lines: active.map((r) => ({
            product_id: r.productId,
            name: r.name,
            start: num(r.start),
            start_date: r.startDate || null,
            refill: num(r.refill),
            end: num(r.end),
            sold: sold(r),
            source_at_close: r.source || null,
          })),
        },
      });

      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      toast({
        title: "Inrapporterat",
        description: `${keep.length} produkter · nytt lagervärde ${fmtMoney(totals.value)}`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const sourceChain = [
    "Makrilltrade",
    scope?.storeName || undefined,
    scope?.locationName,
    scope?.category || undefined,
  ].filter(Boolean) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] xl:max-w-[1400px]">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 justify-center text-lg uppercase tracking-wide">
            <ClipboardCheck className="h-4 w-4" />
            {scope?.category ? `${scope.category} · ` : ""}
            {scope?.locationName}
          </DialogTitle>
          {scope?.storeName && (
            <p className="text-center text-xs text-muted-foreground">{scope.storeName}</p>
          )}
          <DialogDescription className="text-xs text-center">
            Digital kopia av lagerlappen. SLUT (vid stängning) blir det nya lagersaldot.
          </DialogDescription>
        </DialogHeader>

        {/* Topprad: DATUM / LAGERSTÄLLE / ANSVARIG */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border border-border rounded-md p-3">
          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
            Datum:
            <Input
              type="date"
              value={sheetDate}
              onChange={(e) => setSheetDate(e.target.value)}
              className="h-7 text-xs font-normal"
            />
          </label>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
            Lagerställe / plats:
            <span className="truncate text-xs font-normal normal-case text-muted-foreground">
              {scope?.locationName}
              {scope?.category ? ` — ${scope.category}` : ""}
            </span>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
            Ansvarig:
            <Input
              value={responsible}
              onChange={(e) => setResponsible(e.target.value)}
              className="h-7 text-xs font-normal"
              placeholder="Namn"
            />
          </label>
        </div>

        <div className="max-h-[50vh] overflow-auto border border-border rounded-md">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 backdrop-blur">
              <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-center [&>th]:text-[10px] [&>th]:uppercase [&>th]:leading-tight [&>th]:tracking-wide [&>th]:text-muted-foreground [&>th]:align-middle">
                <th className="w-8">Nr</th>
                <th className="text-left">Produktnamn</th>
                <th className="w-24">
                  Start
                  <br />
                  (från lager) kg
                </th>
                <th className="w-32">
                  Datum
                  <br />
                  (från lager)
                </th>
                <th className="w-24">
                  Påfyllt
                  <br />
                  under dagen kg
                </th>
                <th className="w-24">
                  Slut
                  <br />
                  (vid stängning) kg
                </th>
                <th className="w-24">
                  Sålt kg
                  <br />
                  (Start + Påfyllt – Slut)
                </th>
                <th className="w-40">
                  Källa vid stängning
                  <br />
                  (placeras tillbaka på)
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const invalid = !!r.name.trim() && !r.productId;
                const s = sold(r);
                return (
                  <tr key={r.key} className="border-t border-border/50">
                    <td className="px-2 text-center text-[10px] text-muted-foreground tabular-nums">
                      {i + 1}
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        list="stock-count-products"
                        value={r.name}
                        onChange={(e) => pickProduct(r.key, e.target.value)}
                        placeholder="Sök produkt…"
                        className={`h-7 text-xs ${invalid ? "border-destructive" : ""}`}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        value={r.start}
                        onChange={(e) => setRow(r.key, { start: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        type="date"
                        value={r.startDate}
                        onChange={(e) => setRow(r.key, { startDate: e.target.value })}
                        className="h-7 text-xs font-mono"
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        value={r.refill}
                        onChange={(e) => setRow(r.key, { refill: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        value={r.end}
                        onChange={(e) => setRow(r.key, { end: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="px-2 text-right font-mono tabular-nums text-[11px]">
                      {r.productId ? dec(s) : "–"}
                    </td>
                    <td className="px-1 py-0.5 bg-primary/5">
                      <Input
                        value={r.source}
                        onChange={(e) => setRow(r.key, { source: e.target.value })}
                        placeholder="Lagerplats"
                        className="h-7 text-xs"
                      />
                    </td>
                    <td className="px-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground"
                        onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-muted/60 backdrop-blur">
              <tr className="border-t border-border font-semibold">
                <td />
                <td className="px-2 py-1.5 text-center text-[11px]">SUMMA (kg)</td>
                <td className="px-2 text-right font-mono tabular-nums">{dec(totals.start)}</td>
                <td />
                <td className="px-2 text-right font-mono tabular-nums">{dec(totals.refill)}</td>
                <td className="px-2 text-right font-mono tabular-nums">{dec(totals.end)}</td>
                <td className="px-2 text-right font-mono tabular-nums">{dec(totals.sold)}</td>
                <td className="bg-primary/5" />
                <td />
              </tr>
            </tfoot>
          </table>
          <datalist id="stock-count-products">
            {productOptions.map((p: any) => (
              <option key={p.id} value={p.name} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Noteringar / kommentarer
          </span>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setRows((prev) => [...prev, blankRow(prev.length)])}
          >
            <Plus className="h-3 w-3" /> Lägg till rad
          </Button>
          <span className="text-[10px] text-muted-foreground">
            Källa: {sourceChain.join(" › ")}
          </span>
          <span className="text-xs text-muted-foreground">
            Nytt lagervärde:{" "}
            <span className="font-semibold text-foreground">{fmtMoney(totals.value)}</span>
          </span>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Sparar…" : "Inrapportera"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
