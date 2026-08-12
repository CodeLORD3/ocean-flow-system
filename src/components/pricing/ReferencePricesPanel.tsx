import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Ruler, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  useDetailPrices,
  useMarginTargets,
  useSpeciesCutModels,
  useCutModelSplits,
  useUpsertDetailPrice,
  detailPriceRow,
} from "@/hooks/useProductionYields";
import { useSpeciesPurchaseStats } from "@/hooks/useReferencePricing";
import {
  CUT_MODEL_TEMPLATES,
  CutModel,
  detailFormLabel,
  modelForSpecies,
  normalizeDetailForm,
  speciesKey,
} from "@/lib/cutModels";
import { SPECIES_GROUP_SUGGESTIONS } from "@/lib/speciesGroups";
import { fmt } from "@/lib/filletMath";

interface RowKeyed {
  species: string;
  form: string;
  role: "primary" | "byproduct";
  purchaseCount: number;
  rollingAvgCost: number | null;
  costSource: "day_price" | "purchase_avg" | null;
}

/**
 * Referenspriser: den relativa värderingen per detalj och prislista.
 *
 * Priset är inte ett fast utpris utan nivån vid en angiven referenskostnad.
 * Tillverkningsordern skalar sedan hela nivån efter partiets verkliga
 * snittkostnad, så förhållandet mellan detaljerna bevaras.
 */
