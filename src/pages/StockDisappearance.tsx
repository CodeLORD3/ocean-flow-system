import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useSiteContext } from "@/contexts/SiteContext";
import { useStockDisappearance } from "@/hooks/useStockDisappearance";

const fmt = (n: number) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 1 }).format(Math.round(n * 10) / 10);

const todayStockholm = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

/** Måndagen i samma vecka som datumet. */
function mondayOf(date: string) {
  const d = new Date(`${date}T00:00:00`);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function StockDisappearance() {
  const { data: stores = [] } = useStores();
  const { activeStoreId } = useSiteContext();
  const [storeId, setStoreId] = useState<string>(activeStoreId ?? "");
  const [mode, setMode] = useState<"dag" | "vecka">("dag");
  const [date, setDate] = useState(todayStockholm());

  const storeOptions = useMemo(
    () => stores.filter((s: any) => !!s.inventory_location_id),
    [stores],
  );
  const effectiveStore = storeId || storeOptions[0]?.id || "";

  const from = mode === "dag" ? date : mondayOf(date);
  const to = mode === "dag" ? date : addDays(mondayOf(date), 6);

  const { data: rows = [], isLoading, error } = useStockDisappearance(effectiveStore, from, to);

  const totals = rows.reduce(
    (acc, r) => ({
      disappeared: acc.disappeared + r.disappeared_qty,
      waste: acc.waste + r.waste_qty,
      sold: acc.sold + r.sold_qty,
    }),
    { disappeared: 0, waste: 0, sold: 0 },
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Försvunnet ur lagret</CardTitle>
          <p className="text-xs text-muted-foreground">
            Startlager plus inleveranser minus lagerrapportens slutvärde = varor som lämnat lagret.
            Svinnrapporten säger hur mycket som slängts — resten är sålt.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">Butik</label>
              <Select value={effectiveStore} onValueChange={setStoreId}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="Välj butik" />
                </SelectTrigger>
                <SelectContent>
                  {storeOptions.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Period</label>
              <div className="flex gap-1">
                <Button
                  variant={mode === "dag" ? "default" : "outline"}
                  className="h-11"
                  onClick={() => setMode("dag")}
                >
                  Dag
                </Button>
                <Button
                  variant={mode === "vecka" ? "default" : "outline"}
                  className="h-11"
                  onClick={() => setMode("vecka")}
                >
                  Vecka
                </Button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Datum</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 w-[160px]"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="outline">
              Period {from}
              {mode === "vecka" ? ` – ${to}` : ""}
            </Badge>
            <Badge variant="secondary">Försvunnet {fmt(totals.disappeared)}</Badge>
            <Badge variant="secondary">Svinn {fmt(totals.waste)}</Badge>
            <Badge variant="secondary">Sålt {fmt(totals.sold)}</Badge>
          </div>

          {error ? (
            <p className="rounded-md border border-destructive/40 p-3 text-xs text-destructive">
              {(error as Error).message}
            </p>
          ) : isLoading ? (
            <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Räknar…
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              Inget har försvunnit ur lagret under perioden.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/60">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Produkt</th>
                    <th className="px-2 py-2 text-right font-semibold">Start</th>
                    <th className="px-2 py-2 text-right font-semibold">Inlevererat</th>
                    <th className="px-2 py-2 text-right font-semibold">Slut</th>
                    <th className="px-2 py-2 text-right font-semibold">Försvunnet</th>
                    <th className="px-2 py-2 text-right font-semibold">Svinn</th>
                    <th className="px-2 py-2 text-right font-semibold">Sålt</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.product_id} className="border-t">
                      <td className="px-2 py-1.5">
                        <span className="block font-medium">{r.product_name}</span>
                        <span className="block text-[10px] text-muted-foreground">
                          {r.sku || "—"} · {r.unit}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {fmt(r.start_qty)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {fmt(r.received_qty)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {fmt(r.end_qty)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono font-semibold tabular-nums">
                        {fmt(r.disappeared_qty)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {fmt(r.waste_qty)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                        {fmt(r.sold_qty)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
