import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertTriangle, Check, Factory, Plus, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useProducts } from "@/hooks/useProducts";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  useYields,
  useCutSplits,
  useProcessingSurcharges,
  useMarginTargets,
  useVatRates,
  useCreateProductionOrder,
  surchargeFor,
  vatFor,
  rollingAverage,
  useYieldActuals,
} from "@/hooks/useProductionYields";
import { calcDetailPrice, batchMargin, fmt, FORMS, isProcessedForm } from "@/lib/filletMath";
import { addStock, withdrawStock } from "@/lib/productionStock";

export interface FilletPrefill {
  product_id?: string | null;
  sku?: string | null;
  name?: string;
  quantity?: number;
  unit_price?: number;
  supplier_name?: string | null;
  batch_number?: string | null;
  line_id?: string | null;
}

export const PREFILL_KEY = "fillet_prefill";

interface DetailRow {
  key: string;
  included: boolean;
  name: string;
  form: string;
  pct: number; // procent av råvaran
  marginWeight: number;
  isProcessed: boolean;
  productId: string | null;
  category: string | null;
}

/** Mall-grupp för uppdelning när arten saknar egna rader. */
function templateGroup(note: string | null, toForm: string): string | null {
  const n = (note ?? "").toLowerCase();
  if (n.includes("plattfisk")) return "plattfisk";
  if (n.includes("laxfisk")) return "laxfisk";
  if (toForm.includes("filé")) return "rundfisk";
  if (toForm.includes("sida")) return "laxfisk";
  return null;
}