export function ReferencePricesPanel() {
  const { data: detailPrices = [] } = useDetailPrices();
  const { data: margins = [] } = useMarginTargets();
  const { data: cutModels = [] } = useSpeciesCutModels();
  const { data: modelSplits = [] } = useCutModelSplits();
  const { data: stats } = useSpeciesPurchaseStats();
  const upsert = useUpsertDetailPrice();

  const priceLists = useMemo(
    () =>
      margins.map((m) => ({
        key: (m as any).price_list as string,
        label: m.label || m.region,
        inclVat: ((m as any).applies_to ?? "butik") === "butik",
      })),
    [margins],
  );
  const [priceList, setPriceList] = useState<string>("");
  const activeList = priceLists.find((p) => p.key === priceList) ?? priceLists[0];
  const listKey = activeList?.key ?? "";

  const [edits, setEdits] = useState<Record<string, { price?: string; cost?: string }>>({});
  const cellKey = (species: string, form: string) => `${speciesKey(species)}|${normalizeDetailForm(form)}`;

  /** Detaljformerna i artens styckningsmodell. */
  const formsForSpecies = (species: string): { form: string; role: "primary" | "byproduct" }[] => {
    const dbModel = cutModels.find((c) => speciesKey(c.species_group) === speciesKey(species));
    const model = ((dbModel?.cut_model as CutModel) ?? modelForSpecies(species)) as CutModel;
    const dbSplits = modelSplits.filter((s) => s.cut_model === model);
    if (dbSplits.length > 0) {
      return dbSplits.map((s) => ({
        form: normalizeDetailForm(s.detail_form),
        role: (s.role === "primary" ? "primary" : "byproduct") as "primary" | "byproduct",
      }));
    }
    return (CUT_MODEL_TEMPLATES[model] ?? []).map((d) => ({
      form: normalizeDetailForm(d.form),
      role: d.role,
    }));
  };

  /** En rad per art och detaljform, vanligast inköpta art först. */
  const rows: RowKeyed[] = useMemo(() => {
    const speciesSet = new Map<string, string>();
    const add = (s?: string | null) => {
      if (!s) return;
      const k = speciesKey(s);
      if (!speciesSet.has(k)) speciesSet.set(k, s);
    };
    for (const [, st] of stats ?? new Map()) add(st.speciesGroup);
    cutModels.forEach((c) => add(c.species_group));
    detailPrices.forEach((d) => add(d.species_group));
    SPECIES_GROUP_SUGGESTIONS.forEach(add);

    const out: RowKeyed[] = [];
    for (const [k, species] of speciesSet) {
      const st = stats?.get(k);
      for (const f of formsForSpecies(species)) {
        out.push({
          species,
          form: f.form,
          role: f.role,
          purchaseCount: st?.purchaseCount ?? 0,
          rollingAvgCost: st?.rollingAvgCost ?? null,
          costSource: st?.costSource ?? null,
        });
      }
    }
    return out.sort(
      (a, b) =>
        b.purchaseCount - a.purchaseCount ||
        a.species.localeCompare(b.species, "sv") ||
        a.form.localeCompare(b.form, "sv"),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats, cutModels, modelSplits, detailPrices]);

  const [onlyMissing, setOnlyMissing] = useState(true);
  const [onlyInStock, setOnlyInStock] = useState(true);

  /** Arter som faktiskt har saldo i lagret — det är dessa som ska prissättas nu. */
  const { data: speciesInStock } = useQuery({
    queryKey: ["species_with_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock_locations")
        .select("quantity, products(species_group)")
        .gt("quantity", 0);
      if (error) throw error;
      const set = new Set<string>();
      for (const row of (data ?? []) as any[]) {
        const s = row.products?.species_group;
        if (s) set.add(speciesKey(s) as string);
      }
      return set;
    },
  });

  const storedFor = (species: string, form: string) => detailPriceRow(detailPrices, listKey, species, form);

  const visible = useMemo(() => {
    let list = rows;
    if (onlyInStock && speciesInStock && speciesInStock.size > 0) {
      list = list.filter((r) => speciesInStock.has(speciesKey(r.species) as string));
    }
    if (!onlyMissing) return list;
    return list.filter((r) => {
      const row = storedFor(r.species, r.form);
      const price = Number((row as any)?.price_incl_vat ?? row?.last_set_price ?? 0);
      const cost = Number((row as any)?.reference_cost_per_kg ?? 0);
      return !(price > 0 && cost > 0);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, onlyMissing, onlyInStock, speciesInStock, detailPrices, listKey]);


  const save = async (r: RowKeyed) => {
    const k = cellKey(r.species, r.form);
    const stored = storedFor(r.species, r.form);
    const priceText = edits[k]?.price;
    const costText = edits[k]?.cost;
    const price =
      priceText != null && priceText !== ""
        ? parseFloat(priceText.replace(",", "."))
        : Number((stored as any)?.price_incl_vat ?? stored?.last_set_price ?? 0) || null;
    const cost =
      costText != null && costText !== ""
        ? parseFloat(costText.replace(",", "."))
        : Number((stored as any)?.reference_cost_per_kg ?? 0) ||
          (r.rollingAvgCost != null ? Math.round(r.rollingAvgCost * 100) / 100 : null);

    if (!(Number(price) > 0)) {
      toast({ title: "Referenspris saknas", description: "Ange ett referenspris över 0.", variant: "destructive" });
      return;
    }
    try {
      await upsert.mutateAsync({
        species_group: r.species,
        detail_form: r.form,
        price_list: listKey,
        price_incl_vat: Number(price),
        reference_cost_per_kg: Number(cost) > 0 ? Number(cost) : null,
        role: r.role,
      });
      setEdits((prev) => {
        const next = { ...prev };
        delete next[k];
        return next;
      });
      toast({
        title: "Referenspris sparat",
        description: `${r.species} ${detailFormLabel(r.form)}: ${fmt(Number(price), 2)} kr vid ${
          Number(cost) > 0 ? `${fmt(Number(cost), 2)} kr/kg` : "okänd referenskostnad"
        }`,
      });
    } catch (e: any) {
      toast({ title: "Fel", description: e.message, variant: "destructive" });
    }
  };

  if (priceLists.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ruler className="h-5 w-5" /> Referenspriser
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Referenspriset är nivån vid en angiven råvarukostnad. Tillverkningsordern skalar hela nivån efter partiets
          verkliga snittkostnad — förhållandet mellan detaljerna ligger still.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-[11px]">Prislista</Label>
            <Select value={listKey} onValueChange={setPriceList}>
              <SelectTrigger className="h-9 w-64 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {priceLists.map((pl) => (
                  <SelectItem key={pl.key} value={pl.key} className="text-xs">
                    {pl.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setOnlyMissing((v) => !v)}>
            {onlyMissing ? "Visa alla arter" : "Visa bara ofullständiga"}
          </Button>
          {/* Bara det som finns i lagret behöver prissättas nu — övriga döljs. */}
          <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => setOnlyInStock((v) => !v)}>
            {onlyInStock ? "Visa alla produkter" : "Visa bara det som finns i lager"}
          </Button>
          <span className="text-[11px] text-muted-foreground">
            {visible.length} rader · {activeList?.inclVat ? "priser inkl moms" : "priser exkl moms"}
            {onlyInStock ? " · endast arter med saldo" : ""}
          </span>

        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="h-9">
                <TableHead className="text-[11px]">Art</TableHead>
                <TableHead className="text-[11px]">Detalj</TableHead>
                <TableHead className="text-[11px] text-right">Referenspris</TableHead>
                <TableHead className="text-[11px] text-right">Referenskostnad kr/kg</TableHead>
                <TableHead
                  className="text-[11px] text-right"
                  title="Dagspris för artens aktiva partier. Saknas dagspris visas snittet av de tre senaste inköpen."
                >
                  Dagspris (annars inköpssnitt)
                </TableHead>
                <TableHead className="text-[11px] text-right">Inköpsrader</TableHead>
                <TableHead className="text-[11px] text-right">Spara</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => {
                const k = cellKey(r.species, r.form);
                const stored = storedFor(r.species, r.form);
                const storedPrice = Number((stored as any)?.price_incl_vat ?? stored?.last_set_price ?? 0);
                const storedCost = Number((stored as any)?.reference_cost_per_kg ?? 0);
                const priceValue = edits[k]?.price ?? (storedPrice > 0 ? String(storedPrice) : "");
                // Referenskostnaden förifylls från artens dagspris (aktiva partier)
                // när inget eget värde är sparat — annars från inköpssnittet.
                const prefillCost =
                  r.rollingAvgCost != null ? String(Math.round(r.rollingAvgCost * 100) / 100) : "";
                const costValue =
                  edits[k]?.cost ?? (storedCost > 0 ? String(storedCost) : prefillCost);
                const costIsPrefill = edits[k]?.cost == null && !(storedCost > 0) && prefillCost !== "";
                const complete = storedPrice > 0 && storedCost > 0;
                return (
                  <TableRow key={`${k}-${listKey}`} className="h-10">
                    <TableCell className="text-xs font-medium">
                      <span className="flex items-center gap-1.5">
                        {r.species}
                        <Badge
                          variant="outline"
                          className={`h-4 px-1 text-[9px] font-normal ${
                            complete
                              ? "border-emerald-500/40 text-emerald-600"
                              : "border-amber-500/40 text-amber-600"
                          }`}
                        >
                          {complete ? "klar" : "saknas"}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {detailFormLabel(r.form)}
                      {r.role === "primary" && (
                        <Badge variant="outline" className="ml-1 h-4 px-1 text-[9px]">
                          huvud
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={priceValue}
                        onChange={(e) => setEdits((p) => ({ ...p, [k]: { ...p[k], price: e.target.value } }))}
                        placeholder="—"
                        className="h-8 w-24 text-right font-mono text-xs tabular-nums"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        value={costValue}
                        onChange={(e) => setEdits((p) => ({ ...p, [k]: { ...p[k], cost: e.target.value } }))}
                        placeholder="—"
                        className={`h-8 w-24 text-right font-mono text-xs tabular-nums ${
                          costIsPrefill ? "text-muted-foreground" : ""
                        }`}
                        title={
                          costIsPrefill
                            ? r.costSource === "day_price"
                              ? "Förifyllt från dagspriset för artens aktiva partier"
                              : "Förifyllt från snittet av de tre senaste inköpen"
                            : undefined
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {r.rollingAvgCost ? (
                        <button
                          type="button"
                          className="underline decoration-dotted"
                          onClick={() =>
                            setEdits((p) => ({
                              ...p,
                              [k]: { ...p[k], cost: String(Math.round(r.rollingAvgCost! * 100) / 100) },
                            }))
                          }
                        >
                          {fmt(r.rollingAvgCost, 2)} kr
                          <span className="block text-[9px] text-muted-foreground">
                            {r.costSource === "day_price" ? "Dagspris" : "Inköpssnitt"}
                          </span>
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {r.purchaseCount}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 text-[11px]"
                        onClick={() => save(r)}
                        disabled={upsert.isPending}
                      >
                        <Save className="mr-1 h-3 w-3" /> Spara
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {visible.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-xs text-muted-foreground">
                    Alla arter i listan har både referenspris och referenskostnad.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
