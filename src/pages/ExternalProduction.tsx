import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, Send, PackageCheck, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { useProducts } from "@/hooks/useProducts";
import { useSuppliers } from "@/hooks/useSuppliers";
import { useYields } from "@/hooks/useProductionYields";
import { useStaff } from "@/hooks/useStaff";
import { GROSSIST_FLYTANDE_ID } from "@/lib/locations";
import {
  openExternalAssignments,
  registerExternalReturn,
  sendExternalAssignment,
  matchStandardYield,
  type ExternalReturnResult,
} from "@/lib/externalProduction";

const nf = (v: any, dec = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const num = (v: string) => Number(String(v ?? "").replace(",", ".")) || 0;

interface ReturnRow {
  key: string;
  lineId: string | null;
  productId: string;
  detailName: string;
  detailForm: string;
  quantity: string;
  costWeight: string;
}

/**
 * Externa tillverkningsuppdrag. Råvara skickas till en legotillverkare och
 * ligger på tillverkningslagret tills returen registreras. Vid retur bevaras
 * partiet, utbytet mäts mot standard och arbetskostnaden räknas in i kostpriset.
 */
export default function ExternalProduction() {
  const qc = useQueryClient();
  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();
  const { data: yieldRows = [] } = useYields();
  const { data: staffList = [] } = useStaff();

  /* ── Skicka ut ───────────────────────────────────────────── */
  const [rawProductId, setRawProductId] = useState<string>("");
  const [qty, setQty] = useState("");
  const [supplier, setSupplier] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [sending, setSending] = useState(false);

  /* ── Registrera retur ───────────────────────────────────── */
  const [openOrder, setOpenOrder] = useState<any | null>(null);
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [extraCost, setExtraCost] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ExternalReturnResult | null>(null);

  const { data: stock = [] } = useQuery({
    queryKey: ["grossist_raw_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_stock_locations")
        .select("product_id, quantity, avg_cost")
        .eq("location_id", GROSSIST_FLYTANDE_ID)
        .gt("quantity", 0);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ["external_assignments"],
    queryFn: openExternalAssignments,
  });

  const rawOptions = useMemo(
    () =>
      stock
        .map((s) => {
          const p = products.find((x) => x.id === s.product_id);
          return p
            ? {
                id: p.id,
                name: p.name,
                sku: (p as any).sku ?? null,
                species: (p as any).species_group ?? null,
                quantity: Number(s.quantity),
                avgCost: Number(s.avg_cost) || 0,
              }
            : null;
        })
        .filter(Boolean) as {
        id: string;
        name: string;
        sku: string | null;
        species: string | null;
        quantity: number;
        avgCost: number;
      }[],
    [stock, products],
  );

  const selectedRaw = rawOptions.find((r) => r.id === rawProductId) ?? null;
  const qtyNum = num(qty);
  const labourPreview = qtyNum * num(pricePerKg);
  const rawCostPreview = qtyNum * (selectedRaw?.avgCost ?? 0);

  const send = async () => {
    if (!selectedRaw) return toast.error("Välj råvara ur grossistlagret.");
    setSending(true);
    try {
      await sendExternalAssignment({
        rawProductId: selectedRaw.id,
        rawName: selectedRaw.name,
        rawSku: selectedRaw.sku,
        rawForm: "hel",
        speciesGroup: selectedRaw.species,
        quantityKg: qtyNum,
        supplierName: supplier,
        supplierId: suppliers.find((s) => s.name === supplier)?.id ?? null,
        expectedReturnDate: returnDate,
        pricePerKg: num(pricePerKg),
        purchasePricePerKg: selectedRaw.avgCost,
        createdBy: staffList[0] ? null : null,
        plannedLines: [],
      });
      toast.success(
        `${nf(qtyNum)} kg ${selectedRaw.name} är utskickat och ligger på tillverkningslagret.`,
      );
      setQty("");
      setPricePerKg("");
      setRawProductId("");
      qc.invalidateQueries({ queryKey: ["external_assignments"] });
      qc.invalidateQueries({ queryKey: ["grossist_raw_stock"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
    } catch (e: any) {
      toast.error(e.message || "Uppdraget kunde inte skickas.");
    } finally {
      setSending(false);
    }
  };

  const openReturn = (order: any) => {
    setOpenOrder(order);
    setResult(null);
    setExtraCost("");
    const planned = (order.production_order_lines ?? []) as any[];
    setRows(
      planned.length
        ? planned.map((l) => ({
            key: l.id,
            lineId: l.id,
            productId: l.product_id ?? "",
            detailName: l.detail_name ?? "",
            detailForm: l.detail_form ?? "",
            quantity: "",
            costWeight: "1",
          }))
        : [
            {
              key: crypto.randomUUID(),
              lineId: null,
              productId: "",
              detailName: "",
              detailForm: "filé utan skinn",
              quantity: "",
              costWeight: "1",
            },
          ],
    );
  };

  const setRow = (key: string, patch: Partial<ReturnRow>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const returnedKg = rows.reduce((s, r) => s + num(r.quantity), 0);
  const rawQtyOut = Number(openOrder?.raw_quantity ?? 0);
  const measuredYield = rawQtyOut > 0 ? (returnedKg / rawQtyOut) * 100 : 0;
  const labourCost = rawQtyOut * Number(openOrder?.external_price_per_kg ?? 0);
  const rawCost = rawQtyOut * Number(openOrder?.purchase_price_per_kg ?? 0);
  const totalCost = rawCost + labourCost + num(extraCost);
  const weightSum = rows.reduce((s, r) => s + num(r.quantity) * (num(r.costWeight) || 1), 0);

  const standardFor = (detailForm: string) =>
    matchStandardYield(
      yieldRows as any[],
      openOrder?.species_group,
      openOrder?.raw_form,
      detailForm,
    );

  const submitReturn = async () => {
    if (!openOrder) return;
    setSaving(true);
    try {
      const res = await registerExternalReturn({
        orderId: openOrder.id,
        extraCost: num(extraCost),
        lines: rows
          .filter((r) => r.productId && num(r.quantity) > 0)
          .map((r) => ({
            lineId: r.lineId,
            productId: r.productId,
            detailName: r.detailName || products.find((p) => p.id === r.productId)?.name || "Detalj",
            detailForm: (r.detailForm || "filé utan skinn").trim(),
            quantityKg: num(r.quantity),
            costWeight: num(r.costWeight) || 1,
          })),
      });
      setResult(res);
      toast.success(
        `Retur registrerad: ${nf(res.returnedKg)} kg av ${nf(res.rawQuantityKg)} kg — utbyte ${nf(res.yieldPct)} %.`,
      );
      qc.invalidateQueries({ queryKey: ["external_assignments"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["lots"] });
      qc.invalidateQueries({ queryKey: ["yield_actuals"] });
      qc.invalidateQueries({ queryKey: ["grossist_raw_stock"] });
    } catch (e: any) {
      toast.error(e.message || "Returen kunde inte registreras.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-xl font-semibold text-foreground">
          <Factory className="h-5 w-5 text-primary" /> Externt uppdrag
        </h1>
        <p className="text-xs text-muted-foreground">
          Råvara som skickas på legotillverkning ligger på tillverkningslagret tills returen
          registreras. Partiet följer med, utbytet mäts mot standard och arbetskostnaden räknas in i
          detaljens kostpris.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Skicka ut råvara</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1 lg:col-span-2">
              <Label className="text-xs">Råvara i grossistlagret</Label>
              <Select value={rawProductId} onValueChange={setRawProductId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Välj råvara" />
                </SelectTrigger>
                <SelectContent>
                  {rawOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.name} — {nf(r.quantity)} kg
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Kvantitet (kg)</Label>
              <Input
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputMode="decimal"
                className="h-9 font-mono text-xs tabular-nums"
                placeholder="200"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Leverantör</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Välj leverantör" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.name} className="text-xs">
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Förväntad retur</Label>
              <Input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Arbete kr/kg</Label>
              <Input
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                inputMode="decimal"
                className="h-9 font-mono text-xs tabular-nums"
                placeholder="12,00"
              />
            </div>
          </div>

          {qtyNum > 0 && (
            <p className="text-xs text-muted-foreground">
              Råvarukostnad{" "}
              <span className="font-mono tabular-nums text-foreground">{nf(rawCostPreview, 2)} kr</span>{" "}
              + arbete{" "}
              <span className="font-mono tabular-nums text-foreground">{nf(labourPreview, 2)} kr</span>{" "}
              = totalt{" "}
              <span className="font-mono tabular-nums text-foreground">
                {nf(rawCostPreview + labourPreview, 2)} kr
              </span>{" "}
              att fördela på returen.
            </p>
          )}

          <Button size="sm" className="gap-1" onClick={send} disabled={sending}>
            <Send className="h-3 w-3" /> {sending ? "Skickar…" : "Skicka på uppdrag"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ute på uppdrag</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-xs text-muted-foreground">Hämtar uppdrag…</p>
          ) : assignments.length === 0 ? (
            <EmptyState
              bare
              title="Inget ute på externt uppdrag"
              description="Skicka ut råvara ovan. Uppdraget hamnar här tills returen registreras."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Råvara</th>
                    <th className="p-2 text-left font-medium">Leverantör</th>
                    <th className="p-2 text-right font-medium">Utskickat</th>
                    <th className="p-2 text-right font-medium">Arbete kr/kg</th>
                    <th className="p-2 text-left font-medium">Förväntad retur</th>
                    <th className="p-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {assignments.map((o) => (
                    <tr key={o.id} className="hover:bg-muted/40">
                      <td className="p-2 font-medium">{o.raw_name}</td>
                      <td className="p-2 text-muted-foreground">
                        {o.external_supplier_name ?? "—"}
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums">
                        {nf(o.raw_quantity)} kg
                      </td>
                      <td className="p-2 text-right font-mono tabular-nums">
                        {nf(o.external_price_per_kg, 2)}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {o.expected_return_date ?? "—"}
                      </td>
                      <td className="p-2 text-right">
                        <Button
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => openReturn(o)}
                        >
                          <PackageCheck className="h-3 w-3" /> Registrera retur
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(openOrder)}
        onOpenChange={(v) => {
          if (!v) {
            setOpenOrder(null);
            setResult(null);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Retur — {openOrder?.raw_name} {nf(rawQtyOut)} kg
            </DialogTitle>
            <DialogDescription className="text-xs">
              Ange vad leverantören vägde in. Detaljpartierna ärver fångstuppgifterna från råvarans
              parti och kostpriset blir (råvarukostnad + arbetskostnad) delat med returnerad
              kvantitet.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="space-y-3 text-xs">
              <div className="rounded-md border bg-muted/30 p-3">
                <p>
                  Utbyte:{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {nf(result.returnedKg)} av {nf(result.rawQuantityKg)} kg = {nf(result.yieldPct)} %
                  </span>
                </p>
                <p>
                  Kostnad: råvara {nf(result.rawCost, 2)} kr + arbete {nf(result.labourCost, 2)} kr ={" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {nf(result.totalCost, 2)} kr
                  </span>
                </p>
              </div>
              <div className="space-y-1">
                {result.yields.map((y) => (
                  <div key={y.detailForm + y.detailName} className="flex flex-wrap gap-2">
                    <span className="min-w-[8rem] font-medium">{y.detailName}</span>
                    <span className="font-mono tabular-nums">{nf(y.quantityOut)} kg</span>
                    <span className="font-mono tabular-nums">{nf(y.actualPct)} %</span>
                    {y.standardPct != null ? (
                      <Badge
                        variant={
                          (y.deviationPct ?? 0) < -2 ? "destructive" : "secondary"
                        }
                        className="text-[11px]"
                      >
                        standard {nf(y.standardPct)} % ({(y.deviationPct ?? 0) > 0 ? "+" : ""}
                        {nf(y.deviationPct)} pp)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[11px]">
                        standardutbyte saknas i yields
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
              {result.lotNumbers.length > 0 && (
                <p className="text-muted-foreground">
                  Detaljpartier: <span className="font-mono">{result.lotNumbers.join(", ")}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                {rows.map((r) => {
                  const q = num(r.quantity);
                  const pct = rawQtyOut > 0 ? (q / rawQtyOut) * 100 : 0;
                  const std = standardFor(r.detailForm);
                  const w = num(r.costWeight) || 1;
                  const cpk = weightSum > 0 ? (totalCost * w) / weightSum : 0;
                  return (
                    <div key={r.key} className="space-y-2 rounded-md border p-2">
                      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                        <Select
                          value={r.productId}
                          onValueChange={(v) =>
                            setRow(r.key, {
                              productId: v,
                              detailName:
                                r.detailName || products.find((p) => p.id === v)?.name || "",
                            })
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Returnerad produkt" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={r.detailForm}
                          onChange={(e) => setRow(r.key, { detailForm: e.target.value })}
                          placeholder="form, t.ex. filé utan skinn"
                          className="h-8 text-xs"
                        />
                        <Input
                          value={r.quantity}
                          onChange={(e) => setRow(r.key, { quantity: e.target.value })}
                          inputMode="decimal"
                          placeholder="kg"
                          className="h-8 font-mono text-xs tabular-nums"
                        />
                        <Input
                          value={r.costWeight}
                          onChange={(e) => setRow(r.key, { costWeight: e.target.value })}
                          inputMode="decimal"
                          title="Kostnadsvikt — 1 för huvuddetaljen, lägre för biprodukter"
                          className="h-8 font-mono text-xs tabular-nums"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {q > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          Utbyte{" "}
                          <span className="font-mono tabular-nums text-foreground">
                            {nf(pct)} %
                          </span>
                          {std != null
                            ? ` mot standard ${nf(std)} % (${pct - std > 0 ? "+" : ""}${nf(pct - std)} pp)`
                            : " — standardutbyte saknas i yields"}
                          {" · kostpris "}
                          <span className="font-mono tabular-nums text-foreground">
                            {nf(cpk, 2)} kr/kg
                          </span>
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1 text-xs"
                  onClick={() =>
                    setRows((r) => [
                      ...r,
                      {
                        key: crypto.randomUUID(),
                        lineId: null,
                        productId: "",
                        detailName: "",
                        detailForm: "avskär",
                        quantity: "",
                        costWeight: "1",
                      },
                    ])
                  }
                >
                  <Plus className="h-3 w-3" /> Fler returnerade produkter
                </Button>
                <div className="space-y-1">
                  <Label className="text-xs">Övrig kostnad (kr)</Label>
                  <Input
                    value={extraCost}
                    onChange={(e) => setExtraCost(e.target.value)}
                    inputMode="decimal"
                    className="h-8 w-28 font-mono text-xs tabular-nums"
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <p>
                  Retur{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {nf(returnedKg)} kg
                  </span>{" "}
                  av {nf(rawQtyOut)} kg — utbyte{" "}
                  <span className="font-mono tabular-nums text-foreground">
                    {nf(measuredYield)} %
                  </span>
                </p>
                <p className="text-muted-foreground">
                  Råvara {nf(rawCost, 2)} kr + arbete {nf(labourCost, 2)} kr
                  {num(extraCost) ? ` + övrigt ${nf(num(extraCost), 2)} kr` : ""} = {nf(totalCost, 2)}{" "}
                  kr att fördela
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpenOrder(null);
                setResult(null);
              }}
            >
              {result ? "Stäng" : "Avbryt"}
            </Button>
            {!result && (
              <Button size="sm" onClick={submitReturn} disabled={saving || returnedKg <= 0}>
                {saving ? "Registrerar…" : "Registrera retur"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
