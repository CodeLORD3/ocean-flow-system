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
  useProcessingSurcharges,
  useMarginTargets,
  useVatRates,
  useCreateProductionOrder,
  useSpeciesCutModels,
  useCutModelSplits,
  useDetailPrices,
  useByproductPrices,
  useUpsertDetailPrice,
  useUpsertByproductPrice,
  surchargeFor,
  vatFor,
  rollingAverage,
  useYieldActuals,
} from "@/hooks/useProductionYields";
import {
  allocateRawCost,
  batchMargin,
  priceByByproductMethod,
  fmt,
  FORMS,
  isProcessedForm,
} from "@/lib/filletMath";
import {
  CUT_MODEL_LABELS,
  CUT_MODEL_TEMPLATES,
  CutModel,
  MODEL_MIN_PIECE_WEIGHT,
  detailFormLabel,
  modelForSpecies,
  normalizeDetailForm,
} from "@/lib/cutModels";
import { SPECIES_GROUP_SUGGESTIONS } from "@/lib/speciesGroups";
import { speciesKey } from "@/lib/asciiFold";
import { addStock, withdrawStock, GROSSIST_FLYTANDE_ID } from "@/lib/productionStock";
import { pickRawLots, createOutputLot, recordLotTransformation } from "@/lib/lotTransformation";

import { evaluateAutoApproval } from "@/lib/autoApproval";

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
  role: "primary" | "byproduct";
  marginWeight: number;
  /** Manuellt marknadspris inkl moms för biprodukter. */
  byproductPrice: string;
  isProcessed: boolean;
  productId: string | null;
  category: string | null;
}

