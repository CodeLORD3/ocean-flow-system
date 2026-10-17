import { useStaffT } from "@/lib/staffI18n";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, CookingPot } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useProducts } from "@/hooks/useProducts";
import { useTransformationRecipes } from "@/hooks/useTransformationRecipes";
import { useCreateProductionOrder } from "@/hooks/useProductionYields";
import { fefoLotsAtLocation, type FefoAllocationResult, type FefoLot } from "@/lib/fefo";
import { LotPicker } from "@/components/production/LotPicker";
import { addStock, withdrawLot, GROSSIST_FLYTANDE_ID } from "@/lib/productionStock";
import { createOutputLot, recordLotTransformation } from "@/lib/lotTransformation";
import { fmt } from "@/lib/filletMath";
import { supabase } from "@/integrations/supabase/client";

/**
 * Omvandling råvara → färdigvara (kokning).
 *
 * Färdigvaran väljs först, omvandlingsregistret avgör vilken råvaru-SKU som
 * plockas. Partivalet följer FEFO, uttaget delas över flera partier när det
 * behövs, och varje kokt parti ärver härkomsten från exakt ett råvaruparti.
 *
 * Kokta skaldjur auto-godkänns aldrig till lager — de passerar manuell
 * prissättning, därför sätts inget utpris här.
 */
