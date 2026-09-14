import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { movementLabel } from "@/hooks/useStockMovements";

const nf = (n: number, d = 1) =>
  Number(n)
    .toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d })
    .replace(/\u00a0/g, " ");

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);
const dayLabel = (key: string) =>
  new Date(key + "T00:00:00Z").toLocaleDateString("sv-SE", { day: "2-digit", month: "short" });

const RANGES = [
  { v: 30, l: "30 dagar" },
  { v: 90, l: "3 månader" },
  { v: 365, l: "1 år" },
  { v: 0, l: "Allt" },
];

/**
 * Lagerflöde för en produkt — saldo över tid samt in- och utflöde per dag,
 * beräknat enbart från stock_movements (lagrets enda sanning).
 */
export default function ProductStockFlow({
  productId,
  productName,
  unit = "kg",
  locationIds,
  defaultOpen = false,
}: {
  productId: string;
  productName?: string;
  unit?: string | null;
  locationIds?: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [days, setDays] = useState(90);

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["product_stock_flow", productId, locationIds],
    enabled: open && !!productId,
    queryFn: async () => {
      let q = supabase
        .from("stock_movements")
        .select(
          "id, created_at, quantity_kg, movement_type, note, location_id, reference_type, reference_id, unit_cost, storage_locations(name, stores!storage_locations_store_id_fkey(name)), lots(lot_number), staff(first_name, last_name)",
        )
        .eq("product_id", productId)
        .order("created_at", { ascending: true })
        .limit(3000);
      if (locationIds?.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const { points, totals } = useMemo(() => {
    // Löpande saldo från noll — varje förändring av lagret är en rörelse.
    const perDay = new Map<string, { in: number; out: number }>();
    let running = 0;
    const balanceAtDay = new Map<string, number>();
    for (const m of movements) {
      const key = dayKey(m.created_at);
      const qty = Number(m.quantity_kg) || 0;
      const d = perDay.get(key) || { in: 0, out: 0 };
      if (qty >= 0) d.in += qty;
      else d.out += Math.abs(qty);
      perDay.set(key, d);
      running += qty;
      balanceAtDay.set(key, running);
    }

    const keys = [...perDay.keys()].sort();
    const cutoff = days
      ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
      : null;

    let carried = 0;
    const rows: {
      key: string;
      label: string;
      saldo: number;
      in: number;
      ut: number;
    }[] = [];
    for (const key of keys) {
      const d = perDay.get(key)!;
      const saldo = balanceAtDay.get(key)!;
      if (cutoff && key < cutoff) {
        carried = saldo;
        continue;
      }
      rows.push({
        key,
        label: dayLabel(key),
        saldo: Math.round(saldo * 10) / 10,
        in: Math.round(d.in * 10) / 10,
        ut: -Math.round(d.out * 10) / 10,
      });
    }
    if (rows.length && cutoff) {
      rows.unshift({ key: cutoff, label: dayLabel(cutoff), saldo: Math.round(carried * 10) / 10, in: 0, ut: 0 });
    }

    const totIn = rows.reduce((s, r) => s + r.in, 0);
    const totOut = rows.reduce((s, r) => s + Math.abs(r.ut), 0);
    return {
      points: rows,
      totals: { in: totIn, out: totOut, now: running, net: totIn - totOut },
    };
  }, [movements, days]);

  const u = unit === "st" ? "st" : "kg";

  return (
    <div className="rounded-md border border-border/60 bg-card">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-xs font-semibold">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <TrendingUp className="h-3.5 w-3.5 text-primary" />
          Lagerflöde över tid
          {productName && <span className="text-muted-foreground font-normal">· {productName}</span>}
        </span>
        {open && (
          <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {RANGES.map((r) => (
              <span
                key={r.v}
                role="button"
                onClick={() => setDays(r.v)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                  days === r.v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {r.l}
              </span>
            ))}
          </span>
        )}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/60 p-2.5">
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Hämtar rörelser…</p>
          ) : points.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Inga lagerrörelser för produkten i valt intervall.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { l: "Saldo nu", v: totals.now, c: "text-foreground" },
                  { l: "Inflöde", v: totals.in, c: "text-emerald-500" },
                  { l: "Utflöde", v: totals.out, c: "text-destructive" },
                  { l: "Netto", v: totals.net, c: totals.net >= 0 ? "text-emerald-500" : "text-destructive" },
                ].map((k) => (
                  <div key={k.l} className="rounded-md border border-border/60 bg-muted/30 p-2">
                    <p className="text-[11px] text-muted-foreground">{k.l}</p>
                    <p className={`font-mono text-sm font-semibold tabular-nums ${k.c}`}>
                      {nf(k.v)} {u}
                    </p>
                  </div>
                ))}
              </div>

              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      width={44}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "hsl(var(--popover-foreground))",
                      }}
                      formatter={(v: any, n: any) => [`${nf(Math.abs(Number(v)))} ${u}`, n]}
                    />
                    <Bar dataKey="in" name="In" fill="hsl(var(--primary))" opacity={0.55} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="ut" name="Ut" fill="hsl(var(--destructive))" opacity={0.55} radius={[0, 0, 2, 2]} />
                    <Area
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo"
                      stroke="none"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.08}
                    />
                    <Line
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div className="max-h-48 overflow-y-auto rounded-md border border-border/60">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/60">
                    <tr>
                      <th className="px-2 py-1 text-left font-semibold">Datum</th>
                      <th className="px-2 py-1 text-right font-semibold">In</th>
                      <th className="px-2 py-1 text-right font-semibold">Ut</th>
                      <th className="px-2 py-1 text-right font-semibold">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...points].reverse().map((r) => (
                      <tr key={r.key} className="border-t border-border/40">
                        <td className="px-2 py-1">{r.label}</td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums text-emerald-500">
                          {r.in ? `+${nf(r.in)}` : "–"}
                        </td>
                        <td className="px-2 py-1 text-right font-mono tabular-nums text-destructive">
                          {r.ut ? nf(r.ut) : "–"}
                        </td>
                        <td className="px-2 py-1 text-right font-mono font-semibold tabular-nums">
                          {nf(r.saldo)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Rörelsetypens namn används i framtida detaljvy. */
export { movementLabel };
