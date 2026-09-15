import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowLeft,
  Check,
  Minus,
  Plus,
  RefreshCw,
  Scale,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import { useAllStockByLocation } from "@/hooks/useStorageLocations";
import {
  usePerformTransformationBatch,
  useSaveTransformPreset,
  useTransformPresets,
} from "@/hooks/useStockTransformations";
import { TRANSFORM_KINDS, suggestTransformKind, type TransformKind } from "@/lib/stockTransform";
import { lotBalancesAtLocation } from "@/lib/stockLedger";
import { contentPerUnitKg } from "@/lib/productFamilies";
import { isPieceUnit } from "@/lib/units";

/** Talfält som tål både komma och punkt. */
const num = (v: string) => Number(String(v).replace(",", ".")) || 0;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const kg = (n: number) => `${round3(n).toLocaleString("sv-SE", { maximumFractionDigits: 3 })} kg`;
const gram = (n: number) => `${Math.round(n).toLocaleString("sv-SE")} g`;

interface OutputRow {
  key: string;
  productId: string;
  productName: string;
  /** Förpackningsstorlek i kg (0 = fri mängd). */
  packSize: number;
  packages: number;
  /** Vägda bitar i gram — används vid valfria bitar. */
  pieces: number[];
  freeQty: number;
}

const outputQty = (o: OutputRow) =>
  o.pieces.length
    ? round3(o.pieces.reduce((s, g) => s + g, 0) / 1000)
    : o.packSize > 0
      ? round3(o.packages * o.packSize)
      : round3(o.freeQty);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Produkten som omvandlas. */
  product: { id: string; name: string; sku?: string | null; unit?: string | null } | null;
  locationId?: string | null;
  storeId?: string | null;
  /** Tillåtna lagernivåer — grossisten får inte omvandla butikernas eget lager. */
  allowedLevels?: string[] | null;
  /** Förvald målprodukt, t.ex. från omvandlingsprognosen i familjevyn. */
  initialTargetProductId?: string | null;
  onDone?: () => void;
}

/**
 * Produktomvandling, touch-först: personalen svarar bara på tre frågor —
 * vad använder jag, vad gör jag med den och vad blev det. Lagerrörelserna
 * (uttag, nya partier, svinn och spårbarhet) sköter systemet själv.
 */
