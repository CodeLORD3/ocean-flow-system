import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  /** Om satt begränsas inrapporteringen till denna produktkategori */
  category?: string | null;
  /** Befintliga rader i product_stock_locations för scopet */
  items: any[];
}

interface Row {
  key: string;
  productId: string;
  name: string;
  quantity: string;
  unitCost: string;
}

const EMPTY_ROWS = 6;

const num = (v: string) => {
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

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

  const productOptions = useMemo(() => {
    const list = (products || []).filter((p: any) =>
      scope?.category ? (p.category || "Övrigt") === scope.category : true,
    );
    return list.sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "sv"));
  }, [products, scope?.category]);

  useEffect(() => {
    if (!open || !scope) return;
    const existing: Row[] = (scope.items || [])
      .slice()
      .sort((a: any, b: any) =>
        String(a.products?.name || "").localeCompare(String(b.products?.name || ""), "sv"),
      )
      .map((s: any, i: number) => ({
        key: `e${i}-${s.product_id}`,
        productId: s.product_id,
        name: s.products?.name || "",
        quantity: String(Number(s.quantity) || 0).replace(".", ","),
        unitCost: String(Number(s.unit_cost) || Number(s.products?.cost_price) || 0).replace(".", ","),
      }));
    const blanks: Row[] = Array.from({ length: EMPTY_ROWS }, (_, i) => ({
      key: `b${i}-${Date.now()}`,
      productId: "",
      name: "",
      quantity: "",
      unitCost: "",
    }));
    setRows([...existing, ...blanks]);
  }, [open, scope]);

  const setRow = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const pickProduct = (key: string, name: string) => {
    const match = productOptions.find(
      (p: any) => String(p.name).toLowerCase() === name.toLowerCase().trim(),
    );
    setRow(key, {
      name,
      productId: match?.id || "",
      ...(match && !rowsCostSet(key)
        ? { unitCost: String(Number(match.cost_price) || 0).replace(".", ",") }
        : {}),
    });
  };

  const rowsCostSet = (key: string) => {
    const r = rows.find((x) => x.key === key);
    return !!r && num(r.unitCost) > 0;
  };

  const filled = rows.filter((r) => r.productId && num(r.quantity) > 0);
  const totalQty = filled.reduce((s, r) => s + num(r.quantity), 0);
  const totalValue = filled.reduce((s, r) => s + num(r.quantity) * num(r.unitCost), 0);

  const fmt = (n: number) =>
    `${n.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} ${currency}`;

  const submit = async () => {
    if (!scope) return;
    setSaving(true);
    try {
      // 1. Upsert alla ifyllda rader
      if (filled.length > 0) {
        const { error } = await supabase.from("product_stock_locations").upsert(
          filled.map((r) => ({
            product_id: r.productId,
            location_id: scope.locationId,
            quantity: num(r.quantity),
            unit_cost: num(r.unitCost) || null,
            updated_at: new Date().toISOString(),
          })) as any,
          { onConflict: "product_id,location_id" },
        );
        if (error) throw error;
      }

      // 2. Nolla befintliga produkter i scopet som inte rapporterats in
      const keptIds = new Set(filled.map((r) => r.productId));
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
        description: `Lagerinrapportering: ${scope.category ? `${scope.category} — ` : ""}${scope.locationName} · ${filled.length} produkter · ${fmt(totalValue)}`,
        entity_type: "storage_location",
        entity_id: scope.locationId,
        store_id: scope.storeId || null,
        details: { category: scope.category || null, total_qty: totalQty, total_value: totalValue },
      });

      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      toast({
        title: "Inrapporterat",
        description: `${filled.length} produkter · nytt lagervärde ${fmt(totalValue)}`,
      });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            Inrapportering — {scope?.category ? `${scope.category} · ` : ""}
            {scope?.locationName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Fyll i produkter, vikt och pris per enhet. Vid inrapportering ersätts lagrets innehåll
            och lagervärdet med det du fyllt i.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-auto border border-border rounded-md">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/60 backdrop-blur">
              <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:text-[10px] [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
                <th className="w-8">Nr</th>
                <th>Produkt</th>
                <th className="w-28 text-right">Vikt / antal</th>
                <th className="w-28 text-right">Pris / enhet</th>
                <th className="w-28 text-right">Värde</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const value = num(r.quantity) * num(r.unitCost);
                const invalid = !!r.name.trim() && !r.productId;
                return (
                  <tr key={r.key} className="border-t border-border/50">
                    <td className="px-2 text-[10px] text-muted-foreground tabular-nums">{i + 1}</td>
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
                        value={r.quantity}
                        onChange={(e) => setRow(r.key, { quantity: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <Input
                        value={r.unitCost}
                        onChange={(e) => setRow(r.key, { unitCost: e.target.value })}
                        inputMode="decimal"
                        className="h-7 text-xs text-right font-mono tabular-nums"
                      />
                    </td>
                    <td className="px-2 text-right font-mono tabular-nums text-[11px]">
                      {value > 0 ? value.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) : "–"}
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
                <td className="px-2 py-1.5 text-[11px]">SUMMA ({filled.length} produkter)</td>
                <td className="px-2 text-right font-mono tabular-nums">
                  {totalQty.toLocaleString("sv-SE", { maximumFractionDigits: 1 })}
                </td>
                <td />
                <td className="px-2 text-right font-mono tabular-nums">
                  {totalValue.toLocaleString("sv-SE", { maximumFractionDigits: 0 })}
                </td>
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

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { key: `n${Date.now()}`, productId: "", name: "", quantity: "", unitCost: "" },
              ])
            }
          >
            <Plus className="h-3 w-3" /> Lägg till rad
          </Button>
          <span className="text-xs text-muted-foreground">
            Nytt lagervärde: <span className="font-semibold text-foreground">{fmt(totalValue)}</span>
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
