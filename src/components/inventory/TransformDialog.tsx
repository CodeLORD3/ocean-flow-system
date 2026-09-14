import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Package, Plus, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import { useStorageLocations, useAllStockByLocation } from "@/hooks/useStorageLocations";
import { usePerformTransformation } from "@/hooks/useStockTransformations";
import { TRANSFORM_KINDS, type TransformKind } from "@/lib/stockTransform";
import { lotBalancesAtLocation } from "@/lib/stockLedger";
import { generateSku } from "@/lib/productCategories";

const UNITS = ["KG", "ST", "L", "FÖRP"];

/** Talfält som tål både komma och punkt. */
const num = (v: string) => Number(String(v).replace(",", ".")) || 0;

const localNowValue = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Produkten som omvandlas (källa). */
  product: { id: string; name: string; sku?: string | null; unit?: string | null } | null;
  /** Förvald lagerplats — annars väljs den bland platser med saldo. */
  locationId?: string | null;
  storeId?: string | null;
  onDone?: () => void;
}

/**
 * Omvandlingsflödet: källparti → typ → målprodukt → utfall → svinn → tidpunkt.
 * Konsumerar källpartiet och skapar ett parti av målprodukten på samma
 * lagerplats, med spårbarhet tillbaka till källan.
 */
export default function TransformDialog({ open, onOpenChange, product, locationId, storeId, onDone }: Props) {
  const { toast } = useToast();
  const { data: products = [] } = useProducts();
  const { data: categories = [] } = useCategories();
  const { data: staff } = useCurrentStaff();
  const { data: locations = [] } = useStorageLocations(storeId || undefined);
  const { data: allStock = [] } = useAllStockByLocation();
  const perform = usePerformTransformation();

  const [locId, setLocId] = useState<string>("");
  const [lotId, setLotId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<TransformKind>("dela_upp");
  const [targetId, setTargetId] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [createNew, setCreateNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSku, setNewSku] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newUnit, setNewUnit] = useState("KG");
  const [packSize, setPackSize] = useState("");
  const [packages, setPackages] = useState("");
  const [outQty, setOutQty] = useState("");
  const [wasteQty, setWasteQty] = useState("");
  const [wasteReason, setWasteReason] = useState("");
  const [when, setWhen] = useState(localNowValue());
  const [who, setWho] = useState("");

  const unit = product?.unit || "kg";

  // Lagerplatser med saldo för produkten (inom valt bolag/butik).
  const stockRows = useMemo(
    () =>
      (allStock as any[]).filter(
        (s) =>
          s.product_id === product?.id &&
          Number(s.quantity) > 0 &&
          (!storeId || s.storage_locations?.store_id === storeId),
      ),
    [allStock, product?.id, storeId],
  );

  useEffect(() => {
    if (!open) return;
    setWhen(localNowValue());
    setWho(staffFullName(staff) || "");
    const preferred = locationId && stockRows.some((s) => s.location_id === locationId) ? locationId : stockRows[0]?.location_id || "";
    setLocId(preferred || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id, locationId, stockRows.length]);

  useEffect(() => {
    if (!open) {
      setLotId(null);
      setAmount("");
      setTargetId("");
      setTargetSearch("");
      setCreateNew(false);
      setNewName("");
      setNewSku("");
      setNewCategory("");
      setPackSize("");
      setPackages("");
      setOutQty("");
      setWasteQty("");
      setWasteReason("");
    }
  }, [open]);

  const currentRow = stockRows.find((s) => s.location_id === locId);
  const locationQty = Number(currentRow?.quantity) || 0;
  const unitCost = Number(currentRow?.unit_cost) || 0;

  // Partier på valda lagerplatsen, med partinummer och datum.
  const lotsQuery = useQuery({
    queryKey: ["transform-lots", product?.id, locId],
    enabled: open && !!product?.id && !!locId,
    queryFn: async () => {
      const balances = await lotBalancesAtLocation(product!.id, locId);
      const ids = balances.map((b) => b.lotId).filter((v): v is string => !!v);
      let meta: Record<string, any> = {};
      if (ids.length) {
        const { data } = await supabase
          .from("lots")
          .select("id, lot_number, best_before, created_at, catch_area")
          .in("id", ids);
        for (const l of data || []) meta[(l as any).id] = l;
      }
      return balances
        .filter((b) => b.quantityKg > 0.001)
        .map((b) => ({
          lotId: b.lotId,
          quantityKg: b.quantityKg,
          lotNumber: b.lotId ? meta[b.lotId]?.lot_number ?? "Okänt parti" : "Utan parti",
          bestBefore: b.lotId ? meta[b.lotId]?.best_before ?? null : null,
          arrived: b.lotId ? meta[b.lotId]?.created_at ?? null : null,
        }));
    },
  });
  const lots = lotsQuery.data || [];

  useEffect(() => {
    if (!open) return;
    if (lots.length && !lots.some((l) => l.lotId === lotId)) setLotId(lots[0].lotId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locId, lots.length]);

  const selectedLot = lots.find((l) => l.lotId === lotId);
  const maxQty = selectedLot ? selectedLot.quantityKg : locationQty;

  const targetOptions = useMemo(() => {
    const q = targetSearch.trim().toLowerCase();
    return products
      .filter((p) => p.id !== product?.id && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [products, targetSearch, product?.id]);

  const targetProduct = products.find((p) => p.id === targetId);
  const targetUnit = createNew ? newUnit.toLowerCase() : targetProduct?.unit?.toLowerCase() || "kg";

  // Antal förpackningar × storlek räknar fram total mängd, men mängden går
  // också att skriva direkt (t.ex. vid kokning där utvikten vägs).
  useEffect(() => {
    const p = num(packages);
    const s = num(packSize);
    if (p > 0 && s > 0) setOutQty(String(Math.round(p * s * 1000) / 1000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages, packSize]);

  const amountNum = num(amount);
  const outNum = num(outQty);
  const yieldPct = amountNum > 0 && outNum > 0 ? Math.round((outNum / amountNum) * 1000) / 10 : null;

  const canSubmit =
    !!product &&
    !!locId &&
    amountNum > 0 &&
    amountNum + num(wasteQty) <= maxQty + 0.001 &&
    outNum > 0 &&
    (createNew ? !!newName.trim() && !!newCategory : !!targetId) &&
    !perform.isPending;

  const submit = async () => {
    if (!product || !canSubmit) return;
    try {
      let finalTargetId = targetId;
      let finalTargetName = targetProduct?.name || "";

      if (createNew) {
        const sku = newSku.trim() || generateSku(newCategory);
        const { data, error } = await supabase
          .from("products")
          .insert({
            name: newName.trim(),
            sku,
            category: newCategory,
            unit: newUnit,
            weight_per_piece: num(packSize) || 0,
            cost_price: 0,
            wholesale_price: 0,
            retail_suggested: 0,
          } as any)
          .select("id, name")
          .single();
        if (error) throw error;
        finalTargetId = (data as any).id;
        finalTargetName = (data as any).name;
      }

      const shelfDays = Number((products.find((p) => p.id === finalTargetId) as any)?.shelf_life_days) || 0;
      const bestBefore = shelfDays
        ? new Date(Date.now() + shelfDays * 86400000).toISOString().slice(0, 10)
        : null;

      const res = await perform.mutateAsync({
        storeId: currentRow?.storage_locations?.store_id ?? storeId ?? null,
        locationId: locId,
        sourceProductId: product.id,
        sourceProductName: product.name,
        sourceLotId: lotId,
        sourceQuantity: amountNum,
        sourceUnitCost: unitCost || null,
        targetProductId: finalTargetId,
        targetProductName: finalTargetName,
        targetQuantity: outNum,
        targetPackages: num(packages) || null,
        targetBestBefore: bestBefore,
        kind,
        wasteQuantity: num(wasteQty),
        wasteReason: wasteReason || null,
        performedAt: when ? new Date(when).toISOString() : null,
        performedByName: who || null,
      });

      toast({
        title: "Omvandling klar",
        description: `${amountNum} ${unit} ${product.name} → ${outNum} ${targetUnit} ${finalTargetName} (utbyte ${res.yieldPct} %)`,
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2">
            <RefreshCw className="h-4 w-4" /> Omvandla {product?.name}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Källpartiet minskar och ett nytt parti av målprodukten skapas på samma lagerplats — med
            spårbarhet tillbaka till källan.
          </DialogDescription>
        </DialogHeader>

        {!product ? null : stockRows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ingen lagerplats har saldo för den här produkten.</p>
        ) : (
          <div className="space-y-4">
            {/* 1. Källa */}
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">1. Källa</Label>
              {stockRows.length > 1 && (
                <Select value={locId} onValueChange={setLocId}>
                  <SelectTrigger className="h-10 text-xs">
                    <SelectValue placeholder="Välj lagerplats" />
                  </SelectTrigger>
                  <SelectContent>
                    {stockRows.map((s) => (
                      <SelectItem key={s.location_id} value={s.location_id} className="text-xs">
                        {s.storage_locations?.name} · {Number(s.quantity).toLocaleString("sv-SE")} {unit}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <div className="space-y-1.5">
                {lots.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    Inga partier hittades — hela saldot ({locationQty.toLocaleString("sv-SE")} {unit}) används utan
                    partikoppling.
                  </p>
                )}
                {lots.map((l) => (
                  <button
                    key={l.lotId ?? "none"}
                    type="button"
                    onClick={() => setLotId(l.lotId)}
                    className={`w-full text-left rounded-md border px-3 py-2 text-xs transition-colors ${
                      lotId === l.lotId ? "border-primary bg-primary/10" : "border-border/50 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono truncate">{l.lotNumber}</span>
                      <span className="font-mono tabular-nums">
                        {l.quantityKg.toLocaleString("sv-SE")} {unit}
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {l.arrived ? `Ankom ${new Date(l.arrived).toLocaleDateString("sv-SE")}` : "Ankomstdatum saknas"}
                      {l.bestBefore ? ` · Bäst före ${l.bestBefore}` : ""}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-[11px]">Mängd att omvandla ({unit})</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-11 text-right font-mono tabular-nums"
                    placeholder="0"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-11 text-xs"
                  onClick={() => setAmount(String(maxQty))}
                >
                  Hela partiet
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Tillgängligt: {maxQty.toLocaleString("sv-SE")} {unit}
              </p>
            </div>

            <Separator />

            {/* 2. Typ */}
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">2. Typ av omvandling</Label>
              <div className="grid gap-1.5 sm:grid-cols-3">
                {TRANSFORM_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`rounded-md border px-2.5 py-2 text-left transition-colors ${
                      kind === k.value ? "border-primary bg-primary/10" : "border-border/50 hover:bg-muted/40"
                    }`}
                  >
                    <p className="text-xs font-medium">{k.label}</p>
                    <p className="text-[10px] text-muted-foreground">{k.hint}</p>
                  </button>
                ))}
              </div>
            </div>

            <Separator />

            {/* 3. Målprodukt */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">3. Målprodukt</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 text-[11px]"
                  onClick={() => {
                    setCreateNew((v) => !v);
                    setTargetId("");
                  }}
                >
                  <Plus className="h-3 w-3" /> {createNew ? "Välj befintlig" : "Skapa ny produkt"}
                </Button>
              </div>

              {createNew ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px]">Namn *</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="h-10 text-xs"
                      placeholder="t.ex. Varmrökt lax 200 g vakuum"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">SKU (valfritt)</Label>
                    <Input
                      value={newSku}
                      onChange={(e) => setNewSku(e.target.value)}
                      className="h-10 font-mono text-xs"
                      placeholder="Skapas automatiskt"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Kategori *</Label>
                    <Select value={newCategory} onValueChange={setNewCategory}>
                      <SelectTrigger className="h-10 text-xs">
                        <SelectValue placeholder="Välj kategori" />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.name} className="text-xs">
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Enhet</Label>
                    <Select value={newUnit} onValueChange={setNewUnit}>
                      <SelectTrigger className="h-10 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNITS.map((u) => (
                          <SelectItem key={u} value={u} className="text-xs">
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={targetSearch}
                      onChange={(e) => setTargetSearch(e.target.value)}
                      className="h-10 pl-8 text-xs"
                      placeholder="Sök produkt att omvandla till"
                    />
                  </div>
                  <div className="space-y-1">
                    {targetOptions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setTargetId(p.id)}
                        className={`w-full rounded-md border px-3 py-2 text-left text-xs transition-colors ${
                          targetId === p.id ? "border-primary bg-primary/10" : "border-border/50 hover:bg-muted/40"
                        }`}
                      >
                        <span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span> {p.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* 4. Utfall */}
            <div className="space-y-2">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">4. Utfall</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Antal förp.</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={packages}
                    onChange={(e) => setPackages(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-11 text-right font-mono tabular-nums"
                    placeholder="0"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Storlek/förp.</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={packSize}
                    onChange={(e) => setPackSize(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-11 text-right font-mono tabular-nums"
                    placeholder="0,2"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Total mängd ({targetUnit})</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={outQty}
                    onChange={(e) => setOutQty(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="h-11 text-right font-mono tabular-nums"
                    placeholder="0"
                  />
                </div>
              </div>
              {yieldPct !== null && (
                <Badge variant="outline" className="text-[10px]">
                  <Package className="mr-1 h-3 w-3" /> Utbyte {yieldPct.toLocaleString("sv-SE")} %
                </Badge>
              )}
            </div>

            <Separator />

            {/* 5. Svinn */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Svinn ({unit}, valfritt)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={wasteQty}
                  onChange={(e) => setWasteQty(e.target.value)}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-11 text-right font-mono tabular-nums"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Anledning</Label>
                <Input
                  value={wasteReason}
                  onChange={(e) => setWasteReason(e.target.value)}
                  className="h-11 text-xs"
                  placeholder="t.ex. spill vid skärning"
                />
              </div>
            </div>

            {/* 6. Tidpunkt och utförare */}
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Datum och tid</Label>
                <Input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  className="h-11 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Utförd av</Label>
                <Input value={who} onChange={(e) => setWho(e.target.value)} className="h-11 text-xs" placeholder="Namn" />
              </div>
            </div>

            {amountNum + num(wasteQty) > maxQty + 0.001 && (
              <p className="text-[11px] text-destructive">
                Mängd plus svinn är större än partiets saldo ({maxQty.toLocaleString("sv-SE")} {unit}).
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button size="sm" onClick={submit} disabled={!canSubmit}>
            {perform.isPending ? "Omvandlar…" : "Bekräfta omvandling"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
