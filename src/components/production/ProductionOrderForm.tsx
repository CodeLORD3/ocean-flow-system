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
  useUpsertDetailPrice,
  priceFor,
  referenceCostFor,
  surchargeFor,
  vatFor,
  rollingAverage,
  useYieldActuals,
} from "@/hooks/useProductionYields";
import {
  useApplyDetailPrice,
  useLatestPriceApplications,
  applicationKey,
  isSameDayApplication,
  type DetailPriceApplication,
} from "@/hooks/useReferencePricing";
import {
  priceByNrv,
  priceByScaleFactor,
  scaleFactorOutsideBand,
  nrvStartSuggestionExVat,
  roundUpToAllowedPrice,
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
  effectiveCutModel,
  modelForSpecies,
  normalizeDetailForm,
  pickYieldRow,
} from "@/lib/cutModels";
import { SPECIES_GROUP_SUGGESTIONS } from "@/lib/speciesGroups";
import { speciesKey } from "@/lib/asciiFold";
import { addStock, withdrawStock, GROSSIST_FLYTANDE_ID } from "@/lib/productionStock";
import { pickRawLots, createOutputLot, recordLotTransformation, type RawPick } from "@/lib/lotTransformation";
import { t } from "@/lib/i18n";

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
  /** Manuellt satt pris per prislista, som texten står i fältet. */
  prices: Record<string, string>;
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
  const upsertDetailPrice = useUpsertDetailPrice();
  const { data: lastApplications } = useLatestPriceApplications();
  const applyPrice = useApplyDetailPrice();
  const { staff } = useStaffAuth();
  const createOrder = useCreateProductionOrder();
  const qc = useQueryClient();

  const [rawProductId, setRawProductId] = useState<string | null>(null);
  const [rawName, setRawName] = useState("");
  const [rawSku, setRawSku] = useState("");
  const [species, setSpecies] = useState("");
  const [rawForm, setRawForm] = useState("hel");
  /** Sortering på råvaran ("" = okänd). Styr både utbyte och styckningsmodell. */
  const [grade, setGrade] = useState("");
  const [rawQty, setRawQty] = useState("");
  const [pieceWeight, setPieceWeight] = useState("");
  const [price, setPrice] = useState("");
  const [avgCostInfo, setAvgCostInfo] = useState<string | null>(null);
  const [supplier, setSupplier] = useState("");
  const [batch, setBatch] = useState("");
  const [lineId, setLineId] = useState<string | null>(null);
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [applyList, setApplyList] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [splitWarning, setSplitWarning] = useState<{ picks: RawPick[]; detailCount: number } | null>(null);
  /** Väntande prisändring som redan sattes inom samma dygn. */
  const [confirmChange, setConfirmChange] = useState<{
    rows: { detail: DetailRow; listKey: string; price: number; previous: DetailPriceApplication | null }[];
  } | null>(null);

  /** Prislistor per kanal: butiken räknar inkl moms, grossisten exkl moms. */
  const priceLists = useMemo(
    () =>
      margins.map((m) => ({
        key: (m as any).price_list as string,
        label: m.label || m.region,
        target: Number(m.target_pct),
        inclVat: ((m as any).applies_to ?? "butik") === "butik",
        warnLow: Number((m as any).scale_warn_low) || 0.75,
        warnHigh: Number((m as any).scale_warn_high) || 1.25,
      })),
    [margins],
  );


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
    if (!applyList && priceLists.length) setApplyList(priceLists[0].key);
  }, [priceLists, applyList]);

  /* ── Artens styckningsmodell ─────────────────────────────── */
  const modelRow = cutModels.find((c) => speciesKey(c.species_group) === speciesKey(species));
  const baseCutModel = (modelRow?.cut_model as CutModel) ?? modelForSpecies(species);
  const gradeLimit = (modelRow as any)?.grade_limit ?? null;
  const cutModel = effectiveCutModel(baseCutModel, grade, gradeLimit);
  const gradeForcedSingle = cutModel !== baseCutModel;
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
      }));
    return CUT_MODEL_TEMPLATES[cutModel].map((d) => ({
      form: d.form,
      name: d.name,
      pctOfFillet: d.pctOfFillet,
      role: d.role,
      optional: !!d.optional,
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

  /** Råvarukostnaden hämtas ur lagrets viktade snittkostpris, inte manuellt. */
  useEffect(() => {
    let cancelled = false;
    if (!rawProductId) {
      setAvgCostInfo(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("product_stock_locations")
        .select("avg_cost, quantity")
        .eq("product_id", rawProductId)
        .eq("location_id", GROSSIST_FLYTANDE_ID)
        .maybeSingle();
      if (cancelled) return;
      const avg = Number((data as any)?.avg_cost) || 0;
      if (avg > 0) {
        setPrice(String(avg));
        setAvgCostInfo(`Viktat snittkostpris i Grossist Flytande: ${fmt(avg)} kr/kg`);
      } else {
        setAvgCostInfo("Lagret saknar snittkostpris för råvaran — kontrollera inleveransen");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawProductId]);

  const storedPrice = (form: string, list: string) =>
    priceFor(detailPrices, list, species, normalizeDetailForm(form));

  /* ── Föreslå detaljer utifrån modell och utbyte ───────────── */
  const suggest = () => {
    if (!species) return;
    const isFilletRow = (toForm: string) =>
      toForm.includes("filé") || toForm.includes("sida") || toForm === "loin" || toForm.includes("stjärt");
    const filletRow = pickYieldRow(yields as any, species, rawForm, grade, isFilletRow);
    if (!filletRow) {
      toast({
        title: "Ingen utbytesrad",
        description: `Saknar utbyte för ${species} från "${rawForm}"${grade ? ` (sortering ${grade})` : ""}.`,
        variant: "destructive",
      });
      return;
    }
    const basePct = Number(filletRow.yield_pct);
    const out: DetailRow[] = modelDetails.map((m, i) => {
      const prices: Record<string, string> = {};
      for (const pl of priceLists) {
        const v = storedPrice(m.form, pl.key);
        prices[pl.key] = v ? String(v) : "";
      }
      return {
        key: `${m.form}-${i}`,
        included: !m.optional,
        name: `${species} ${detailFormLabel(m.form)}`,
        form: m.form,
        pct: Number(((basePct * m.pctOfFillet) / 100).toFixed(2)),
        role: m.role,
        prices,
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

  /** Kilo, påslag och moms per detalj. */
  const base = useMemo(() => {
    return included.map((d) => {
      const product = products.find((p) => p.id === d.productId);
      const category = product?.category ?? d.category;
      const surcharge = d.isProcessed ? surchargeFor(surcharges, category ?? "Färsk Fisk") : 0;
      const vat = vatFor(vats, category);
      return {
        detail: d,
        qty: (rawQtyNum * (Number(d.pct) || 0)) / 100,
        surcharge,
        vat,
        product,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details, products, surcharges, vats, rawQty]);

  const outputKg = base.reduce((s, b) => s + b.qty, 0);

  /** Priset i en detaljs fält omräknat till kr/kg exkl moms. */
  const priceExFor = (d: DetailRow, listKey: string, vat: number): number | null => {
    const raw = parseFloat(d.prices?.[listKey] ?? "");
    if (!(raw > 0)) return null;
    const pl = priceLists.find((p) => p.key === listKey);
    return pl?.inclVat ? raw / (1 + vat / 100) : raw;
  };

  /** NRV-kalkyl per prislista. */
  const byList = useMemo(() => {
    return priceLists.map((pl) => {
      const res = priceByNrv({
        purchasePricePerKg: priceNum,
        rawQuantity: rawQtyNum,
        targetMarginPct: pl.target,
        lines: base.map((b) => ({
          key: b.detail.key,
          qtyKg: b.qty,
          priceExVat: priceExFor(b.detail, pl.key, b.vat),
          surchargePerKg: b.surcharge,
        })),
      });
      return { ...pl, res };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, priceLists, priceNum, rawQtyNum, details]);

  /**
   * Skalfaktor per prislista: referenspriserna skalas till partiets verkliga
   * snittkostnad. Förhållandet mellan detaljerna ligger still, bara nivån rör
   * sig — referenspriserna i prislistan ändras aldrig härifrån.
   */
  const scaleByList = useMemo(() => {
    return priceLists.map((pl) => {
      const res = priceByScaleFactor({
        avgCostPerKg: priceNum,
        rawQuantity: rawQtyNum,
        targetMarginPct: pl.target,
        inclVat: pl.inclVat,
        lines: base.map((b) => ({
          key: b.detail.key,
          qtyKg: b.qty,
          referencePrice: storedPrice(b.detail.form, pl.key),
          vatPct: b.vat,
          surchargePerKg: b.surcharge,
        })),
      });
      const band = scaleFactorOutsideBand(res.scaleFactor, pl.warnLow, pl.warnHigh);
      const referenceCost = referenceCostFor(
        detailPrices,
        pl.key,
        species,
        normalizeDetailForm(base[0]?.detail.form ?? ""),
      );
      return { ...pl, res, band, referenceCost };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, priceLists, priceNum, rawQtyNum, details, detailPrices, species]);

  const scaleFor = (listKey: string) => scaleByList.find((s) => s.key === listKey);

  /** Föreslaget pris för en detalj i en prislista (referenspris × skalfaktor). */
  const suggestedPriceFor = (d: DetailRow, listKey: string): number => {
    const line = scaleFor(listKey)?.res.lines.find((l) => l.key === d.key);
    return line?.suggestedPrice ?? 0;
  };

  /** Senast applicerade priset på produkten i prislistan. */
  const lastApplicationFor = (d: DetailRow, listKey: string): DetailPriceApplication | null => {
    if (!d.productId || !lastApplications) return null;
    return lastApplications.get(applicationKey(listKey, d.productId)) ?? null;
  };


  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q))
      .slice(0, 8);
  }, [products, productSearch]);

  const setDetail = (key: string, patch: Partial<DetailRow>) =>
    setDetails((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  const setDetailPriceField = (key: string, listKey: string, value: string) =>
    setDetails((prev) =>
      prev.map((d) => (d.key === key ? { ...d, prices: { ...d.prices, [listKey]: value } } : d)),
    );

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
  const approvalForList = (list: { target: number; marginInclWorkPct: number }) =>
    evaluateAutoApproval({
      requiresProcessing: rawRequiresProcessing,
      yieldConfirmed,
      marginInclWorkPct: list.marginInclWorkPct,
      targetMarginPct: list.target,
    });

  /**
   * Flyttar REFERENSPRISET, alltså den relativa värderingen. Görs bara medvetet
   * här; ett skalat eller manuellt satt orderpris ändrar aldrig referensen.
   */
  const saveAsReference = (d: DetailRow, listKey: string) => {
    const value = parseFloat(d.prices?.[listKey] ?? "") || 0;
    if (!species || value <= 0) return;
    upsertDetailPrice.mutate(
      {
        species_group: species,
        detail_form: normalizeDetailForm(d.form),
        price_list: listKey,
        price_incl_vat: value,
        reference_cost_per_kg: priceNum > 0 ? priceNum : undefined,
        role: d.role,
      },
      {
        onSuccess: () =>
          toast({
            title: "Referenspris flyttat",
            description: `${d.name}: ${fmt(value, 2)} kr vid ${fmt(priceNum, 2)} kr/kg råvara`,
          }),
      },
    );
  };

  /** Fyller fältet med referenspris × skalfaktor. Sparas inte automatiskt. */
  const fillSuggestion = (d: DetailRow, listKey: string) => {
    const suggested = suggestedPriceFor(d, listKey);
    if (suggested > 0) {
      setDetailPriceField(d.key, listKey, String(suggested));
      return;
    }
    // Referenspris saknas — fall tillbaka på ett kostnadsbaserat startförslag.
    const b = base.find((x) => x.detail.key === d.key);
    const pl = priceLists.find((p) => p.key === listKey);
    if (!b || !pl) return;
    const ex = nrvStartSuggestionExVat({
      purchasePricePerKg: priceNum,
      rawQuantity: rawQtyNum,
      outputKg,
      surchargePerKg: b.surcharge,
      targetMarginPct: pl.target,
    });
    const value = pl.inclVat
      ? roundUpToAllowedPrice(ex * (1 + b.vat / 100))
      : Math.round(ex * 100) / 100;
    setDetailPriceField(d.key, listKey, String(value));
  };

  /** Fyller alla detaljer i en prislista med de skalade förslagen. */
  const fillAllSuggestions = (listKey: string) => {
    const s = scaleFor(listKey);
    if (!s) return;
    setDetails((prev) =>
      prev.map((d) => {
        const line = s.res.lines.find((l) => l.key === d.key);
        if (!line || !(line.suggestedPrice > 0)) return d;
        return { ...d, prices: { ...d.prices, [listKey]: String(line.suggestedPrice) } };
      }),
    );
  };


  /* ── Registrera tillverkningsorder ───────────────────────── */
  /**
   * Ett detaljparti per råvaruparti. Korsar plocket en partigräns föreslås en
   * uppdelning i två ordrar innan registrering, eftersom blandade partier ger
   * fel fångstuppgift på skylten och missad framåtspårning.
   */
  const register = async () => {
    if (!rawName || rawQtyNum <= 0 || included.length === 0) {
      toast({ title: "Ofullständigt", description: "Ange råvara, kvantitet och minst en detalj.", variant: "destructive" });
      return;
    }
    try {
      const picks = rawProductId
        ? await pickRawLots(rawProductId, GROSSIST_FLYTANDE_ID, rawQtyNum)
        : [];
      const distinctLots = new Set(picks.map((p) => p.lotId ?? "utan-parti")).size;
      if (distinctLots > 1) {
        setSplitWarning({ picks, detailCount: included.length });
        return;
      }
      await runRegister(picks);
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  };

  const runRegister = async (picks: RawPick[]) => {
    try {
      const activeRes = byList.find((l) => l.key === applyList)?.res ?? byList[0]?.res;
      const lines = base.map((b, i) => {
        const r = activeRes?.lines.find((x) => x.key === b.detail.key);
        return {
          product_id: b.detail.productId,
          detail_name: b.detail.name,
          detail_form: b.detail.form,
          planned_pct: Number(b.detail.pct) || 0,
          planned_qty: b.qty,
          cost_price: r ? r.rawCostPerKg : 0,
          margin_weight: 1,
          is_processed: b.detail.isProcessed,
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

      const effectivePicks: RawPick[] = picks.length
        ? picks
        : [{ lotId: null, quantityKg: rawQtyNum }];
      const totalIn = effectivePicks.reduce((s, p) => s + p.quantityKg, 0) || rawQtyNum;

      if (rawProductId) {
        for (const p of effectivePicks) {
          await withdrawStock(rawProductId, p.quantityKg, GROSSIST_FLYTANDE_ID, {
            lotId: p.lotId,
            referenceType: "production_order",
            referenceId: order.id,
            note: p.lotId ? null : "Råvara utan parti — okänd härkomst",
          });
        }
      }

      // Ett detaljparti per råvaruparti och detalj: kvantiteten fördelas på
      // råvarupartiets andel av plocket, så inget parti bär två härkomster.
      let lotCount = 0;
      for (let pi = 0; pi < effectivePicks.length; pi++) {
        const p = effectivePicks[pi];
        const share = totalIn > 0 ? p.quantityKg / totalIn : 0;
        for (const l of lines) {
          if (!l.product_id || !l.planned_qty) continue;
          const qty = Math.round(l.planned_qty * share * 1000) / 1000;
          if (qty <= 0) continue;
          const outLotId = await createOutputLot(
            p.lotId,
            {
              productId: l.product_id,
              quantityKg: qty,
              unitCost: l.cost_price,
              detailName: l.detail_name,
              detailForm: l.detail_form,
            },
            order.id,
            pi + 1,
          );
          lotCount++;
          await addStock(l.product_id, qty, l.cost_price, GROSSIST_FLYTANDE_ID, {
            lotId: outLotId,
            referenceType: "production_order",
            referenceId: order.id,
            note: l.detail_name,
          });
          await recordLotTransformation({
            fromLotId: p.lotId,
            toLotId: outLotId,
            quantityInKg: p.quantityKg * (l.planned_qty / (rawQtyNum || 1)),
            quantityOutKg: qty,
            productionOrderId: order.id,
          });
        }
      }
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["lots"] });

      toast({
        title: "Tillverkningsorder registrerad",
        description: `${rawName}: ${included.length} detaljer, ${lotCount} detaljpartier, ${fmt(Math.max(0, wastePct), 1)} % svinn.`,
      });
      setSplitWarning(null);
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

  /* ── Applicera pris på produkten ─────────────────────────── */
  const activeList = byList.find((l) => l.key === applyList) ?? byList[0];

  const massRows = base
    .filter((b) => b.detail.productId)
    .map((b) => {
      const listKey = activeList?.key ?? "";
      const previous = lastApplicationFor(b.detail, listKey);
      return {
        detail: b.detail,
        listKey,
        productId: b.detail.productId!,
        name: b.detail.name,
        current: Number(
          activeList?.inclVat ? b.product?.retail_suggested ?? 0 : (b.product as any)?.wholesale_price ?? 0,
        ),
        suggested: parseFloat(b.detail.prices?.[listKey] ?? "") || 0,
        previous,
      };
    })
    .filter((r) => r.suggested > 0);

  /** Skriver ett pris till produkten, prishistoriken och appliceringsloggen. */
  const writePrice = async (d: DetailRow, listKey: string, value: number) => {
    const pl = priceLists.find((p) => p.key === listKey);
    const s = scaleFor(listKey);
    const line = s?.res.lines.find((l) => l.key === d.key) ?? null;
    if (!d.productId || !pl) return;
    await applyPrice.mutateAsync({
      priceList: listKey,
      inclVat: pl.inclVat,
      speciesGroup: species || "okänd",
      detailForm: normalizeDetailForm(d.form),
      productId: d.productId,
      price: value,
      referencePrice: line?.referencePrice ?? null,
      scaleFactor: s?.res.scaleFactor ?? null,
      avgCostPerKg: priceNum || null,
      yieldPct: Number(d.pct) || null,
      manualOverride: line ? Math.abs((line.suggestedPrice || 0) - value) > 0.009 : true,
      appliedBy: staff ? `${staff.first_name} ${staff.last_name}` : null,
      orderLabel: batch || null,
    });
  };

  /**
   * Samma dygn-kontroll: har produkten redan fått ett pris i prislistan inom
   * 24 timmar krävs bekräftelse, annars skulle diskpriset ändras mitt på dagen.
   */
  const requestApply = async (
    rows: { detail: DetailRow; listKey: string; price: number; previous: DetailPriceApplication | null }[],
  ) => {
    const needsConfirm = rows.filter((r) => isSameDayApplication(r.previous));
    if (needsConfirm.length > 0) {
      setConfirmChange({ rows });
      return;
    }
    await commitApply(rows);
  };

  const commitApply = async (
    rows: { detail: DetailRow; listKey: string; price: number; previous: DetailPriceApplication | null }[],
  ) => {
    try {
      for (const r of rows) await writePrice(r.detail, r.listKey, r.price);
      setConfirmChange(null);
      setPreviewOpen(false);
      toast({
        title: rows.length > 1 ? "Priser applicerade" : "Pris applicerat",
        description:
          rows.length > 1
            ? `${rows.length} produkter fick nytt pris i butiken.`
            : `${rows[0].detail.name}: ${fmt(rows[0].price, 2)} kr`,
      });
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  };

  const applyAll = () =>
    requestApply(
      massRows.map((r) => ({ detail: r.detail, listKey: r.listKey, price: r.suggested, previous: r.previous })),
    );

  const applyPriceToProduct = (d: DetailRow, listKey: string, value: number) =>
    requestApply([{ detail: d, listKey, price: value, previous: lastApplicationFor(d, listKey) }]);

  const warnings = useMemo(() => {
    const out: string[] = [];
    for (const l of byList) {
      if (l.res.missingPriceKeys.length > 0)
        out.push(`${l.label}: ${l.res.missingPriceKeys.length} detalj(er) saknar pris — kalkylen är ofullständig`);
      if (l.res.batchBelowTarget)
        out.push(
          `${l.label}: partiets marginal ${fmt(l.res.batchMarginPct, 1)} % ligger under målet ${fmt(l.target, 0)} %`,
        );
    }
    for (const s of scaleByList) {
      if (s.res.missingReferenceKeys.length > 0)
        out.push(
          `${s.label}: ${s.res.missingReferenceKeys.length} detalj(er) saknar referenspris — inget prisförslag kan räknas. Fyll i under Priser · Referenspriser.`,
        );
      if (s.band === "low")
        out.push(
          `${s.label}: skalfaktorn ${fmt(s.res.scaleFactor, 3)} ligger under bandet ${fmt(s.warnLow, 2)}–${fmt(
            s.warnHigh,
            2,
          )} — inköpspriset ligger långt under referensnivån. Överväg att flytta referenspriset.`,
        );
      if (s.band === "high")
        out.push(
          `${s.label}: skalfaktorn ${fmt(s.res.scaleFactor, 3)} ligger över bandet ${fmt(s.warnLow, 2)}–${fmt(
            s.warnHigh,
            2,
          )} — inköpspriset ligger långt över referensnivån. Överväg att inte köpa eller att flytta referenspriset.`,
        );
    }
    return [...new Set(out)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byList, scaleByList, base, detailPrices]);


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
              <Input value={rawName} onChange={(e) => setRawName(e.target.value)} className="h-10 text-xs" placeholder="t.ex. Torsk hel" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Koppla produkt (för lageruttag)</Label>
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="h-10 text-xs"
                placeholder="Sök sku eller namn…"
              />
              {filteredProducts.length > 0 && (
                <div className="rounded-md border bg-popover">
                  {filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      className="block w-full px-2 py-2 text-left text-[11px] hover:bg-muted"
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
                <SelectTrigger className="h-10 text-xs"><SelectValue placeholder="Välj art" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {speciesOptions.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {species && (
                <p className="text-[10px] text-muted-foreground">{CUT_MODEL_LABELS[cutModel]}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Sortering</Label>
              <Select value={grade || "okand"} onValueChange={(v) => setGrade(v === "okand" ? "" : v)}>
                <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="okand" className="text-xs">Okänd</SelectItem>
                  {["1", "2", "3", "4", "5"].map((g) => (
                    <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {gradeForcedSingle && (
                <p className="text-[10px] text-muted-foreground">
                  Sortering {grade} styckas som hel filé
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Form in</Label>
              <Select value={rawForm} onValueChange={setRawForm}>
                <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {FORMS.map((f) => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Kvantitet (kg)</Label>
              <Input type="number" step="0.1" value={rawQty} onChange={(e) => setRawQty(e.target.value)} className="h-10 text-xs text-right font-mono tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Styckvikt (kg/fisk)</Label>
              <Input type="number" step="0.1" value={pieceWeight} onChange={(e) => setPieceWeight(e.target.value)} className="h-10 text-xs text-right font-mono tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Råvarukostnad (kr/kg, från lagret)</Label>
              <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="h-10 text-xs text-right font-mono tabular-nums" />
              {avgCostInfo && <p className="text-[10px] text-muted-foreground">{avgCostInfo}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Leverantör</Label>
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="h-10 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Parti</Label>
              <Input value={batch} onChange={(e) => setBatch(e.target.value)} className="h-10 text-xs" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="h-10 gap-1.5 text-xs" onClick={suggest} disabled={!species}>
              <Plus className="h-3.5 w-3.5" /> Föreslå styckdetaljer
            </Button>
            {details.length > 0 &&
              scaleByList.map((s) => (
                <Button
                  key={s.key}
                  size="sm"
                  variant="outline"
                  className="h-10 text-xs"
                  onClick={() => fillAllSuggestions(s.key)}
                  disabled={!(s.res.scaleFactor > 0)}
                  title="Referenspriser × skalfaktor"
                >
                  Fyll förslag · {s.label}
                </Button>
              ))}

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
            <CardTitle className="text-sm">Styckdetaljer ut · NRV-prissättning</CardTitle>
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
            {warnings.length > 0 && (
              <div className="space-y-1 border-b bg-amber-50 px-3 py-2 dark:bg-amber-950/30">
                {warnings.map((w) => (
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
                    <TableHead className="text-[11px] w-[150px]">Produkt (lager/pris)</TableHead>
                    <TableHead className="text-[11px] w-[86px] text-right">% av råvara</TableHead>
                    <TableHead className="text-[11px] w-[64px] text-right">kg</TableHead>
                    <TableHead className="text-[11px] w-[60px] text-right">Påslag</TableHead>
                    {priceLists.map((pl) => (
                      <TableHead key={pl.key} className="text-[11px] text-right w-[260px] leading-tight">
                        {pl.label.split(" (")[0]} ({fmt(pl.target, 0)} % {t("target").toLowerCase()})
                        <span className="block text-[9px] font-normal text-muted-foreground">
                          {pl.inclVat ? t("price_incl_vat") : t("price_ex_vat")} · {t("revenue_share").toLowerCase()} ·{" "}
                          {t("cost_per_kg").toLowerCase()} · {t("margin").toLowerCase()}
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
                    return (
                      <TableRow key={d.key} className={`h-10 ${d.included ? "" : "opacity-50"}`}>
                        <TableCell className="py-0.5">
                          <Checkbox checked={d.included} onCheckedChange={(v) => setDetail(d.key, { included: !!v })} />
                        </TableCell>
                        <TableCell className="py-0.5">
                          <Input value={d.name} onChange={(e) => setDetail(d.key, { name: e.target.value })} className="h-9 text-[11px]" />
                        </TableCell>
                        <TableCell className="py-0.5">
                          <Select value={d.productId ?? "none"} onValueChange={(v) => setDetail(d.key, { productId: v === "none" ? null : v })}>
                            <SelectTrigger className="h-9 text-[11px]"><SelectValue /></SelectTrigger>
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
                            className="h-9 px-1 text-[11px] text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                        </TableCell>
                        <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(qty, 1)}</TableCell>
                        <TableCell className="py-0.5 text-right">
                          <Checkbox checked={d.isProcessed} onCheckedChange={(v) => setDetail(d.key, { isProcessed: !!v })} />
                        </TableCell>
                        {byList.map((pl) => {
                          const r = pl.res.lines.find((x) => x.key === d.key);
                          const value = d.prices?.[pl.key] ?? "";
                          const hasPrice = parseFloat(value) > 0;
                          const lowest = pl.res.lowestMarginKey === d.key;
                          const scaled = scaleFor(pl.key)?.res.lines.find((x) => x.key === d.key);
                          const suggested = scaled?.suggestedPrice ?? 0;
                          const reference = scaled?.referencePrice ?? 0;
                          const delta = hasPrice && suggested > 0 ? parseFloat(value) - suggested : 0;
                          return (
                            <TableCell key={pl.key} className="py-0.5 text-right text-[11px]">
                              <div className="flex items-center justify-end gap-1.5">
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder={pl.inclVat ? "kr ink moms" : "kr ex moms"}
                                  value={value}
                                  onChange={(e) => setDetailPriceField(d.key, pl.key, e.target.value)}
                                  className="h-9 w-24 px-1 text-[11px] text-right font-mono tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                  {reference > 0 ? `ref ${fmt(reference, 2)}` : "ref —"}
                                  {suggested > 0 ? ` · förslag ${fmt(suggested, 2)}` : ""}
                                </span>
                                {hasPrice && suggested > 0 && Math.abs(delta) > 0.009 && (
                                  <span
                                    className={`font-mono text-[10px] tabular-nums ${
                                      delta > 0 ? "text-emerald-600" : "text-amber-600"
                                    }`}
                                    title="Avvikelse mot förslaget"
                                  >
                                    {delta > 0 ? "+" : ""}
                                    {fmt(delta, 2)}
                                  </span>
                                )}
                                {hasPrice && r ? (
                                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                                    {fmt(r.revenueShare * 100, 1)} % · {fmt(r.totalCostPerKg, 2)} kr
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-amber-600">{t("missing_price")}</span>
                                )}
                                {hasPrice && r && (
                                  <span
                                    className={`font-mono tabular-nums font-semibold ${
                                      r.belowTarget ? "text-destructive" : "text-emerald-600"
                                    }`}
                                    title={t("margin")}
                                  >
                                    {fmt(r.marginPct, 1)} %
                                  </span>
                                )}
                                {lowest && hasPrice && (
                                  <Badge variant="outline" className="h-5 px-1 text-[9px]">{t("lowest_margin")}</Badge>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 px-1 text-[10px]"
                                  onClick={() => fillSuggestion(d, pl.key)}
                                >
                                  {t("use_suggested")}
                                </Button>
                                {hasPrice && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-1 text-[10px] text-muted-foreground"
                                    onClick={() => saveAsReference({ ...d, prices: { ...d.prices } }, pl.key)}
                                    title="Flyttar den relativa värderingen i prislistan"
                                  >
                                    Sätt som referens
                                  </Button>
                                )}
                                {hasPrice && d.productId && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-1 text-[10px]"
                                    onClick={() => applyPriceToProduct(d, pl.key, parseFloat(value))}
                                  >
                                    Fastställ
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}

                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setDetails((prev) => prev.filter((x) => x.key !== d.key))}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TableCell>
                        {void b}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t p-3">
              <div className="flex flex-wrap gap-3 text-[11px]">
                {byList.map((pl) => {
                  const m = pl.res;
                  const color = m.batchBelowTarget
                    ? m.batchMarginPct < pl.target - 5
                      ? "text-destructive"
                      : "text-amber-600"
                    : "text-emerald-600";
                  return (
                    <div key={pl.key} className="rounded-md border px-2 py-1 leading-tight">
                      <div className="text-muted-foreground">
                        Partiet {pl.label.split(" (")[0]} · {t("target").toLowerCase()} {fmt(pl.target, 0)} %
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t("margin")}: </span>
                        <span className={`font-mono tabular-nums font-semibold ${color}`}>
                          {fmt(m.batchMarginPct, 1)} %
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        intäkt {fmt(m.revenueExVat, 0)} kr / råvara {fmt(m.rawCost, 0)} kr / arbete {fmt(m.surchargeCost, 0)} kr
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        intäkt per färdigt kilo {fmt(m.revenuePerOutputKg, 2)} kr
                      </div>
                      {(() => {
                        const a = approvalForList({ target: pl.target, marginInclWorkPct: m.batchMarginPct });
                        return a.approved ? (
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                            <Check className="h-3 w-3" /> Auto-godkänns
                          </div>
                        ) : (
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> Manuell granskning: {a.reasons[0]}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <Select value={applyList} onValueChange={setApplyList}>
                  <SelectTrigger className="h-10 w-44 text-xs"><SelectValue placeholder={t("price_list")} /></SelectTrigger>
                  <SelectContent>
                    {priceLists.map((pl) => <SelectItem key={pl.key} value={pl.key} className="text-xs">{pl.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-10 text-xs" disabled={massRows.length === 0}>
                      {t("use_suggested")} ({massRows.length})
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
                            <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(r.current, 2)} kr</TableCell>
                            <TableCell className="text-[11px] text-right font-mono tabular-nums font-semibold">{fmt(r.suggested, 2)} kr</TableCell>
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
                <Button size="sm" className="h-10 gap-1.5 text-xs" onClick={register} disabled={createOrder.isPending}>
                  <Factory className="h-3.5 w-3.5" /> Registrera tillverkning
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!splitWarning} onOpenChange={(o) => !o && setSplitWarning(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-sm">Plocket korsar en partigräns</DialogTitle>
          </DialogHeader>
          {splitWarning && (
            <div className="space-y-3 text-xs">
              <p className="text-muted-foreground">
                Det här plocket tar från {new Set(splitWarning.picks.map((p) => p.lotId ?? "utan-parti")).size} partier
                och skapar {splitWarning.picks.length * splitWarning.detailCount} detaljpartier. Varje detaljparti behåller
                sitt eget fångstområde, fartyg och fångstdatum — inga uppgifter blandas.
              </p>
              <div className="rounded border border-border">
                {splitWarning.picks.map((p, i) => (
                  <div key={i} className="flex justify-between border-b border-border/50 px-2 py-1 last:border-0">
                    <span className="font-mono">{p.lotId ? `Parti ${i + 1}` : "Utan parti"}</span>
                    <span className="font-mono tabular-nums">{fmt(p.quantityKg, 3)} kg</span>
                  </div>
                ))}
              </div>
              <p className="text-muted-foreground">
                Ofta räcker det att skära det ena partiet först och registrera en order per parti.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSplitWarning(null)}>
              Dela upp i två ordrar
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const picks = splitWarning?.picks ?? [];
                setSplitWarning(null);
                void runRegister(picks);
              }}
            >
              Registrera ändå
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