export function ProductionOrderForm() {
  const { data: yields = [] } = useYields();
  const { data: actuals = [] } = useYieldActuals();
  const { data: surcharges = [] } = useProcessingSurcharges();
  const { data: margins = [] } = useMarginTargets();
  const { data: vats = [] } = useVatRates();
  const { data: products = [] } = useProducts();
  const { data: cutModels = [] } = useSpeciesCutModels();
  const { data: modelSplits = [] } = useCutModelSplits();
  const { data: detailPrices = [] } = useDetailPrices();
  const { data: byproductPrices = [] } = useByproductPrices();
  const upsertDetailPrice = useUpsertDetailPrice();
  const upsertByproductPrice = useUpsertByproductPrice();
  const { staff } = useStaffAuth();
  const createOrder = useCreateProductionOrder();
  const qc = useQueryClient();

  const [rawProductId, setRawProductId] = useState<string | null>(null);
  const [rawName, setRawName] = useState("");
  const [rawSku, setRawSku] = useState("");
  const [species, setSpecies] = useState("");
  const [rawForm, setRawForm] = useState("hel");
  const [rawQty, setRawQty] = useState("");
  const [pieceWeight, setPieceWeight] = useState("");
  const [price, setPrice] = useState("");
  const [supplier, setSupplier] = useState("");
  const [batch, setBatch] = useState("");
  const [lineId, setLineId] = useState<string | null>(null);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [applyRegion, setApplyRegion] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const speciesOptions = useMemo(
    () =>
      [
        ...new Set([
          ...cutModels.map((c) => c.species_group),
          ...yields.map((y) => y.species_group),
          ...SPECIES_GROUP_SUGGESTIONS,
        ]),
      ].sort((a, b) => a.localeCompare(b, "sv")),
    [yields, cutModels],
  );

  useEffect(() => {
    if (!applyRegion && margins.length) setApplyRegion(margins[0].region);
  }, [margins, applyRegion]);

  /* ── Artens styckningsmodell ─────────────────────────────── */
  const modelRow = cutModels.find((c) => speciesKey(c.species_group) === speciesKey(species));
  const cutModel = (modelRow?.cut_model as CutModel) ?? modelForSpecies(species);
  const minPieceWeight =
    modelRow?.min_piece_weight_kg != null
      ? Number(modelRow.min_piece_weight_kg)
      : MODEL_MIN_PIECE_WEIGHT[cutModel] ?? null;

  const modelDetails = useMemo(() => {
    const rows = modelSplits.filter((s) => s.cut_model === cutModel);
    if (rows.length > 0)
      return rows.map((s) => ({
        form: s.detail_form,
        name: s.detail_name || detailFormLabel(s.detail_form),
        pctOfFillet: Number(s.pct_of_fillet),
        role: (s.role === "primary" ? "primary" : "byproduct") as "primary" | "byproduct",
        optional: s.is_optional,
        marginWeight: Number(s.margin_weight) || 1,
      }));
    return CUT_MODEL_TEMPLATES[cutModel].map((d) => ({
      form: d.form,
      name: d.name,
      pctOfFillet: d.pctOfFillet,
      role: d.role,
      optional: !!d.optional,
      marginWeight: 1,
    }));
  }, [modelSplits, cutModel]);

  const pieceWeightNum = parseFloat(pieceWeight) || 0;
  const pieceWeightWarning =
    minPieceWeight != null && pieceWeightNum > 0 && pieceWeightNum < minPieceWeight;

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

  const lastSetFor = (form: string) => {
    const f = normalizeDetailForm(form);
    const row = detailPrices.find(
      (d) => speciesKey(d.species_group) === speciesKey(species) && normalizeDetailForm(d.detail_form) === f,
    );
    return Number(row?.last_set_price) || 0;
  };

  const byproductPriceFor = (form: string) => {
    const f = normalizeDetailForm(form);
    const row = byproductPrices.find(
      (d) => speciesKey(d.species_group) === speciesKey(species) && normalizeDetailForm(d.detail_form) === f,
    );
    return Number(row?.price_incl_vat) || 0;
  };

  /* ── Föreslå detaljer utifrån modell och utbyte ───────────── */
  const suggest = () => {
    if (!species) return;
    const rows = yields.filter((y) => speciesKey(y.species_group) === speciesKey(species) && y.from_form === rawForm);
    const isFilletRow = (toForm: string) =>
      toForm.includes("filé") || toForm.includes("sida") || toForm === "loin" || toForm.includes("stjärt");
    const filletRow = rows
      .filter((y) => isFilletRow(y.to_form))
      .sort((a, b) => Number(b.yield_pct) - Number(a.yield_pct))[0];
    if (!filletRow) {
      toast({
        title: "Ingen utbytesrad",
        description: `Saknar utbyte för ${species} från "${rawForm}".`,
        variant: "destructive",
      });
      return;
    }
    const basePct = Number(filletRow.yield_pct);
    const out: DetailRow[] = modelDetails.map((m, i) => {
      const bp = m.role === "byproduct" ? byproductPriceFor(m.form) : 0;
      return {
        key: `${m.form}-${i}`,
        included: !m.optional,
        name: `${species} ${detailFormLabel(m.form)}`,
        form: m.form,
        pct: Number(((basePct * m.pctOfFillet) / 100).toFixed(2)),
        role: m.role,
        marginWeight: m.marginWeight,
        byproductPrice: bp > 0 ? String(bp) : "",
        isProcessed: isProcessedForm(m.form),
        productId: null,
        category: null,
      };
    });
    setDetails(out);
  };

  const rawQtyNum = parseFloat(rawQty) || 0;
  const priceNum = parseFloat(price) || 0;
  const included = details.filter((d) => d.included);
  const pctSum = included.reduce((s, d) => s + (Number(d.pct) || 0), 0);
  const wastePct = 100 - pctSum;
  const deviates = pctSum > 100.01;

  const regionTargets = margins.map((m) => ({
    region: m.region,
    label: m.label || m.region,
    target: Number(m.target_pct),
  }));

  /** Kilo, påslag, moms och kostpris per detalj. */
  const base = useMemo(() => {
    const qtys = included.map((d) => (rawQtyNum * (Number(d.pct) || 0)) / 100);
    const rawCosts = allocateRawCost(
      included.map((d, i) => ({ qtyKg: qtys[i] })),
      priceNum,
      rawQtyNum,
    );
    return included.map((d, i) => {
      const product = products.find((p) => p.id === d.productId);
      const category = product?.category ?? d.category;
      const surcharge = d.isProcessed ? surchargeFor(surcharges, category ?? "Färsk Fisk") : 0;
      const vat = vatFor(vats, category);
      return {
        detail: d,
        qty: qtys[i],
        rawCostPerKg: rawCosts[i],
        surcharge,
        vat,
        product,
        lastSetPrice: lastSetFor(d.form),
        byproductPrice: parseFloat(d.byproductPrice) || 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, products, surcharges, vats, rawQty, price, detailPrices]);

  /** Biproduktsmetoden per region. */
  const byRegion = useMemo(() => {
    const vatPct = base[0]?.vat ?? 6;
    return regionTargets.map((r) => {
      const res = priceByByproductMethod({
        purchasePricePerKg: priceNum,
        rawQuantity: rawQtyNum,
        targetMarginPct: r.target,
        vatPct,
        primaries: base
          .filter((b) => b.detail.role === "primary")
          .map((b) => ({
            key: b.detail.key,
            qtyKg: b.qty,
            marginWeight: b.detail.marginWeight,
            surchargePerKg: b.surcharge,
            lastSetPrice: b.lastSetPrice,
            vatPct: b.vat,
          })),
        byproducts: base
          .filter((b) => b.detail.role === "byproduct")
          .map((b) => ({
            key: b.detail.key,
            qtyKg: b.qty,
            priceInclVat: b.byproductPrice || null,
            surchargePerKg: b.surcharge,
            vatPct: b.vat,
          })),
      });
      // Partiets marginal när huvudprodukterna säljs på FÖRESLAGET pris.
      const atSuggested = batchMargin({
        purchasePricePerKg: priceNum,
        rawQuantity: rawQtyNum,
        lines: base.map((b) => {
          const p = res.primaries.find((x) => x.key === b.detail.key);
          const inc = p ? p.suggestedInclVat : b.byproductPrice;
          return { qty: b.qty, priceExVat: inc / (1 + b.vat / 100), surchargePerKg: b.surcharge };
        }),
      });
      return { ...r, res, atSuggested };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, margins, priceNum, rawQtyNum]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, productSearch]);

  const setDetail = (key: string, patch: Partial<DetailRow>) =>
    setDetails((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const yieldWarning = useMemo(() => {
    const rows = yields.filter((y) => speciesKey(y.species_group) === speciesKey(species) && y.from_form === rawForm);
    return rows.filter((y) => {
      const avg = rollingAverage(actuals, y.species_group, y.from_form, y.to_form);
      return y.is_estimate && (avg?.count ?? 0) < 3;
    });
  }, [yields, actuals, species, rawForm]);

  // Auto-godkännande: blockeras av requires_processing, osäkert utbyte eller marginal under mål.
  const rawRequiresProcessing = Boolean(
    (products.find((p) => p.id === rawProductId) as any)?.requires_processing,
  );
  const yieldConfirmed = yieldWarning.length === 0;
  const approvalByRegion = (region: { target: number; marginInclWorkPct: number }) =>
    evaluateAutoApproval({
      requiresProcessing: rawRequiresProcessing,
      yieldConfirmed,
      marginInclWorkPct: region.marginInclWorkPct,
      targetMarginPct: region.target,
    });

  const saveByproductPrice = (d: DetailRow) => {
    const value = parseFloat(d.byproductPrice) || 0;
    if (!species || d.role !== "byproduct" || value <= 0) return;
    upsertByproductPrice.mutate({ species_group: species, detail_form: normalizeDetailForm(d.form), price_incl_vat: value });
    upsertDetailPrice.mutate({
      species_group: species,
      detail_form: normalizeDetailForm(d.form),
      last_set_price: value,
      role: "byproduct",
    });
  };

  /* ── Registrera tillverkningsorder ───────────────────────── */
  const register = async () => {
    if (!rawName || rawQtyNum <= 0 || included.length === 0) {
      toast({ title: "Ofullständigt", description: "Ange råvara, kvantitet och minst en detalj.", variant: "destructive" });
      return;
    }
    try {
      const lines = base.map((b, i) => ({
        product_id: b.detail.productId,
        detail_name: b.detail.name,
        detail_form: b.detail.form,
        planned_pct: Number(b.detail.pct) || 0,
        planned_qty: b.qty,
        cost_price: b.rawCostPerKg,
        margin_weight: Number(b.detail.marginWeight) || 1,
        is_processed: b.detail.isProcessed,
        sort_order: i,
      }));

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

      // Partibindning: råvaran plockas FIFO ur sina partier och varje detalj får
      // ett eget parti som ärver fångstuppgifterna. Kopplingen loggas.
      const picks = rawProductId
        ? await pickRawLots(rawProductId, GROSSIST_FLYTANDE_ID, rawQtyNum)
        : [];
      const totalIn = picks.reduce((s, p) => s + p.quantityKg, 0) || rawQtyNum;

      if (rawProductId) {
        if (picks.length) {
          for (const p of picks) {
            await withdrawStock(rawProductId, p.quantityKg, GROSSIST_FLYTANDE_ID, {
              lotId: p.lotId,
              referenceType: "production_order",
              referenceId: order.id,
              note: p.lotId ? null : "Råvara utan parti — okänd härkomst",
            });
          }
        } else {
          await withdrawStock(rawProductId, rawQtyNum, GROSSIST_FLYTANDE_ID, {
            referenceType: "production_order",
            referenceId: order.id,
          });
        }
      }

      const sourceLotId = picks.find((p) => p.lotId)?.lotId ?? null;
      for (const l of lines) {
        if (!l.product_id || !l.planned_qty) continue;
        const outLotId = await createOutputLot(
          sourceLotId,
          {
            productId: l.product_id,
            quantityKg: l.planned_qty,
            unitCost: l.cost_price,
            detailName: l.detail_name,
          },
          order.id,
        );
        await addStock(l.product_id, l.planned_qty, l.cost_price, GROSSIST_FLYTANDE_ID, {
          lotId: outLotId,
          referenceType: "production_order",
          referenceId: order.id,
          note: l.detail_name,
        });
        // Andelen av varje råvaruparti som gick in i just den här detaljen.
        for (const p of picks) {
          const share = totalIn > 0 ? p.quantityKg / totalIn : 0;
          await recordLotTransformation({
            fromLotId: p.lotId,
            toLotId: outLotId,
            quantityInKg: l.planned_qty > 0 ? (l.planned_qty / (totalIn || 1)) * p.quantityKg : 0,
            quantityOutKg: l.planned_qty * share,
            productionOrderId: order.id,
          });
        }
      }
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["lots"] });


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

  /* ── Fastställ pris ──────────────────────────────────────── */
  const applyPrice = async (d: DetailRow, priceIncVat: number, label: string) => {
    if (d.productId) {
      const { error } = await supabase.from("products").update({ retail_suggested: priceIncVat }).eq("id", d.productId);
      if (error) {
        toast({ title: "Fel", description: error.message, variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["products"] });
    }
    if (species) {
      upsertDetailPrice.mutate({
        species_group: species,
        detail_form: normalizeDetailForm(d.form),
        last_set_price: priceIncVat,
        role: d.role,
      });
    }
    toast({ title: "Pris fastställt", description: `${label}: ${fmt(priceIncVat, 0)} kr` });
  };

  const activeRegion = byRegion.find((r) => r.region === applyRegion) ?? byRegion[0];

  const massRows = base
    .filter((b) => b.detail.productId)
    .map((b) => {
      const p = activeRegion?.res.primaries.find((x) => x.key === b.detail.key);
      return {
        productId: b.detail.productId!,
        name: b.detail.name,
        current: Number(b.product?.retail_suggested ?? 0),
        suggested: p ? p.suggestedInclVat : b.byproductPrice,
      };
    })
    .filter((r) => r.suggested > 0);

  const applyAll = async () => {
    for (const r of massRows) {
      await supabase.from("products").update({ retail_suggested: r.suggested }).eq("id", r.productId);
    }
    qc.invalidateQueries({ queryKey: ["products"] });
    setPreviewOpen(false);
    toast({ title: "Priser uppdaterade", description: `${massRows.length} produkter fick nytt föreslaget pris.` });
  };

  const allWarnings = [...new Set(byRegion.flatMap((r) => r.res.warnings))];

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
              {species && (
                <p className="text-[10px] text-muted-foreground">{CUT_MODEL_LABELS[cutModel]}</p>
              )}
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
              <Label className="text-[11px]">Styckvikt (kg/fisk)</Label>
              <Input type="number" step="0.1" value={pieceWeight} onChange={(e) => setPieceWeight(e.target.value)} className="h-8 text-xs text-right font-mono tabular-nums" />
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
            {pieceWeightWarning && (
              <Badge variant="outline" className="gap-1 border-amber-400 text-[10px] text-amber-600">
                <AlertTriangle className="h-3 w-3" /> Styckvikten under {fmt(minPieceWeight ?? 0, 1)} kg — fyrdelning
                är svår, överväg endast hel filé
              </Badge>
            )}
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
            <CardTitle className="text-sm">Styckdetaljer ut · biproduktsmetoden</CardTitle>
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
            {allWarnings.length > 0 && (
              <div className="space-y-1 border-b bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                {allWarnings.map((w) => (
                  <p key={w} className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="w-[36px]" />
                    <TableHead className="text-[11px] min-w-[150px]">Detalj</TableHead>
                    <TableHead className="text-[11px] w-[90px]">Roll</TableHead>
                    <TableHead className="text-[11px] w-[150px]">Produkt (lager/pris)</TableHead>
                    <TableHead className="text-[11px] w-[86px] text-right">% av råvara</TableHead>
                    <TableHead className="text-[11px] w-[64px] text-right">kg</TableHead>
                    <TableHead className="text-[11px] w-[80px] text-right">Marg.vikt</TableHead>
                    <TableHead className="text-[11px] w-[86px] text-right">Kostpris</TableHead>
                    <TableHead className="text-[11px] w-[60px] text-right">Påslag</TableHead>
                    <TableHead className="text-[11px] w-[110px] text-right">Marknadspris</TableHead>
                    {regionTargets.map((r) => (
                      <TableHead key={r.region} className="text-[11px] text-right w-[210px] leading-tight">
                        {r.label.split(" (")[0]} ({fmt(r.target, 0)} %)
                        <span className="block text-[9px] font-normal text-muted-foreground">
                          golv · senast · föreslaget
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="w-[36px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {details.map((d) => {
                    const b = base.find((x) => x.detail.key === d.key);
                    const qty = (rawQtyNum * (Number(d.pct) || 0)) / 100;
                    const missingPrice = d.role === "byproduct" && !(parseFloat(d.byproductPrice) > 0);
                    return (
                      <TableRow
                        key={d.key}
                        className={`h-9 ${d.included ? "" : "opacity-50"} ${missingPrice && d.included ? "bg-amber-50 dark:bg-amber-950/20" : ""}`}
                      >
                        <TableCell className="py-0.5">
                          <Checkbox checked={d.included} onCheckedChange={(v) => setDetail(d.key, { included: !!v })} />
                        </TableCell>
                        <TableCell className="py-0.5">
                          <Input value={d.name} onChange={(e) => setDetail(d.key, { name: e.target.value })} className="h-7 text-[11px]" />
                        </TableCell>
                        <TableCell className="py-0.5">
                          <Select value={d.role} onValueChange={(v) => setDetail(d.key, { role: v as DetailRow["role"] })}>
                            <SelectTrigger className="h-7 text-[10px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="primary" className="text-xs">Huvudprodukt</SelectItem>
                              <SelectItem value="byproduct" className="text-xs">Biprodukt</SelectItem>
                            </SelectContent>
                          </Select>
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
                            className="h-7 px-1 text-[11px] text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>
                        <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(qty, 1)}</TableCell>
                        <TableCell className="py-0.5">
                          <Input
                            type="number"
                            step="0.05"
                            disabled={d.role !== "primary"}
                            value={d.marginWeight}
                            onChange={(e) => setDetail(d.key, { marginWeight: parseFloat(e.target.value) || 1 })}
                            className="h-7 px-1 text-[11px] text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>
                        <TableCell className="text-[11px] text-right font-mono tabular-nums">
                          {b ? fmt(b.rawCostPerKg) : "—"}
                        </TableCell>
                        <TableCell className="py-0.5 text-right">
                          <Checkbox checked={d.isProcessed} onCheckedChange={(v) => setDetail(d.key, { isProcessed: !!v })} />
                        </TableCell>
                        <TableCell className="py-0.5">
                          {d.role === "byproduct" ? (
                            <Input
                              type="number"
                              step="1"
                              placeholder="kr ink moms"
                              value={d.byproductPrice}
                              onChange={(e) => setDetail(d.key, { byproductPrice: e.target.value })}
                              onBlur={() => saveByproductPrice(d)}
                              className="h-7 px-1 text-[11px] text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          ) : (
                            <span className="block text-right text-[10px] text-muted-foreground">residual</span>
                          )}
                        </TableCell>
                        {byRegion.map((r) => {
                          const p = r.res.primaries.find((x) => x.key === d.key);
                          if (d.role === "byproduct" || !p) {
                            const inc = parseFloat(d.byproductPrice) || 0;
                            return (
                              <TableCell key={r.region} className="py-0.5 text-right text-[11px]">
                                {inc > 0 ? (
                                  <span className="font-mono tabular-nums">{fmt(inc, 0)} kr manuellt</span>
                                ) : (
                                  <span className="text-[10px] text-amber-600">saknar pris — höjer golvet</span>
                                )}
                              </TableCell>
                            );
                          }
                          const alert = p.alertExpensive || p.alertRoleMismatch;
                          return (
                            <TableCell key={r.region} className="py-0.5 text-right text-[11px]">
                              <div className="flex items-center justify-end gap-1.5">
                                <span
                                  className={`font-mono tabular-nums ${alert ? "text-destructive font-semibold" : "text-muted-foreground"}`}
                                  title="Golvpris (residual mot marginalmålet)"
                                >
                                  {fmt(p.floorInclVat, 0)}
                                </span>
                                <span className="font-mono text-[10px] tabular-nums text-muted-foreground" title="Senast fastställt pris">
                                  {p.lastSetPrice > 0 ? fmt(p.lastSetPrice, 0) : "—"}
                                </span>
                                <span className="font-mono tabular-nums font-semibold" title="Föreslaget pris (högsta av golv och senast)">
                                  {fmt(p.suggestedInclVat, 0)} kr
                                </span>
                                {alert && <AlertTriangle className="h-3 w-3 text-destructive" />}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-1 text-[10px]"
                                  onClick={() => applyPrice(d, p.suggestedInclVat, `${d.name} · ${r.label}`)}
                                >
                                  Fastställ
                                </Button>
                              </div>
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
                {byRegion.map((r) => {
                  const m = r.atSuggested;
                  const color =
                    m.marginInclWorkPct < r.target - 5
                      ? "text-destructive"
                      : m.marginInclWorkPct < r.target
                      ? "text-amber-600"
                      : "text-emerald-600";
                  return (
                    <div key={r.region} className="rounded-md border px-2 py-1 leading-tight">
                      <div className="text-muted-foreground">
                        Partiet {r.label.split(" (")[0]} · mål {fmt(r.target, 0)} %
                      </div>
                      <div>
                        <span className="text-muted-foreground">På råvara: </span>
                        <span className="font-mono tabular-nums">{fmt(m.marginOnRawPct, 1)} %</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Ink. arbete: </span>
                        <span className={`font-mono tabular-nums font-semibold ${color}`}>
                          {fmt(m.marginInclWorkPct, 1)} %
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        intäkt {fmt(m.revenueExVat, 0)} kr / råvara {fmt(m.rawCost, 0)} kr / arbete {fmt(m.surchargeCost, 0)} kr
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        biprodukter {fmt(r.res.byproductRevenueExVat, 0)} kr · krävd intäkt {fmt(r.res.requiredRevenueExVat, 0)} kr
                      </div>
                      {(() => {
                        const a = approvalByRegion({ target: r.target, marginInclWorkPct: m.marginInclWorkPct });
                        return a.approved ? (
                          <div className="mt-0.5 text-[10px] font-medium text-emerald-600">Auto-godkänns</div>
                        ) : (
                          <div className="mt-0.5 text-[10px] font-medium text-amber-600">
                            Manuell granskning: {a.reasons[0]}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
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