export function CookingOrderForm() {
  const { t, lang, dir } = useStaffT();
  const { data: recipes = [] } = useTransformationRecipes();
  const { data: products = [] } = useProducts();
  const createOrder = useCreateProductionOrder();
  const { staff } = useStaffAuth();
  const qc = useQueryClient();

  const active = useMemo(() => recipes.filter((r) => r.active), [recipes]);
  const [recipeId, setRecipeId] = useState("");
  const [rawQty, setRawQty] = useState("");
  const [actualOut, setActualOut] = useState("");
  const [lots, setLots] = useState<FefoLot[]>([]);
  const [loadingLots, setLoadingLots] = useState(false);
  const [alloc, setAlloc] = useState<(FefoAllocationResult & {
    startLotId: string | null;
    expiredJustification?: string;
    blockedByExpiry?: boolean;
  }) | null>(null);
  const [busy, setBusy] = useState(false);

  const recipe = active.find((r) => r.id === recipeId) ?? null;
  const rawProduct = products.find((p) => p.id === recipe?.raw_product_id);
  const outProduct = products.find((p) => p.id === recipe?.output_product_id);
  const rawQtyNum = parseFloat(rawQty) || 0;
  const yieldPct = Number(recipe?.yield_pct) || 0;
  const surcharge = Number(recipe?.surcharge_per_kg ?? 0);
  const expectedOut = Math.round(((rawQtyNum * yieldPct) / 100) * 1000) / 1000;
  const actualOutNum = parseFloat(actualOut) || 0;
  const bookedOut = actualOutNum > 0 ? actualOutNum : expectedOut;
  const actualPct = rawQtyNum > 0 ? (bookedOut / rawQtyNum) * 100 : 0;

  /** Råvarans partipris: viktat snitt över det faktiska uttaget. */
  const rawCostPerKg = useMemo(() => {
    if (!alloc?.allocations.length) return 0;
    let sum = 0;
    let kg = 0;
    for (const a of alloc.allocations) {
      const lot = lots.find((l) => l.lotId === a.lotId);
      const cost = lot?.unitCost ?? 0;
      sum += cost * a.quantityKg;
      kg += a.quantityKg;
    }
    return kg > 0 ? sum / kg : 0;
  }, [alloc, lots]);

  /** Kostpris kokt parti = råvarans partipris / utbyte + förädlingspåslag. */
  const cookedCostPerKg =
    yieldPct > 0 && rawCostPerKg > 0
      ? Math.round((rawCostPerKg / (yieldPct / 100) + surcharge) * 100) / 100
      : 0;

  useEffect(() => {
    let cancelled = false;
    if (!recipe?.raw_product_id) {
      setLots([]);
      return;
    }
    setLoadingLots(true);
    (async () => {
      try {
        const rows = await fefoLotsAtLocation(recipe.raw_product_id, GROSSIST_FLYTANDE_ID);
        if (!cancelled) setLots(rows);
      } catch (e: any) {
        if (!cancelled) toast({ title: t("tillverkning.text_57"), description: e.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoadingLots(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [recipe?.raw_product_id]);

  const shelfLifeDays = Number((outProduct as any)?.shelf_life_days) || null;
  const shelfLifeOpenDays = Number((outProduct as any)?.shelf_life_open_days) || null;
  const bestBeforeForOutput = () => {
    if (!shelfLifeDays) return null;
    const d = new Date();
    d.setDate(d.getDate() + shelfLifeDays);
    return d.toISOString().slice(0, 10);
  };

  const register = async () => {
    if (!recipe || !rawProduct || !outProduct || rawQtyNum <= 0) {
      toast({ title: t("tillverkning.text_58"), description: t("tillverkning.text_59"), variant: "destructive" });
      return;
    }
    if (!alloc?.fullyAllocated) {
      toast({
        title: t("tillverkning.text_60"),
        description: t("tillverkning.shortage").replace("{n}", fmt(alloc?.shortBy ?? rawQtyNum, 1)),
        variant: "destructive",
      });
      return;
    }
    if (alloc.blockedByExpiry) {
      toast({
        title: t("tillverkning.text_62"),
        description: t("tillverkning.text_63"),
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      if (alloc.usesExpired) {
        await supabase.from("activity_logs").insert({
          action: "expired_lot_used",
          entity_type: "production_order",
          description: `Kokning med utgånget parti: ${alloc.allocations
            .filter((a) => a.expired)
            .map((a) => a.lotNumber)
            .join(", ")} — motivering: ${alloc.expiredJustification ?? ""}`,
        } as any);
      }
      const totalIn = alloc.allocations.reduce((s, a) => s + a.quantityKg, 0);
      const order = await createOrder.mutateAsync({
        order: {
          production_date: new Date().toISOString().slice(0, 10),
          created_by: staff ? `${staff.first_name} ${staff.last_name}` : null,
          species_group: (rawProduct as any).species_group ?? null,
          raw_product_id: rawProduct.id,
          raw_sku: rawProduct.sku,
          raw_name: rawProduct.name,
          raw_form: "hel",
          raw_quantity: totalIn,
          purchase_price_per_kg: rawCostPerKg,
          waste_pct: Math.max(0, 100 - actualPct),
        } as any,
        lines: [
          {
            product_id: outProduct.id,
            detail_name: outProduct.name,
            detail_form: "kokt",
            planned_pct: yieldPct,
            planned_qty: expectedOut,
            cost_price: cookedCostPerKg,
            margin_weight: 1,
            is_processed: true,
            sort_order: 0,
          },
        ],
        actuals: [
          {
            species_group: (rawProduct as any).species_group ?? "okänd",
            from_form: "rå",
            to_form: "kokt",
            quantity_in: totalIn,
            quantity_out: bookedOut,
            standard_pct: yieldPct,
          },
        ],
      });

      const bestBefore = bestBeforeForOutput();
      const createdLots: string[] = [];
      for (let i = 0; i < alloc.allocations.length; i++) {
        const a = alloc.allocations[i];
        // Ut ur råvarupartiet
        await withdrawLot(rawProduct.id, a.lotId, a.quantityKg, GROSSIST_FLYTANDE_ID, {
          unitCost: lots.find((l) => l.lotId === a.lotId)?.unitCost ?? null,
          referenceType: "production_order",
          referenceId: order.id,
          note: `Kokning → ${outProduct.name}`,
        });
        // Kokt parti per källparti, ärver all spårbarhet
        const share = totalIn > 0 ? a.quantityKg / totalIn : 0;
        const outQty = Math.round(bookedOut * share * 1000) / 1000;
        if (outQty <= 0) continue;
        const outLotId = await createOutputLot(
          a.lotId,
          {
            productId: outProduct.id,
            quantityKg: outQty,
            unitCost: cookedCostPerKg,
            detailName: outProduct.name,
            detailForm: "kokt",
            lotCode: "KOKT",
            bestBefore,
          },
          order.id,
          i + 1,
        );
        if (outLotId) {
          const { data } = await supabase.from("lots").select("lot_number").eq("id", outLotId).maybeSingle();
          if ((data as any)?.lot_number) createdLots.push((data as any).lot_number);
        }
        await addStock(outProduct.id, outQty, cookedCostPerKg, GROSSIST_FLYTANDE_ID, {
          lotId: outLotId,
          referenceType: "production_order",
          referenceId: order.id,
          note: `Kokt ur ${a.lotNumber}`,
        });
        await recordLotTransformation({
          fromLotId: a.lotId,
          toLotId: outLotId,
          quantityInKg: a.quantityKg,
          quantityOutKg: outQty,
          productionOrderId: order.id,
        });
      }

      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["lots"] });

      toast({
        title: t("tillverkning.text_69"),
        description: `${fmt(totalIn, 1)} kg ${rawProduct.name} → ${fmt(bookedOut, 1)} kg ${outProduct.name} (${createdLots.join(", ")}). Kostpris ${fmt(cookedCostPerKg, 2)} kr/kg. Utpriset sätts manuellt.`,
      });
      setRawQty("");
      setActualOut("");
      const rows = await fefoLotsAtLocation(recipe.raw_product_id, GROSSIST_FLYTANDE_ID);
      setLots(rows);
    } catch (e: any) {
      toast({ title: t("tillverkning.error"), description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-1.5 text-sm">
            <CookingPot className="h-4 w-4" /> {t("tillverkning.text_71")} </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-[11px]">{t("tillverkning.text_72")}</Label>
              <Select value={recipeId} onValueChange={setRecipeId}>
                <SelectTrigger className="h-10 text-xs"><SelectValue placeholder={t("tillverkning.text_73")} /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {active.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.output?.name} ({r.output?.sku})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {active.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {t("tillverkning.text_74")} </p>
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{t("tillverkning.text_75")}</Label>
              <Input readOnly value={rawProduct ? `${rawProduct.sku} · ${rawProduct.name}` : ""} className="h-10 text-xs" />
              {recipe && <p className="text-[10px] text-muted-foreground">{t("tillverkning.text_76")} {fmt(yieldPct, 0)} {t("tillverkning.text_77")} {fmt(surcharge, 0)} kr/kg</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{t("tillverkning.text_79")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                value={rawQty}
                onChange={(e) => setRawQty(e.target.value)}
                className="h-10 text-right font-mono text-xs tabular-nums"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px]">{t("tillverkning.text_80")}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                placeholder={expectedOut ? String(expectedOut) : ""}
                value={actualOut}
                onChange={(e) => setActualOut(e.target.value)}
                className="h-10 text-right font-mono text-xs tabular-nums"
              />
              {rawQtyNum > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {t("tillverkning.text_81")} {fmt(expectedOut, 1)} {t("tillverkning.text_82")} {fmt(actualPct, 1)} %
                </p>
              )}
            </div>
          </div>

          {outProduct && shelfLifeDays && (
            <p className="text-[10px] text-muted-foreground">
              {t("tillverkning.text_83")} {shelfLifeDays} {t("tillverkning.text_84")} {bestBeforeForOutput()}
              {shelfLifeOpenDays ? t("tillverkning.opened_days").replace("{n}", String(shelfLifeOpenDays)) : ""}
            </p>
          )}

          {recipe && (
            <LotPicker
              lots={lots}
              quantityKg={rawQtyNum}
              loading={loadingLots}
              onChange={setAlloc}
              emptyHint={t("tillverkning.empty_batches").replace("{n}", rawProduct?.name ?? t("tillverkning.text_87"))}
            />
          )}

          {recipe && rawQtyNum > 0 && (
            <div className="grid gap-2 rounded-md border p-3 text-[11px] sm:grid-cols-4">
              <div>
                <p className="text-muted-foreground">{t("tillverkning.text_88")}</p>
                <p className="font-mono tabular-nums">{fmt(rawCostPerKg, 2)} kr/kg</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("tillverkning.text_90")}</p>
                <p className="font-mono tabular-nums">{fmt(bookedOut, 1)} kg</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("tillverkning.text_92")}</p>
                <p className="font-mono tabular-nums">{fmt(Math.max(0, rawQtyNum - bookedOut), 1)} kg</p>
              </div>
              <div>
                <p className="text-muted-foreground">{t("tillverkning.text_94")}</p>
                <p className="font-mono tabular-nums">{fmt(cookedCostPerKg, 2)} kr/kg</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="h-10 gap-1.5 text-xs" onClick={register} disabled={busy || !recipe || rawQtyNum <= 0}>
              <CookingPot className="h-3.5 w-3.5" /> {t("tillverkning.text_96")} </Button>
            <Badge variant="outline" className="gap-1 border-amber-400 text-[10px] text-amber-600">
              <AlertTriangle className="h-3 w-3" /> {t("tillverkning.text_97")} </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