export function ProductionOrderForm() {
  const { data: yields = [] } = useYields();
  const { data: splits = [] } = useCutSplits();
  const { data: actuals = [] } = useYieldActuals();
  const { data: surcharges = [] } = useProcessingSurcharges();
  const { data: margins = [] } = useMarginTargets();
  const { data: vats = [] } = useVatRates();
  const { data: products = [] } = useProducts();
  const { staff } = useStaffAuth();
  const createOrder = useCreateProductionOrder();
  const qc = useQueryClient();

  const [rawProductId, setRawProductId] = useState<string | null>(null);
  const [rawName, setRawName] = useState("");
  const [rawSku, setRawSku] = useState("");
  const [species, setSpecies] = useState("");
  const [rawForm, setRawForm] = useState("hel");
  const [rawQty, setRawQty] = useState("");
  const [price, setPrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [batch, setBatch] = useState("");
  const [lineId, setLineId] = useState<string | null>(null);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [applyRegion, setApplyRegion] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const speciesOptions = useMemo(
    () => [...new Set(yields.map((y) => y.species_group))].sort((a, b) => a.localeCompare(b, "sv")),
    [yields]
  );

  useEffect(() => {
    if (!applyRegion && margins.length) setApplyRegion(margins[0].region);
  }, [margins, applyRegion]);

  /* ── Prefill från inköpsrapportering ─────────────────────── */
  const applyPrefill = (p: FilletPrefill) => {
    setRawProductId(p.product_id ?? null);
    setRawName(p.name ?? "");
    setRawSku(p.sku ?? "");
    setRawQty(p.quantity != null ? String(p.quantity) : "");
    setPrice(p.unit_price != null ? String(p.unit_price) : "");
    setSupplier(p.supplier_name ?? "");
    setBatch(p.batch_number ?? "");
    setLineId(p.line_id ?? null);
    const guess = speciesOptions.find((s) => (p.name ?? "").toLowerCase().includes(s.split("-")[0]));
    if (guess) setSpecies(guess);
  };

  useEffect(() => {
    const read = () => {
      const raw = sessionStorage.getItem(PREFILL_KEY);
      if (!raw) return;
      try {
        applyPrefill(JSON.parse(raw) as FilletPrefill);
      } catch {
        /* ignore */
      }
      sessionStorage.removeItem(PREFILL_KEY);
    };
    read();
    const handler = () => read();
    window.addEventListener("fillet-prefill", handler);
    return () => window.removeEventListener("fillet-prefill", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speciesOptions.length]);

  /* ── Föreslå detaljer utifrån utbytesregistret ────────────── */
  const suggest = () => {
    if (!species) return;
    const rows = yields.filter((y) => y.species_group === species && y.from_form === rawForm);
    if (rows.length === 0) {
      toast({ title: "Ingen utbytesrad", description: `Saknar rader för ${species} från "${rawForm}".`, variant: "destructive" });
      return;
    }
    const out: DetailRow[] = [];
    rows.forEach((y, ri) => {
      const basePct = Number(y.yield_pct);
      const group = splits.some((s) => s.species_group === species) ? species : templateGroup(y.note, y.to_form);
      const rowSplits = group ? splits.filter((s) => s.species_group === group && !s.is_optional) : [];
      const isFillet = y.to_form.includes("filé") || y.to_form.includes("sida");
      if (isFillet && rowSplits.length > 0) {
        rowSplits.forEach((s, si) => {
          out.push({
            key: `${y.id}-${s.id}`,
            included: true,
            name: `${species} ${s.detail_form}`,
            form: s.detail_form,
            pct: Number(((basePct * Number(s.pct_of_fillet)) / 100).toFixed(2)),
            marginWeight: Number(s.margin_weight),
            isProcessed: isProcessedForm(s.detail_form),
            productId: null,
            category: null,
          });
        });
      } else {
        out.push({
          key: `${y.id}-${ri}`,
          included: !y.to_form.includes("huvud") && !y.to_form.includes("ben"),
          name: `${species} ${y.to_form}`,
          form: y.to_form,
          pct: basePct,
          marginWeight: 1,
          isProcessed: isProcessedForm(y.to_form),
          productId: null,
          category: null,
        });
      }
    });
    setDetails(out);
  };

  const rawQtyNum = parseFloat(rawQty) || 0;
  const priceNum = parseFloat(price) || 0;
  const included = details.filter((d) => d.included);
  const pctSum = included.reduce((s, d) => s + (Number(d.pct) || 0), 0);
  const wastePct = 100 - pctSum;
  const deviates = pctSum > 100.01;

  const regionTargets = margins.map((m) => ({ region: m.region, label: m.label || m.region, target: Number(m.target_pct) }));

  const priced = useMemo(() => {
    return included.map((d) => {
      const product = products.find((p) => p.id === d.productId);
      const category = product?.category ?? d.category;
      const surcharge = d.isProcessed ? surchargeFor(surcharges, category ?? "Färsk Fisk") : 0;
      const vat = vatFor(vats, category);
      const qty = (rawQtyNum * (Number(d.pct) || 0)) / 100;
      const byRegion = regionTargets.map((r) => ({
        region: r.region,
        label: r.label,
        ...calcDetailPrice({
          purchasePricePerKg: priceNum,
          totalYieldPct: Number(d.pct) || 0,
          surchargePerKg: surcharge,
          targetMarginPct: r.target,
          marginWeight: Number(d.marginWeight) || 1,
          vatPct: vat,
        }),
      }));
      return { detail: d, qty, surcharge, vat, byRegion, product };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, products, surcharges, vats, margins, rawQty, price]);

  const batchMargins = regionTargets.map((r) => ({
    ...r,
    ...batchMargin({
      purchasePricePerKg: priceNum,
      rawQuantity: rawQtyNum,
      lines: priced.map((p) => ({
        qty: p.qty,
        priceExVat: p.byRegion.find((b) => b.region === r.region)?.priceExVat ?? 0,
      })),
    }),
  }));

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q)).slice(0, 8);
  }, [products, productSearch]);

  const setDetail = (key: string, patch: Partial<DetailRow>) =>
    setDetails((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const yieldWarning = useMemo(() => {
    const rows = yields.filter((y) => y.species_group === species && y.from_form === rawForm);
    return rows.filter((y) => {
      const avg = rollingAverage(actuals, y.species_group, y.from_form, y.to_form);
      return y.is_estimate && (avg?.count ?? 0) < 3;
    });
  }, [yields, actuals, species, rawForm]);

  /* ── Registrera tillverkningsorder ───────────────────────── */
  const register = async () => {
    if (!rawName || rawQtyNum <= 0 || included.length === 0) {
      toast({ title: "Ofullständigt", description: "Ange råvara, kvantitet och minst en detalj.", variant: "destructive" });
      return;
    }
    try {
      const lines = included.map((d, i) => {
        const p = priced.find((x) => x.detail.key === d.key)!;
        return {
          product_id: d.productId,
          detail_name: d.name,
          detail_form: d.form,
          planned_pct: Number(d.pct) || 0,
          planned_qty: p.qty,
          cost_price: p.byRegion[0]?.rawCostPerKg ?? 0,
          margin_weight: Number(d.marginWeight) || 1,
          is_processed: d.isProcessed,
          sort_order: i,
        };
      });

      const order = await createOrder.mutateAsync({
        order: {
          production_date: new Date().toISOString().slice(0, 10),
          created_by: staff ? `${staff.first_name} ${staff.last_name}` : null,
          species_group: species || null,
          raw_product_id: rawProductId,
          raw_sku: rawSku || null,
          raw_name: rawName,
          raw_form: rawForm,
          raw_quantity: rawQtyNum,
          purchase_price_per_kg: priceNum,
          supplier_name: supplier || null,
          batch_number: batch || null,
          purchase_report_line_id: lineId,
          waste_pct: Math.max(0, wastePct),
        } as any,
        lines,
      });

      // Uttag av råvaran + inleverans av varje styckdetalj
      if (rawProductId) await withdrawStock(rawProductId, rawQtyNum);
      for (const l of lines) {
        if (l.product_id) await addStock(l.product_id, l.planned_qty, l.cost_price);
      }
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });

      toast({
        title: "Tillverkningsorder registrerad",
        description: `${rawName}: ${included.length} detaljer, ${fmt(Math.max(0, wastePct), 1)} % svinn.`,
      });
      void order;
      setDetails([]);
      setRawName("");
      setRawQty("");
      setPrice("");
      setBatch("");
      setLineId(null);
      setRawProductId(null);
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  };

  /* ── Använd föreslaget pris ──────────────────────────────── */
  const applyPrice = async (productId: string, priceIncVat: number, label: string) => {
    const { error } = await supabase.from("products").update({ retail_suggested: priceIncVat }).eq("id", productId);
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    toast({ title: "Pris uppdaterat", description: `${label}: ${fmt(priceIncVat, 0)} kr` });
  };

  const massRows = priced
    .filter((p) => p.detail.productId)
    .map((p) => ({
      productId: p.detail.productId!,
      name: p.detail.name,
      current: Number(p.product?.retail_suggested ?? 0),
      suggested: p.byRegion.find((b) => b.region === applyRegion)?.priceIncVat ?? 0,
    }));

  const applyAll = async () => {
    for (const r of massRows) {
      await supabase.from("products").update({ retail_suggested: r.suggested }).eq("id", r.productId);
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    setPreviewOpen(false);
    toast({ title: "Priser uppdaterade", description: `${massRows.length} produkter fick nytt föreslaget pris.` });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Råvara in</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[11px]">Råvara</Label>
              <Input value={rawName} onChange={(e) => setRawName(e.target.value)} className="h-8 text-xs" placeholder="t.ex. Torsk hel" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Koppla produkt (för lageruttag)</Label>
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="h-8 text-xs"
                placeholder="Sök sku eller namn…"
              />
              {filteredProducts.length > 0 && (
                <div className="rounded-md border bg-popover">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      className="block w-full px-2 py-1 text-left text-[11px] hover:bg-muted"
                      onClick={() => {
                        setRawProductId(p.id);
                        setRawSku(p.sku);
                        if (!rawName) setRawName(p.name);
                        setProductSearch("");
                      }}
                    >
                      {p.sku} · {p.name}
                    </button>
                  ))}
                </div>
              )}
              {rawProductId && <p className="text-[10px] text-muted-foreground">Kopplad: {rawSku}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Art</Label>
              <Select value={species} onValueChange={setSpecies}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Välj art" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {speciesOptions.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Form in</Label>
              <Select value={rawForm} onValueChange={setRawForm}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {FORMS.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Kvantitet (kg)</Label>
              <Input type="number" step="0.1" value={rawQty} onChange={(e) => setRawQty(e.target.value)} className="h-8 text-xs text-right font-mono tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Inköpspris (kr/kg)</Label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-8 text-xs text-right font-mono tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Leverantör</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Parti</Label>
              <Input value={batch} onChange={(e) => setBatch(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={suggest} disabled={!species}>
              <Plus className="h-3.5 w-3.5" /> Föreslå styckdetaljer
            </Button>
            {yieldWarning.length > 0 && (
              <Badge variant="outline" className="gap-1 border-amber-400 text-[10px] text-amber-600">
                <AlertTriangle className="h-3 w-3" /> {yieldWarning.length} utbytesrad(er) är branschvärden, ej kalibrerade mot 3 partier
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {details.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between py-3">
            <CardTitle className="text-sm">Styckdetaljer ut</CardTitle>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-mono tabular-nums">Summa detaljer: {fmt(pctSum, 1)} %</span>
              <span className="font-mono tabular-nums">Svinn: {fmt(Math.max(0, wastePct), 1)} %</span>
              {deviates ? (
                <Badge variant="outline" className="gap-1 border-destructive text-[10px] text-destructive">
                  <AlertTriangle className="h-3 w-3" /> Summan överstiger 100 % av råvaran
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-emerald-500 text-[10px] text-emerald-600">
                  <Check className="h-3 w-3" /> Summa + svinn = 100 %
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="w-[36px]" />
                    <TableHead className="text-[11px] min-w-[150px]">Detalj</TableHead>
                    <TableHead className="text-[11px] w-[150px]">Produkt (lager/pris)</TableHead>
                    <TableHead className="text-[11px] w-[80px] text-right">% av råvara</TableHead>
                    <TableHead className="text-[11px] w-[80px] text-right">kg</TableHead>
                    <TableHead className="text-[11px] w-[80px] text-right">Marg.vikt</TableHead>
                    <TableHead className="text-[11px] w-[90px] text-right">Kostpris</TableHead>
                    <TableHead className="text-[11px] w-[70px] text-right">Påslag</TableHead>
                    {regionTargets.map((r) => (
                      <TableHead key={r.region} className="text-[11px] text-right w-[130px]">
                        {r.label.split(" (")[0]} ({fmt(r.target, 0)} %)
                      </TableHead>
                    ))}
                    <TableHead className="w-[36px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((d) => {
                    const p = priced.find((x) => x.detail.key === d.key);
                    const qty = (rawQtyNum * (Number(d.pct) || 0)) / 100;
                    return (
                      <TableRow key={d.key} className={`h-9 ${d.included ? "" : "opacity-50"}`}>
                        <TableCell className="py-0.5">
                          <Checkbox checked={d.included} onCheckedChange={(v) => setDetail(d.key, { included: !!v })} />
                        </TableCell>
                        <TableCell className="py-0.5">
                          <Input value={d.name} onChange={(e) => setDetail(d.key, { name: e.target.value })} className="h-7 text-[11px]" />
                        </TableCell>
                        <TableCell className="py-0.5">
                          <Select value={d.productId ?? "none"} onValueChange={(v) => setDetail(d.key, { productId: v === "none" ? null : v })}>
                            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value="none" className="text-xs">Ej kopplad</SelectItem>
                              {products.map((pr) => (
                                <SelectItem key={pr.id} value={pr.id} className="text-xs">{pr.sku} · {pr.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="py-0.5">
                          <Input
                            type="number"
                            step="0.1"
                            value={d.pct}
                            onChange={(e) => setDetail(d.key, { pct: parseFloat(e.target.value) || 0 })}
                            className="h-7 text-[11px] text-right font-mono tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(qty, 1)}</TableCell>
                        <TableCell className="py-0.5">
                          <Input
                            type="number"
                            step="0.05"
                            value={d.marginWeight}
                            onChange={(e) => setDetail(d.key, { marginWeight: parseFloat(e.target.value) || 1 })}
                            className="h-7 text-[11px] text-right font-mono tabular-nums"
                          />
                        </TableCell>
                        <TableCell className="text-[11px] text-right font-mono tabular-nums">
                          {p ? fmt(p.byRegion[0]?.rawCostPerKg ?? 0) : "—"}
                        </TableCell>
                        <TableCell className="py-0.5 text-right">
                          <Checkbox checked={d.isProcessed} onCheckedChange={(v) => setDetail(d.key, { isProcessed: !!v })} />
                        </TableCell>
                        {regionTargets.map((r) => {
                          const b = p?.byRegion.find((x) => x.region === r.region);
                          return (
                            <TableCell key={r.region} className="py-0.5 text-right text-[11px]">
                              {b ? (
                                <div className="flex items-center justify-end gap-1">
                                  <span className="font-mono tabular-nums font-medium">{fmt(b.priceIncVat, 0)} kr</span>
                                  <span className="text-[10px] text-muted-foreground">{fmt(b.actualMarginPct, 0)} %</span>
                                  {d.productId && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-1 text-[10px]"
                                      onClick={() => applyPrice(d.productId!, b.priceIncVat, `${d.name} · ${r.label}`)}
                                    >
                                      Använd
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                "—"
                              )}
                            </TableCell>
                          );
                        })}
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => setDetails((prev) => prev.filter((x) => x.key !== d.key))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
              <div className="flex flex-wrap gap-3 text-[11px]">
                {batchMargins.map((b) => (
                  <div key={b.region} className="rounded-md border px-2 py-1">
                    <span className="text-muted-foreground">Partiets marginal {b.label.split(" (")[0]}: </span>
                    <span className={`font-mono tabular-nums font-semibold ${b.marginPct < b.target ? "text-destructive" : "text-emerald-600"}`}>
                      {fmt(b.marginPct, 1)} %
                    </span>
                    <span className="ml-1 text-muted-foreground">
                      (intäkt {fmt(b.revenueExVat, 0)} kr / råvara {fmt(b.rawCost, 0)} kr)
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Select value={applyRegion} onValueChange={setApplyRegion}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue placeholder="Region" /></SelectTrigger>
                  <SelectContent>
                    {regionTargets.map((r) => <SelectItem key={r.region} value={r.region} className="text-xs">{r.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-8 text-xs" disabled={massRows.length === 0}>
                      Använd föreslagna priser ({massRows.length})
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle className="text-sm">Förhandsgranskning av nya priser</DialogTitle></DialogHeader>
                    <Table>
                      <TableHeader>
                        <TableRow className="h-8">
                          <TableHead className="text-[11px]">Produkt</TableHead>
                          <TableHead className="text-[11px] text-right">Nuvarande</TableHead>
                          <TableHead className="text-[11px] text-right">Nytt</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {massRows.map((r) => (
                          <TableRow key={r.productId} className="h-8">
                            <TableCell className="text-[11px]">{r.name}</TableCell>
                            <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(r.current, 0)} kr</TableCell>
                            <TableCell className="text-[11px] text-right font-mono tabular-nums font-semibold">{fmt(r.suggested, 0)} kr</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPreviewOpen(false)}>Avbryt</Button>
                      <Button onClick={applyAll}>Spara priser</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={register} disabled={createOrder.isPending}>
                  <Factory className="h-3.5 w-3.5" /> Registrera tillverkning
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
