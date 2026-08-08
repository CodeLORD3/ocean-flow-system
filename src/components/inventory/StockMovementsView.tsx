import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useStockMovements, MOVEMENT_LABELS } from "@/hooks/useStockMovements";
import { ArrowDownRight, ArrowUpRight, Search } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

const dec = (n: number, d = 1) =>
  Number(n).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const stamp = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const TYPE_FILTERS = ["all", ...Object.keys(MOVEMENT_LABELS)];

/** Lagerrörelser — full historik över varje förändring av lagersaldot. */
export default function StockMovementsView({
  locationIds,
  currency = "SEK",
  showCosts = true,
  onEmptyAction,
}: {
  locationIds?: string[];
  currency?: string;
  /** Butiksläget döljer kostpris och svinnvärde. */
  showCosts?: boolean;
  /** Åtgärd i det tomma tillståndet, t.ex. gå till inköpsrapportering. */
  onEmptyAction?: () => void;
}) {
  const [type, setType] = useState("all");
  const [search, setSearch] = useState("");
  const { data: movements = [], isLoading } = useStockMovements({
    locationIds,
    movementType: type,
    limit: 400,
  });


  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m: any) =>
      [m.products?.name, m.products?.sku, m.storage_locations?.name, m.lots?.lot_number, m.note]
        .filter(Boolean)
        .some((v: string) => String(v).toLowerCase().includes(q)),
    );
  }, [movements, search]);

  const hasFilter = search.trim().length > 0 || type !== "all";

  const totals = useMemo(() => {
    const inKg = rows
      .filter((m: any) => Number(m.quantity_kg) > 0)
      .reduce((s: number, m: any) => s + Number(m.quantity_kg), 0);
    const outKg = rows
      .filter((m: any) => Number(m.quantity_kg) < 0)
      .reduce((s: number, m: any) => s + Math.abs(Number(m.quantity_kg)), 0);
    const wasteKg = rows
      .filter((m: any) => m.movement_type === "svinn")
      .reduce((s: number, m: any) => s + Math.abs(Number(m.quantity_kg)), 0);
    const wasteValue = rows
      .filter((m: any) => m.movement_type === "svinn")
      .reduce(
        (s: number, m: any) => s + Math.abs(Number(m.quantity_kg)) * Number(m.unit_cost || 0),
        0,
      );
    return { inKg, outKg, wasteKg, wasteValue };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {[
          { l: "Inflöde", v: `${dec(totals.inKg)} kg` },
          { l: "Utflöde", v: `${dec(totals.outKg)} kg` },
          { l: "Svinn", v: `${dec(totals.wasteKg)} kg` },
          ...(showCosts
            ? [
                {
                  l: "Svinnvärde",
                  v: `${totals.wasteValue.toLocaleString("sv-SE", { maximumFractionDigits: 0 })} ${currency}`,
                },
              ]
            : []),
        ].map((k) => (
          <Card key={k.l}>
            <CardContent className="p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k.l}</p>
              <p className="font-mono tabular-nums text-lg font-semibold">{k.v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2 space-y-2">
          <CardTitle className="text-sm font-heading">Lagerrörelser</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sök produkt, parti, lagerplats…"
                className="h-8 pl-7 text-xs w-56"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {TYPE_FILTERS.map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={type === t ? "default" : "outline"}
                  className="h-7 text-[11px] px-2"
                  onClick={() => setType(t)}
                >
                  {t === "all" ? "Alla" : MOVEMENT_LABELS[t]}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left [&>th]:text-[10px] [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
                  <th>Tid</th>
                  <th>Produkt</th>
                  <th>Typ</th>
                  <th className="text-right">Kg</th>
                  {showCosts && <th className="text-right">Kostpris</th>}
                  <th>Lagerplats</th>
                  <th>Parti</th>
                  <th>Anteckning</th>
                  <th>Av</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={showCosts ? 9 : 8} className="px-3 py-6 text-center text-muted-foreground">
                      Hämtar rörelser…
                    </td>
                  </tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={showCosts ? 9 : 8} className="p-0">
                      <EmptyState
                        bare
                        icon={<ArrowUpRight className="h-4 w-4" />}
                        title={
                          hasFilter ? "Inga rörelser matchar urvalet" : "Inga lagerrörelser bokförda ännu"
                        }
                        description={
                          hasFilter
                            ? "Rensa sökningen eller välj Alla för att se hela historiken."
                            : "Rörelser skapas automatiskt när en inköpsrapport bokförs, vid tillverkning, överföring, inventering och svinn."
                        }
                        actionLabel={hasFilter ? "Rensa urval" : onEmptyAction ? "Till inköpsrapportering" : undefined}
                        onAction={
                          hasFilter
                            ? () => {
                                setSearch("");
                                setType("all");
                              }
                            : onEmptyAction
                        }
                      />
                    </td>
                  </tr>
                )}
                {rows.map((m: any) => {
                  const qty = Number(m.quantity_kg);
                  const outflow = qty < 0;
                  return (
                    <tr key={m.id} className="border-t border-border/50 hover:bg-muted/30">
                      <td className="px-2 py-1 whitespace-nowrap font-mono tabular-nums text-[11px] text-muted-foreground">
                        {stamp(m.created_at)}
                      </td>
                      <td className="px-2 py-1">
                        <span className="font-medium">{m.products?.name || "—"}</span>
                        {m.products?.sku && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {m.products.sku}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <Badge variant={outflow ? "destructive" : "secondary"} className="text-[10px]">
                          {MOVEMENT_LABELS[m.movement_type] || m.movement_type}
                        </Badge>
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono tabular-nums ${outflow ? "text-destructive" : "text-primary"}`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {outflow ? (
                            <ArrowDownRight className="h-3 w-3" />
                          ) : (
                            <ArrowUpRight className="h-3 w-3" />
                          )}
                          {dec(Math.abs(qty), 3)}
                        </span>
                      </td>
                      {showCosts && (
                        <td className="px-2 py-1 text-right font-mono tabular-nums">
                          {m.unit_cost ? dec(Number(m.unit_cost), 2) : "—"}
                        </td>
                      )}
                      <td className="px-2 py-1 text-muted-foreground">
                        {m.storage_locations?.name || "—"}
                      </td>
                      <td className="px-2 py-1 font-mono text-[11px] text-muted-foreground">
                        {m.lots?.lot_number || "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground max-w-[280px] truncate">
                        {m.note || "—"}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                        {m.staff ? `${m.staff.first_name} ${m.staff.last_name}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
