import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Scale }, Scissors } from "lucide-react";
import { fmt } from "@/lib/filletMath";
import {
  useProductionOrders,
  useRegisterActuals,
  useYieldActuals,
  type ProductionOrder,
  type ProductionOrderLine,
} from "@/hooks/useProductionYields";

type OrderWithLines = ProductionOrder & { production_order_lines: ProductionOrderLine[] };

export function ProductionHistory() {
  const { data: orders = [], isLoading } = useProductionOrders();
  const { data: actuals = [] } = useYieldActuals();
  const registerActuals = useRegisterActuals();
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [speciesFilter, setSpeciesFilter] = useState("all");

  const species = useMemo(
    () => [...new Set(orders.map((o) => o.species_group).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "sv")),
    [orders]
  );

  const filtered = useMemo(
    () => (speciesFilter === "all" ? orders : orders.filter((o) => o.species_group === speciesFilter)),
    [orders, speciesFilter]
  );

  const comparison = useMemo(() => {
    const map = new Map<string, { species: string; to_form: string; rows: number[]; }>();
    for (const a of actuals) {
      if (speciesFilter !== "all" && a.species_group !== speciesFilter) continue;
      const key = `${a.species_group}|${a.to_form}`;
      const cur = map.get(key) || { species: a.species_group, to_form: a.to_form, rows: [] };
      cur.rows.push(Number(a.actual_pct));
      map.set(key, cur);
    }
    return [...map.values()].map((v) => ({
      ...v,
      avg: v.rows.reduce((s, n) => s + n, 0) / v.rows.length,
      min: Math.min(...v.rows),
      max: Math.max(...v.rows),
      count: v.rows.length,
    }));
  }, [actuals, speciesFilter]);

  const saveActuals = (order: OrderWithLines) => {
    const lines = order.production_order_lines.map((l) => {
      const key = `${l.id}`;
      const raw = drafts[key];
      const qty = raw != null && raw !== "" ? parseFloat(raw) : Number(l.actual_qty ?? l.planned_qty);
      const rawQty = Number(order.raw_quantity) || 0;
      const actualPct = rawQty > 0 ? (qty / rawQty) * 100 : 0;
      const costPrice = actualPct > 0 ? Number(order.purchase_price_per_kg) / (actualPct / 100) : 0;
      return {
        id: l.id,
        actual_qty: qty,
        cost_price: costPrice,
        detail_form: l.detail_form,
        planned_pct: Number(l.planned_pct),
      };
    });
    registerActuals.mutate(
      { order, lines },
      {
        onSuccess: () => toast({ title: "Faktiskt utfall registrerat", description: "Kostpriser omräknade och avvikelser sparade." }),
        onError: (e: any) => toast({ title: "Fel", description: e.message, variant: "destructive" }),
      }
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={speciesFilter} onValueChange={setSpeciesFilter}>
          <SelectTrigger className="h-8 w-48 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Alla arter</SelectItem>
            {species.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} tillverkningsordrar</span>
      </div>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Tillverkningsordrar</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && <p className="p-4 text-xs text-muted-foreground">Laddar…</p>}
          {!isLoading && filtered.length === 0 && (
            <EmptyState
              bare
              icon={<Scissors className="h-4 w-4" />}
              title="Inga tillverkningsordrar ännu"
              description="Historiken fylls när du kör en tillverkningsorder i fliken Ny tillverkning: råvarupartiet plockas i FIFO-ordning och detaljpartier skapas automatiskt."
            />
          )}
          <div className="divide-y">
            {filtered.map((o) => {
              const isOpen = open === o.id;
              const plannedOut = o.production_order_lines.reduce((s, l) => s + Number(l.planned_qty), 0);
              const actualOut = o.production_order_lines.reduce((s, l) => s + Number(l.actual_qty ?? 0), 0);
              return (
                <div key={o.id}>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                    onClick={() => setOpen(isOpen ? null : o.id)}
                  >
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    <span className="text-xs font-medium">{o.raw_name}</span>
                    <span className="text-[11px] text-muted-foreground">{o.production_date}</span>
                    <span className="text-[11px] font-mono tabular-nums text-muted-foreground">
                      {fmt(Number(o.raw_quantity), 1)} kg in · {fmt(plannedOut, 1)} kg planerat
                      {actualOut > 0 && ` · ${fmt(actualOut, 1)} kg vägt`}
                    </span>
                    <Badge variant="outline" className="ml-auto text-[10px]">
                      {o.status === "completed" ? "Utfall registrerat" : "Planerat utfall"}
                    </Badge>
                  </button>
                  {isOpen && (
                    <div className="bg-muted/30 p-3">
                      <div className="mb-2 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-4">
                        <span>Leverantör: {o.supplier_name || "—"}</span>
                        <span>Parti: {o.batch_number || "—"}</span>
                        <span>Inköpspris: {fmt(Number(o.purchase_price_per_kg))} kr/kg</span>
                        <span>
                          Svinn: {fmt(Number(o.actual_waste_pct ?? o.waste_pct), 1)} %
                          {o.actual_waste_pct != null && " (faktiskt)"}
                        </span>
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow className="h-8">
                            <TableHead className="text-[11px]">Detalj</TableHead>
                            <TableHead className="text-[11px] text-right w-[90px]">Utbyte %</TableHead>
                            <TableHead className="text-[11px] text-right w-[100px]">Planerat kg</TableHead>
                            <TableHead className="text-[11px] text-right w-[120px]">Verklig vikt kg</TableHead>
                            <TableHead className="text-[11px] text-right w-[110px]">Kostpris kr/kg</TableHead>
                            <TableHead className="text-[11px] text-right w-[100px]">Avvikelse</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {o.production_order_lines
                            .slice()
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((l) => {
                              const rawQty = Number(o.raw_quantity) || 0;
                              const draft = drafts[l.id];
                              const qty = draft != null && draft !== "" ? parseFloat(draft) : Number(l.actual_qty ?? 0);
                              const actualPct = rawQty > 0 && qty ? (qty / rawQty) * 100 : 0;
                              const dev = actualPct ? actualPct - Number(l.planned_pct) : null;
                              const cost = actualPct > 0 ? Number(o.purchase_price_per_kg) / (actualPct / 100) : Number(l.cost_price);
                              return (
                                <TableRow key={l.id} className="h-9">
                                  <TableCell className="text-[11px]">{l.detail_name}</TableCell>
                                  <TableCell className="text-[11px] text-right font-mono tabular-nums">
                                    {fmt(Number(l.planned_pct), 1)}
                                  </TableCell>
                                  <TableCell className="text-[11px] text-right font-mono tabular-nums">
                                    {fmt(Number(l.planned_qty), 1)}
                                  </TableCell>
                                  <TableCell className="py-0.5">
                                    <Input
                                      type="number"
                                      step="0.1"
                                      defaultValue={l.actual_qty != null ? Number(l.actual_qty) : ""}
                                      placeholder={fmt(Number(l.planned_qty), 1)}
                                      className="h-7 text-[11px] text-right font-mono tabular-nums"
                                      onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                                    />
                                  </TableCell>
                                  <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(cost)}</TableCell>
                                  <TableCell
                                    className={`text-[11px] text-right font-mono tabular-nums ${
                                      dev == null ? "" : dev < -1 ? "text-destructive" : dev > 1 ? "text-emerald-600" : ""
                                    }`}
                                  >
                                    {dev == null ? "—" : `${dev > 0 ? "+" : ""}${fmt(dev, 1)} pp`}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                        </TableBody>
                      </Table>
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => saveActuals(o)} disabled={registerActuals.isPending}>
                          <Scale className="h-3.5 w-3.5" /> Registrera verkligt utfall
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Utbyten över tid per art</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {comparison.length === 0 ? (
            <EmptyState
              bare
              icon={<Scissors className="h-4 w-4" />}
              title="Inga verkliga utfall ännu"
              description="Jämförelsen mot utbytesregistret visas när du registrerat faktiskt utbyte på en genomförd tillverkningsorder."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="text-[11px]">Art</TableHead>
                  <TableHead className="text-[11px]">Detalj</TableHead>
                  <TableHead className="text-[11px] text-right w-[90px]">Snitt %</TableHead>
                  <TableHead className="text-[11px] text-right w-[90px]">Lägsta</TableHead>
                  <TableHead className="text-[11px] text-right w-[90px]">Högsta</TableHead>
                  <TableHead className="text-[11px] text-right w-[80px]">Partier</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comparison.map((c) => (
                  <TableRow key={`${c.species}-${c.to_form}`} className="h-9">
                    <TableCell className="text-[11px]">{c.species}</TableCell>
                    <TableCell className="text-[11px]">{c.to_form}</TableCell>
                    <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(c.avg, 1)}</TableCell>
                    <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(c.min, 1)}</TableCell>
                    <TableCell className="text-[11px] text-right font-mono tabular-nums">{fmt(c.max, 1)}</TableCell>
                    <TableCell className="text-[11px] text-right font-mono tabular-nums">{c.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