export default function TransformFlow({
  open,
  onOpenChange,
  product,
  locationId,
  storeId,
  allowedLevels,
  initialTargetProductId,
  onDone,
}: Props) {
  const { toast } = useToast();
  const { data: products = [] } = useProducts();
  const { data: staff } = useCurrentStaff();
  const { data: allStock = [] } = useAllStockByLocation();
  const perform = usePerformTransformationBatch();
  const savePreset = useSaveTransformPreset();
  const { data: presets = [] } = useTransformPresets(product?.id);

  const [step, setStep] = useState(1);
  const [locId, setLocId] = useState("");
  const [lotId, setLotId] = useState<string | null>(null);
  const [mode, setMode] = useState<"kolli" | "kg">("kg");
  const [colli, setColli] = useState(1);
  const [kgAmount, setKgAmount] = useState("");
  const [kind, setKind] = useState<TransformKind>("packa_om");
  const [outputs, setOutputs] = useState<OutputRow[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickSearch, setPickSearch] = useState("");
  const [pickProduct, setPickProduct] = useState<{ id: string; name: string } | null>(null);
  const [pickSizeG, setPickSizeG] = useState("");
  const [weighMode, setWeighMode] = useState(false);
  const [pieceInput, setPieceInput] = useState("");
  const [restMode, setRestMode] = useState<"kvar" | "svinn" | "manuell" | null>(null);
  const [manualKvar, setManualKvar] = useState("");
  const [manualSvinn, setManualSvinn] = useState("");
  const [wasteReason, setWasteReason] = useState("");
  const [asPreset, setAsPreset] = useState(true);
  /** Målprodukt som ska läggas in automatiskt när utfallet fylls i. */
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);

  const sourceMeta = products.find((p) => p.id === product?.id) as any;
  const perColli = Number(sourceMeta?.weight_per_piece) || 0;

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
    setStep(1);
    setOutputs([]);
    setRestMode(null);
    setManualKvar("");
    setManualSvinn("");
    setWasteReason("");
    setWeighMode(false);
    setPickOpen(false);
    setPickProduct(null);
    setPickSizeG("");
    setPickSearch("");
    setKind(suggestTransformKind(product?.name, sourceMeta?.category));
    setMode(perColli > 0 ? "kolli" : "kg");
    setColli(1);
    const preferred =
      locationId && stockRows.some((s) => s.location_id === locationId)
        ? locationId
        : stockRows[0]?.location_id || "";
    setLocId(preferred || "");
    setPendingTarget(initialTargetProductId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id]);

  const currentRow = stockRows.find((s) => s.location_id === locId);
  const locationQty = Number(currentRow?.quantity) || 0;
  const unitCost = Number(currentRow?.unit_cost) || 0;

  const lotsQuery = useQuery({
    queryKey: ["transform-flow-lots", product?.id, locId],
    enabled: open && !!product?.id && !!locId,
    queryFn: async () => {
      const balances = await lotBalancesAtLocation(product!.id, locId);
      const ids = balances.map((b) => b.lotId).filter((v): v is string => !!v);
      const meta: Record<string, any> = {};
      if (ids.length) {
        const { data } = await supabase.from("lots").select("id, lot_number, best_before").in("id", ids);
        for (const l of data || []) meta[(l as any).id] = l;
      }
      return balances
        .filter((b) => b.quantityKg > 0.001)
        .map((b) => ({
          lotId: b.lotId,
          quantityKg: b.quantityKg,
          lotNumber: b.lotId ? meta[b.lotId]?.lot_number ?? "Okänt parti" : "Utan parti",
          bestBefore: b.lotId ? meta[b.lotId]?.best_before ?? null : null,
        }));
    },
  });
  const lots = lotsQuery.data || [];

  useEffect(() => {
    if (!open) return;
    if (lots.length && !lots.some((l) => l.lotId === lotId)) setLotId(lots[0].lotId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locId, lots.length]);

  const maxQty = lots.find((l) => l.lotId === lotId)?.quantityKg ?? locationQty;
  const maxColli = perColli > 0 ? Math.floor(maxQty / perColli) : 0;
  const amount = mode === "kolli" && perColli > 0 ? round3(colli * perColli) : num(kgAmount);

  useEffect(() => {
    if (mode === "kg" && !kgAmount && maxQty > 0) setKgAmount(String(round3(maxQty)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, maxQty]);

  const outTotal = round3(outputs.reduce((s, o) => s + outputQty(o), 0));
  const rest = round3(amount - outTotal);
  const kvarQty =
    restMode === "kvar" ? Math.max(rest, 0) : restMode === "manuell" ? Math.max(num(manualKvar), 0) : 0;
  const svinnQty =
    restMode === "svinn" ? Math.max(rest, 0) : restMode === "manuell" ? Math.max(num(manualSvinn), 0) : 0;
  const unaccounted = round3(rest - kvarQty - svinnQty);

  /**
   * Andra produkter i samma produktgrupp (familj) — hit kan varan omvandlas
   * oavsett förpackning eller enhet, t.ex. färsk räka till fryst räka.
   */
  const familySiblings = useMemo(() => {
    const famId = (sourceMeta as any)?.family_id;
    if (!famId) return [] as any[];
    return (products as any[])
      .filter((p) => p.family_id === famId && p.id !== product?.id)
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [products, sourceMeta, product?.id]);

  const targetOptions = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 30);
  }, [products, pickSearch]);

  const addOutput = (productId: string, productName: string, packSizeKg: number) => {
    const expected = packSizeKg > 0 ? Math.floor(Math.max(amount - outTotal, 0) / packSizeKg) : 0;
    setOutputs((rows) => [
      ...rows,
      {
        key: `${productId}-${Date.now()}`,
        productId,
        productName,
        packSize: packSizeKg,
        packages: expected,
        pieces: [],
        freeQty: packSizeKg > 0 ? 0 : round3(Math.max(amount - outTotal, 0)),
      },
    ]);
    setPickOpen(false);
    setPickProduct(null);
    setPickSizeG("");
    setPickSearch("");
  };

  const patchOutput = (key: string, patch: Partial<OutputRow>) =>
    setOutputs((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const active = outputs[outputs.length - 1];

  /** Kom flödet från en prognos läggs målförpackningen in direkt vid utfallet. */
  useEffect(() => {
    if (!open || step !== 3 || !pendingTarget || outputs.length > 0) return;
    const t = products.find((p) => p.id === pendingTarget) as any;
    setPendingTarget(null);
    if (!t) return;
    addOutput(t.id, t.name, contentPerUnitKg(t) ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, pendingTarget, outputs.length, products]);

  const bestBeforeFor = (productId: string) => {
    const days = Number((products.find((p) => p.id === productId) as any)?.shelf_life_days) || 0;
    return days ? new Date(Date.now() + days * 86400000).toISOString().slice(0, 10) : null;
  };

  const canConfirm =
    !!product &&
    !!locId &&
    amount > 0 &&
    amount <= maxQty + 0.001 &&
    (outTotal > 0 || svinnQty > 0) &&
    Math.abs(unaccounted) < 0.011 &&
    !perform.isPending;

  const confirm = async () => {
    if (!product || !canConfirm) return;
    try {
      const res = await perform.mutateAsync({
        storeId: currentRow?.storage_locations?.store_id ?? storeId ?? null,
        locationId: locId,
        sourceProductId: product.id,
        sourceProductName: product.name,
        sourceLotId: lotId,
        // Det som ligger kvar som lösvara förbrukas inte — massbalansen håller.
        sourceQuantity: round3(amount - kvarQty),
        sourceUnitCost: unitCost || null,
        kind,
        outputs: outputs
          .filter((o) => outputQty(o) > 0)
          .map((o) => ({
            productId: o.productId,
            productName: o.productName,
            quantity: outputQty(o),
            packages: o.pieces.length ? o.pieces.length : o.packSize > 0 ? o.packages : null,
            packSize: o.packSize || null,
            bestBefore: bestBeforeFor(o.productId),
          })),
        wasteQuantity: svinnQty,
        wasteReason: svinnQty > 0 ? wasteReason || "Svinn vid omvandling" : null,
        performedByName: staffFullName(staff) || null,
      });

      if (asPreset) {
        for (const o of outputs.filter((x) => outputQty(x) > 0)) {
          await savePreset
            .mutateAsync({
              sourceProductId: product.id,
              targetProductId: o.productId,
              label: o.packSize > 0 ? `${gram(o.packSize * 1000)} ${o.productName}` : o.productName,
              packSize: o.packSize || null,
              transformKind: kind,
              storeId: currentRow?.storage_locations?.store_id ?? storeId ?? null,
            })
            .catch(() => undefined);
        }
      }

      toast({
        title: "Omvandling klar",
        description: `${kg(amount - kvarQty)} ${product.name} → ${kg(res.outputQuantity)} (utbyte ${res.yieldPct} %)`,
      });
      onOpenChange(false);
      onDone?.();
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    }
  };

  const stepTitle = step === 1 ? "Vad använder du?" : step === 2 ? "Vad ska du göra?" : step === 3 ? "Vad blev det?" : "Klart att spara";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 rounded-none p-0 sm:h-[92vh] sm:max-w-2xl sm:rounded-lg">
        <DialogHeader className="border-b px-4 py-3 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span className="truncate">{product?.name || "Omvandla"}</span>
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Steg {step} av 4 · {stepTitle}
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-4 p-4 pb-6">
            {!product ? null : stockRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">Den här produkten har inget lagersaldo att omvandla.</p>
            ) : step === 1 ? (
              <>
                {stockRows.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {stockRows.map((s) => (
                      <Button
                        key={s.location_id}
                        variant={locId === s.location_id ? "default" : "outline"}
                        className="h-12 flex-1 justify-between gap-2 px-3 text-sm"
                        onClick={() => setLocId(s.location_id)}
                      >
                        <span className="truncate">{s.storage_locations?.name}</span>
                        <span className="font-mono tabular-nums text-xs">{kg(Number(s.quantity))}</span>
                      </Button>
                    ))}
                  </div>
                )}

                <Card className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Tillgängligt lager</p>
                  <p className="mt-1 text-3xl font-semibold tabular-nums">{kg(maxQty)}</p>
                  {perColli > 0 && (
                    <p className="text-sm text-muted-foreground">
                      {maxColli} × {kg(perColli)}
                    </p>
                  )}
                </Card>

                {lots.length > 1 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Parti</p>
                    {lots.map((l) => (
                      <Button
                        key={l.lotId ?? "none"}
                        variant={lotId === l.lotId ? "default" : "outline"}
                        className="h-12 w-full justify-between gap-2 px-3"
                        onClick={() => setLotId(l.lotId)}
                      >
                        <span className="truncate font-mono text-xs">{l.lotNumber}</span>
                        <span className="font-mono tabular-nums text-xs">{kg(l.quantityKg)}</span>
                      </Button>
                    ))}
                  </div>
                )}

                {perColli > 0 && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={mode === "kolli" ? "default" : "outline"}
                      className="h-12 text-sm"
                      onClick={() => setMode("kolli")}
                    >
                      Antal kolli
                    </Button>
                    <Button
                      variant={mode === "kg" ? "default" : "outline"}
                      className="h-12 text-sm"
                      onClick={() => setMode("kg")}
                    >
                      Vikt i kg
                    </Button>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Använd</p>
                  {mode === "kolli" && perColli > 0 ? (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-16 w-16 shrink-0"
                        onClick={() => setColli((c) => Math.max(1, c - 1))}
                      >
                        <Minus className="h-6 w-6" />
                      </Button>
                      <div className="flex-1 rounded-md border bg-muted/30 py-3 text-center">
                        <p className="text-3xl font-semibold tabular-nums">{colli}</p>
                        <p className="text-xs text-muted-foreground">kolli · {kg(amount)}</p>
                      </div>
                      <Button
                        variant="outline"
                        className="h-16 w-16 shrink-0"
                        onClick={() => setColli((c) => Math.min(Math.max(maxColli, 1), c + 1))}
                      >
                        <Plus className="h-6 w-6" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="h-16 w-16 shrink-0"
                        onClick={() => setKgAmount(String(round3(Math.max(0, num(kgAmount) - 1))))}
                      >
                        <Minus className="h-6 w-6" />
                      </Button>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={kgAmount}
                        onChange={(e) => setKgAmount(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        className="h-16 flex-1 text-center text-3xl font-semibold tabular-nums"
                        placeholder="0"
                      />
                      <Button
                        variant="outline"
                        className="h-16 w-16 shrink-0"
                        onClick={() => setKgAmount(String(round3(num(kgAmount) + 1)))}
                      >
                        <Plus className="h-6 w-6" />
                      </Button>
                    </div>
                  )}
                  <Button variant="ghost" className="h-10 w-full text-xs" onClick={() => setKgAmount(String(round3(maxQty)))}>
                    Använd hela partiet ({kg(maxQty)})
                  </Button>
                </div>
              </>
            ) : step === 2 ? (
              <div className="space-y-2">
                {TRANSFORM_KINDS.map((k) => {
                  const suggested = suggestTransformKind(product?.name, sourceMeta?.category) === k.value;
                  return (
                    <Button
                      key={k.value}
                      variant={kind === k.value ? "default" : "outline"}
                      className="h-16 w-full justify-between gap-2 px-4 text-left"
                      onClick={() => {
                        setKind(k.value);
                        setStep(3);
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold uppercase">{k.label}</span>
                        <span className="block truncate text-xs font-normal opacity-70">{k.hint}</span>
                      </span>
                      {suggested && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          Föreslås
                        </Badge>
                      )}
                    </Button>
                  );
                })}
              </div>
            ) : step === 3 ? (
              <div className="space-y-4">
                <Card className="flex items-center justify-between gap-2 p-3">
                  <span className="text-xs text-muted-foreground">Du använder</span>
                  <span className="font-mono text-base font-semibold tabular-nums">{kg(amount)}</span>
                </Card>

                {!outputs.length && familySiblings.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Samma produktgrupp</p>
                    <div className="grid grid-cols-2 gap-2">
                      {familySiblings.map((p) => {
                        const content = contentPerUnitKg(p);
                        const isPiece = isPieceUnit(p.unit);
                        return (
                          <Button
                            key={p.id}
                            variant="outline"
                            className="h-16 flex-col items-start justify-center gap-0.5 px-3 text-left"
                            onClick={() => addOutput(p.id, p.name, isPiece ? content ?? 0 : 0)}
                          >
                            <span className="w-full truncate text-sm font-semibold">{p.name}</span>
                            <span className="w-full truncate text-[11px] font-normal opacity-70">
                              {isPiece
                                ? content
                                  ? `${gram(content * 1000)} per styck`
                                  : "nettovikt saknas"
                                : "löpande vikt"}
                            </span>
                          </Button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {!outputs.length && (
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Snabbval</p>
                    {presets.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        Inga snabbval ännu — välj produkt nedan, den sparas som snabbval till nästa gång.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      {presets
                        .filter((p) => p.target)
                        .map((p) => (
                          <Button
                            key={p.id}
                            variant="outline"
                            className="h-16 flex-col items-start justify-center gap-0.5 px-3 text-left"
                            onClick={() =>
                              addOutput(p.target!.id, p.target!.name, Number(p.pack_size) || 0)
                            }
                          >
                            <span className="w-full truncate text-sm font-semibold uppercase">
                              {p.pack_size ? gram(Number(p.pack_size) * 1000) : "Fri mängd"}
                            </span>
                            <span className="w-full truncate text-[11px] font-normal opacity-70">
                              {p.target!.name}
                            </span>
                          </Button>
                        ))}
                      <Button
                        variant="secondary"
                        className="h-16 text-sm font-semibold uppercase"
                        onClick={() => setPickOpen(true)}
                      >
                        Annan storlek
                      </Button>
                    </div>
                  </div>
                )}

                {pickOpen && (
                  <Card className="space-y-3 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Vad blev det?</p>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPickOpen(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    {pickProduct ? (
                      <>
                        <p className="text-sm font-medium">{pickProduct.name}</p>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Förpackningsstorlek</p>
                          <div className="flex flex-wrap gap-2">
                            {[100, 200, 250, 300, 500, 1000].map((g) => (
                              <Button
                                key={g}
                                variant={num(pickSizeG) === g ? "default" : "outline"}
                                className="h-12 min-w-[76px] flex-1 text-sm font-semibold"
                                onClick={() => setPickSizeG(String(g))}
                              >
                                {gram(g)}
                              </Button>
                            ))}
                          </div>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={pickSizeG}
                            onChange={(e) => setPickSizeG(e.target.value)}
                            onFocus={(e) => e.currentTarget.select()}
                            className="h-12 text-center text-lg tabular-nums"
                            placeholder="Annan storlek i gram"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            className="h-12 text-sm"
                            disabled={num(pickSizeG) <= 0}
                            onClick={() =>
                              addOutput(pickProduct.id, pickProduct.name, round3(num(pickSizeG) / 1000))
                            }
                          >
                            Fortsätt
                          </Button>
                          <Button
                            variant="outline"
                            className="h-12 text-sm"
                            onClick={() => addOutput(pickProduct.id, pickProduct.name, 0)}
                          >
                            Fri mängd / vägda bitar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={pickSearch}
                            onChange={(e) => setPickSearch(e.target.value)}
                            className="h-12 pl-9 text-sm"
                            placeholder="Sök produkt"
                          />
                        </div>
                        <div className="max-h-64 space-y-1 overflow-y-auto">
                          {targetOptions.map((p) => (
                            <Button
                              key={p.id}
                              variant="outline"
                              className="h-12 w-full justify-start gap-2 px-3 text-left text-sm"
                              onClick={() => {
                                setPickProduct({ id: p.id, name: p.name });
                                setPickSizeG(String(Math.round((Number((p as any).weight_per_piece) || 0) * 1000) || ""));
                              }}
                            >
                              <span className="truncate">{p.name}</span>
                            </Button>
                          ))}
                        </div>
                      </>
                    )}
                  </Card>
                )}

                {outputs.map((o) => {
                  const isActive = active?.key === o.key;
                  const expected = o.packSize > 0 ? Math.floor(amount / o.packSize) : 0;
                  return (
                    <Card key={o.key} className="space-y-3 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{o.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {o.packSize > 0 ? `${gram(o.packSize * 1000)} per förpackning` : "Fri mängd"}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => setOutputs((rows) => rows.filter((r) => r.key !== o.key))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {o.packSize > 0 && !o.pieces.length && (
                        <>
                          {isActive && expected > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Förväntat: {expected} × {gram(o.packSize * 1000)}
                            </p>
                          )}
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">
                            Hur många blev det?
                          </p>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              className="h-16 w-16 shrink-0"
                              onClick={() => patchOutput(o.key, { packages: Math.max(0, o.packages - 1) })}
                            >
                              <Minus className="h-6 w-6" />
                            </Button>
                            <div className="flex-1 rounded-md border bg-muted/30 py-3 text-center">
                              <p className="text-3xl font-semibold tabular-nums">{o.packages}</p>
                              <p className="text-xs text-muted-foreground">
                                förpackningar · {kg(outputQty(o))}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              className="h-16 w-16 shrink-0"
                              onClick={() => patchOutput(o.key, { packages: o.packages + 1 })}
                            >
                              <Plus className="h-6 w-6" />
                            </Button>
                          </div>
                        </>
                      )}

                      {(o.packSize === 0 || o.pieces.length > 0) && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">
                              {weighMode || o.pieces.length ? "Vägda bitar" : "Total mängd"}
                            </p>
                            <Button
                              variant="ghost"
                              className="h-8 gap-1 text-xs"
                              onClick={() => setWeighMode((v) => !v)}
                            >
                              <Scale className="h-3.5 w-3.5" />
                              {weighMode || o.pieces.length ? "Ange total mängd" : "Väg varje bit"}
                            </Button>
                          </div>

                          {weighMode || o.pieces.length ? (
                            <>
                              <div className="flex gap-2">
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={pieceInput}
                                  onChange={(e) => setPieceInput(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && num(pieceInput) > 0) {
                                      patchOutput(o.key, { pieces: [...o.pieces, num(pieceInput)] });
                                      setPieceInput("");
                                    }
                                  }}
                                  className="h-14 flex-1 text-center text-xl tabular-nums"
                                  placeholder="Vikt i gram"
                                />
                                <Button
                                  className="h-14 px-4 text-sm"
                                  disabled={num(pieceInput) <= 0}
                                  onClick={() => {
                                    patchOutput(o.key, { pieces: [...o.pieces, num(pieceInput)] });
                                    setPieceInput("");
                                  }}
                                >
                                  <Plus className="mr-1 h-4 w-4" /> Lägg till bit
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {o.pieces.map((g, i) => (
                                  <Badge
                                    key={`${i}-${g}`}
                                    variant="secondary"
                                    className="h-8 cursor-pointer gap-1 px-2 text-xs tabular-nums"
                                    onClick={() =>
                                      patchOutput(o.key, { pieces: o.pieces.filter((_, idx) => idx !== i) })
                                    }
                                  >
                                    Bit {i + 1}: {gram(g)} <X className="h-3 w-3" />
                                  </Badge>
                                ))}
                              </div>
                              <div className="grid grid-cols-3 gap-2 rounded-md border bg-muted/30 p-2 text-center">
                                <div>
                                  <p className="text-[10px] uppercase text-muted-foreground">Ursprung</p>
                                  <p className="text-sm font-semibold tabular-nums">{gram(amount * 1000)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase text-muted-foreground">Registrerat</p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    {gram(outputQty(o) * 1000)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-[10px] uppercase text-muted-foreground">Kvar</p>
                                  <p className="text-sm font-semibold tabular-nums">
                                    {gram(Math.max(rest, 0) * 1000)}
                                  </p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <Input
                              type="text"
                              inputMode="decimal"
                              value={o.freeQty ? String(o.freeQty) : ""}
                              onChange={(e) => patchOutput(o.key, { freeQty: num(e.target.value) })}
                              onFocus={(e) => e.currentTarget.select()}
                              className="h-14 text-center text-xl tabular-nums"
                              placeholder="Mängd i kg"
                            />
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}

                {outputs.length > 0 && (
                  <Button variant="outline" className="h-14 w-full gap-2 text-sm" onClick={() => setPickOpen(true)}>
                    <Plus className="h-4 w-4" /> Annan förpackning
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <Card className="divide-y">
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-muted-foreground">Ingående</span>
                    <span className="font-mono text-base font-semibold tabular-nums">{kg(amount)}</span>
                  </div>
                  {outputs.map((o) => (
                    <div key={o.key} className="flex items-center justify-between gap-2 px-3 py-2.5">
                      <span className="min-w-0 truncate text-sm">
                        {o.pieces.length
                          ? `${o.pieces.length} bitar `
                          : o.packSize > 0
                            ? `${o.packages} × ${gram(o.packSize * 1000)} `
                            : ""}
                        {o.productName}
                      </span>
                      <span className="font-mono text-sm tabular-nums">{kg(outputQty(o))}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-muted-foreground">Utgående</span>
                    <span className="font-mono text-base font-semibold tabular-nums">{kg(outTotal)}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <span className="text-sm text-muted-foreground">Differens</span>
                    <span className="font-mono text-base font-semibold tabular-nums">{kg(rest)}</span>
                  </div>
                </Card>

                {rest > 0.011 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Vad hände med resterande {kg(rest)}?</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={restMode === "kvar" ? "default" : "outline"}
                        className="h-14 text-xs font-semibold uppercase"
                        onClick={() => setRestMode("kvar")}
                      >
                        Kvar som lösvara
                      </Button>
                      <Button
                        variant={restMode === "svinn" ? "default" : "outline"}
                        className="h-14 text-xs font-semibold uppercase"
                        onClick={() => setRestMode("svinn")}
                      >
                        Svinn
                      </Button>
                      <Button
                        variant="outline"
                        className="h-14 text-xs font-semibold uppercase"
                        onClick={() => {
                          setRestMode(null);
                          setStep(3);
                          setPickOpen(true);
                        }}
                      >
                        Annan förpackning
                      </Button>
                      <Button
                        variant={restMode === "manuell" ? "default" : "outline"}
                        className="h-14 text-xs font-semibold uppercase"
                        onClick={() => setRestMode("manuell")}
                      >
                        Ange manuellt
                      </Button>
                    </div>

                    {restMode === "kvar" && (
                      <p className="text-xs text-muted-foreground">
                        {kg(rest)} ligger kvar som {product?.name} på samma lagerplats.
                      </p>
                    )}
                    {restMode === "svinn" && (
                      <Input
                        value={wasteReason}
                        onChange={(e) => setWasteReason(e.target.value)}
                        className="h-12 text-sm"
                        placeholder="Anledning (valfritt)"
                      />
                    )}
                    {restMode === "manuell" && (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Kvar som lösvara (kg)</p>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={manualKvar}
                            onChange={(e) => setManualKvar(e.target.value)}
                            className="h-12 text-center text-lg tabular-nums"
                            placeholder="0"
                          />
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Svinn (kg)</p>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={manualSvinn}
                            onChange={(e) => setManualSvinn(e.target.value)}
                            className="h-12 text-center text-lg tabular-nums"
                            placeholder="0"
                          />
                        </div>
                      </div>
                    )}
                    {Math.abs(unaccounted) > 0.011 && (
                      <p className="text-xs text-destructive">
                        {kg(Math.abs(unaccounted))} är inte redovisat — fördela allt innan du sparar.
                      </p>
                    )}
                  </div>
                )}

                {rest < -0.011 && (
                  <p className="text-xs text-destructive">
                    Utfallet är {kg(Math.abs(rest))} större än det du använde. Ändra mängden eller utfallet.
                  </p>
                )}

                <Button
                  variant={asPreset ? "default" : "outline"}
                  className="h-12 w-full gap-2 text-sm"
                  onClick={() => setAsPreset((v) => !v)}
                >
                  <Star className={cn("h-4 w-4", asPreset && "fill-current")} />
                  {asPreset ? "Sparas som snabbval" : "Spara inte som snabbval"}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            variant="outline"
            className="h-14 flex-1 gap-1 text-sm"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep(step - 1))}
          >
            <ArrowLeft className="h-4 w-4" /> {step === 1 ? "Avbryt" : "Tillbaka"}
          </Button>
          {step < 3 ? (
            <Button
              className="h-14 flex-[2] text-base font-semibold"
              disabled={step === 1 && (amount <= 0 || amount > maxQty + 0.001)}
              onClick={() => setStep(step + 1)}
            >
              Fortsätt
            </Button>
          ) : step === 3 ? (
            <Button
              className="h-14 flex-[2] text-base font-semibold"
              disabled={outTotal <= 0}
              onClick={() => setStep(4)}
            >
              Klar med utfallet
            </Button>
          ) : (
            <Button className="h-14 flex-[2] gap-2 text-base font-semibold" disabled={!canConfirm} onClick={confirm}>
              <Check className="h-5 w-5" /> {perform.isPending ? "Sparar…" : "Spara omvandling"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
