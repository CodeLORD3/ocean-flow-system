import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gavel, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  useYields,
  useMarginTargets,
  useProcessingSurcharges,
  useVatRates,
  useSpeciesCutModels,
  useCutModelSplits,
  useDetailPrices,
  useAuctionCalcs,
  useSaveAuctionCalc,
  useUpdateAuctionCalc,
  surchargeFor,
  vatFor,
} from "@/hooks/useProductionYields";
import { auctionMaxRawPrice, batchMargin, fmt } from "@/lib/filletMath";
import {
  CUT_MODEL_LABELS,
  CUT_MODEL_TEMPLATES,
  CutModel,
  detailFormLabel,
  effectiveCutModel,
  modelForSpecies,
  normalizeDetailForm,
  pickYieldRow,
} from "@/lib/cutModels";
import { SPECIES_GROUP_SUGGESTIONS } from "@/lib/speciesGroups";
import { speciesKey } from "@/lib/asciiFold";

interface Row {
  form: string;
  name: string;
  qty: number;
  priceInclVat: string;
}

export function AuctionCalculator() {
  const { data: yields = [] } = useYields();
  const { data: margins = [] } = useMarginTargets();
  const { data: surcharges = [] } = useProcessingSurcharges();
  const { data: vats = [] } = useVatRates();
  const { data: cutModels = [] } = useSpeciesCutModels();
  const { data: modelSplits = [] } = useCutModelSplits();
  const { data: detailPrices = [] } = useDetailPrices();
  const { data: saved = [] } = useAuctionCalcs();
  const saveCalc = useSaveAuctionCalc();
  const updateCalc = useUpdateAuctionCalc();

  const [species, setSpecies] = useState("");
  const [rawQty, setRawQty] = useState("100");
  const [yieldPct, setYieldPct] = useState("");
  /** Sortering på råvaran ("" = okänd). */
  const [grade, setGrade] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [bid, setBid] = useState("");

  const speciesOptions = useMemo(
    () =>
      [...new Set([...cutModels.map((c) => c.species_group), ...yields.map((y) => y.species_group), ...SPECIES_GROUP_SUGGESTIONS])].sort(
        (a, b) => a.localeCompare(b, "sv"),
      ),
    [cutModels, yields],
  );

  const modelRow = cutModels.find((c) => speciesKey(c.species_group) === speciesKey(species));
  const baseCutModel = (modelRow?.cut_model as CutModel) ?? modelForSpecies(species);
  const cutModel = effectiveCutModel(baseCutModel, grade, (modelRow as any)?.grade_limit ?? null);
  const gradeForcedSingle = cutModel !== baseCutModel;
  const vatPct = vatFor(vats, "Färsk Fisk");
  const surcharge = surchargeFor(surcharges, "Färsk Fisk");
  const rawQtyNum = parseFloat(rawQty) || 0;
  const yieldNum = parseFloat(yieldPct) || 0;

  const modelDetails = useMemo(() => {
    const dbRows = modelSplits.filter((s) => s.cut_model === cutModel && !s.is_optional);
    if (dbRows.length > 0)
      return dbRows.map((s) => ({
        form: s.detail_form,
        name: s.detail_name || detailFormLabel(s.detail_form),
        pctOfFillet: Number(s.pct_of_fillet),
      }));
    return CUT_MODEL_TEMPLATES[cutModel]
      .filter((d) => !d.optional)
      .map((d) => ({ form: d.form, name: d.name, pctOfFillet: d.pctOfFillet }));
  }, [modelSplits, cutModel]);

  // Utbyte förifylls från registret när arten byts.
  useEffect(() => {
    if (!species) return;
    const y = yields
      .filter((r) => speciesKey(r.species_group) === speciesKey(species) && r.from_form === "hel")
      .sort((a, b) => Number(b.yield_pct) - Number(a.yield_pct))[0];
    if (y) setYieldPct(String(Number(y.yield_pct)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [species, yields.length]);

  const build = () => {
    const fillet = (rawQtyNum * yieldNum) / 100;
    setRows(
      modelDetails.map((m) => {
        const ref = detailPrices.find(
          (d) =>
            speciesKey(d.species_group) === speciesKey(species) &&
            normalizeDetailForm(d.detail_form) === normalizeDetailForm(m.form),
        );
        const last = Number(ref?.last_set_price) || 0;
        return {
          form: m.form,
          name: m.name,
          qty: Number(((fillet * m.pctOfFillet) / 100).toFixed(2)),
          priceInclVat: last > 0 ? String(last) : "",
        };
      }),
    );
  };

  const lines = rows.map((r) => ({
    qtyKg: r.qty,
    priceExVat: (parseFloat(r.priceInclVat) || 0) / (1 + vatPct / 100),
    surchargePerKg: surcharge,
  }));

  const regions = margins.map((m) => {
    const target = Number(m.target_pct);
    const calc = auctionMaxRawPrice({ rawQuantity: rawQtyNum, targetMarginPct: target, lines });
    return { region: m.region, label: m.label || m.region, target, ...calc };
  });

  const bidNum = parseFloat(bid) || 0;
  const bidMargin = batchMargin({
    purchasePricePerKg: bidNum,
    rawQuantity: rawQtyNum,
    lines: lines.map((l) => ({ qty: l.qtyKg, priceExVat: l.priceExVat, surchargePerKg: l.surchargePerKg })),
  });

  const save = async () => {
    if (!species || rows.length === 0) return;
    const gbg = regions.find((r) => r.label.toLowerCase().includes("göteborg")) ?? regions[regions.length - 1];
    const sthlm = regions.find((r) => r.label.toLowerCase().includes("stockholm")) ?? regions[0];
    try {
      await saveCalc.mutateAsync({
        species_group: species,
        raw_quantity: rawQtyNum,
        raw_form: "hel",
        yield_pct: yieldNum,
        cut_model: cutModel,
        detail_prices: rows as any,
        max_price_sthlm: sthlm?.maxPricePerKg ?? null,
        max_price_gbg: gbg?.maxPricePerKg ?? null,
        bid_price: bidNum || null,
      });
      toast({ title: "Kalkyl sparad", description: `${species} · ${fmt(rawQtyNum, 0)} kg` });
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <Gavel className="h-4 w-4" /> Auktionskalkyl — högsta försvarbara inköpspris
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1 col-span-2 lg:col-span-1">
              <Label className="text-[11px]">Art</Label>
              <Select value={species} onValueChange={setSpecies}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Välj art" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {speciesOptions.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {species && <p className="text-[10px] text-muted-foreground">{CUT_MODEL_LABELS[cutModel]}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Råvara (kg)</Label>
              <Input type="number" step="1" value={rawQty} onChange={(e) => setRawQty(e.target.value)} className="h-9 text-xs text-right font-mono tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">Utbyte (%)</Label>
              <Input type="number" step="0.1" value={yieldPct} onChange={(e) => setYieldPct(e.target.value)} className="h-9 text-xs text-right font-mono tabular-nums" />
            </div>
            <div className="flex items-end">
              <Button size="sm" variant="outline" className="h-9 w-full text-xs" onClick={build} disabled={!species || yieldNum <= 0}>
                Hämta detaljer
              </Button>
            </div>
          </div>

          {rows.length > 0 && (
            <div className="space-y-2">
              {rows.map((r, i) => (
                <div key={r.form} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">{r.name}</p>
                    <p className="font-mono text-[10px] tabular-nums text-muted-foreground">{fmt(r.qty, 1)} kg</p>
                  </div>
                  <Input
                    type="number"
                    step="1"
                    placeholder="kr ink moms"
                    value={r.priceInclVat}
                    onChange={(e) =>
                      setRows((prev) => prev.map((x, xi) => (xi === i ? { ...x, priceInclVat: e.target.value } : x)))
                    }
                    className="h-9 w-28 text-xs text-right font-mono tabular-nums"
                  />
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground">
                Påslag {fmt(surcharge, 0)} kr/kg · moms {fmt(vatPct, 0)} %
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {regions.map((r) => (
              <Card key={r.region}>
                <CardContent className="space-y-1 p-3">
                  <p className="text-[11px] text-muted-foreground">
                    {r.label.split(" (")[0]} · mål {fmt(r.target, 0)} %
                  </p>
                  <div className="flex flex-wrap items-end gap-4">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Partiet håller</p>
                      <p className="font-mono text-2xl font-semibold tabular-nums">{fmt(r.maxPricePerKg, 2)} kr/kg</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Alla detaljer håller</p>
                      <p className="font-mono text-2xl font-semibold tabular-nums">
                        {fmt(r.maxPricePerKgAllDetails, 2)} kr/kg
                      </p>
                    </div>
                  </div>
                  {r.maxPricePerKgAllDetails < r.maxPricePerKg && (
                    <p className="text-[10px] text-amber-600">
                      Den billigaste detaljen är styrande — över {fmt(r.maxPricePerKgAllDetails, 2)} kr/kg hamnar minst en
                      detalj under målet även om partiet håller.
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground">
                    intäkt {fmt(r.revenueExVat, 0)} kr · tillåten kostnad {fmt(r.allowedTotalCost, 0)} kr · arbete{" "}
                    {fmt(r.surchargeCost, 0)} kr
                  </p>
                </CardContent>

              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="space-y-2 p-3">
              <Label className="text-[11px]">Budpris (kr/kg)</Label>
              <Input
                type="number"
                step="0.5"
                value={bid}
                onChange={(e) => setBid(e.target.value)}
                className="h-9 text-xs text-right font-mono tabular-nums"
              />
              {bidNum > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <Badge variant="outline" className="font-mono tabular-nums">
                    På råvara {fmt(bidMargin.marginOnRawPct, 1)} %
                  </Badge>
                  <Badge variant="outline" className="font-mono tabular-nums">
                    Ink. arbete {fmt(bidMargin.marginInclWorkPct, 1)} %
                  </Badge>
                  {regions.map((r) => (
                    <Badge
                      key={r.region}
                      variant="outline"
                      className={
                        bidNum <= r.maxPricePerKg
                          ? "border-emerald-500 text-emerald-600"
                          : "border-destructive text-destructive"
                      }
                    >
                      {r.label.split(" (")[0]}: {bidNum <= r.maxPricePerKg ? "inom målet" : "över maxpris"}
                    </Badge>
                  ))}
                </div>
              )}
              <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={save} disabled={saveCalc.isPending}>
                <Save className="h-3.5 w-3.5" /> Spara kalkyl
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {saved.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Sparade kalkyler</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0">
            {saved.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-[11px]">
                <span className="font-mono tabular-nums text-muted-foreground">{c.calc_date}</span>
                <span className="font-medium">{c.species_group}</span>
                <span className="font-mono tabular-nums">{fmt(Number(c.raw_quantity), 0)} kg</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  max {fmt(Number(c.max_price_sthlm ?? 0), 0)} / {fmt(Number(c.max_price_gbg ?? 0), 0)} kr
                </span>
                {c.bid_price != null && (
                  <span className="font-mono tabular-nums">bud {fmt(Number(c.bid_price), 0)} kr</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="klubbslag"
                    defaultValue={c.actual_price != null ? String(Number(c.actual_price)) : ""}
                    onBlur={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v)) updateCalc.mutate({ id: c.id, actual_price: v });
                    }}
                    className="h-8 w-24 text-[11px] text-right font-mono tabular-nums"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
