import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

/**
 * Lagret ett valt datum.
 *
 * Saldot räknas fram ur stock_movements — alla rörelser till och med det valda
 * datumets slut (svensk tid) summeras per produkt. stock_movements är enda
 * sanningen om lagret, så vyn visar exakt vad som stod i lagret den dagen.
 */

const TZ = "Europe/Stockholm";

const dateInStockholm = (d: Date) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);

export const yesterdayStockholm = () =>
  dateInStockholm(new Date(Date.now() - 24 * 60 * 60 * 1000));

const fmtKg = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface Props {
  /** Begränsar vyn till en butiks lagerplatser. Utan värde visas allt lager. */
  storeId?: string | null;
  storeName?: string | null;
}

export function StockAsOfDate({ storeId, storeName }: Props) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(yesterdayStockholm());

  const locationsQuery = useQuery({
    queryKey: ["stock-asof-locations", storeId ?? "all"],
    enabled: open,
    queryFn: async () => {
      let q = supabase.from("storage_locations").select("id, name, store_id");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const locationIds = (locationsQuery.data ?? []).map((l: any) => l.id as string);

  const movementsQuery = useQuery({
    queryKey: ["stock-asof-movements", date, storeId ?? "all", locationIds.length],
    enabled: open && (!storeId || locationIds.length > 0),
    queryFn: async () => {
      // Slutet av det valda dygnet i svensk tid: nästa dags start.
      const until = new Date(`${date}T00:00:00`);
      until.setDate(until.getDate() + 1);
      let q = supabase
        .from("stock_movements")
        .select("product_id, location_id, quantity_kg, created_at")
        .lt("created_at", until.toISOString())
        .limit(20000);
      if (storeId && locationIds.length) q = q.in("location_id", locationIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const productIds = useMemo(
    () =>
      Array.from(
        new Set(
          (movementsQuery.data ?? [])
            .map((m: any) => m.product_id as string | null)
            .filter(Boolean) as string[],
        ),
      ),
    [movementsQuery.data],
  );

  const productsQuery = useQuery({
    queryKey: ["stock-asof-products", productIds.length, date, storeId ?? "all"],
    enabled: open && productIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, unit, category")
        .in("id", productIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const byProduct = new Map<string, number>();
    (movementsQuery.data ?? []).forEach((m: any) => {
      const pid = m.product_id as string | null;
      if (!pid) return;
      byProduct.set(pid, (byProduct.get(pid) || 0) + Number(m.quantity_kg || 0));
    });
    const nameById = new Map(
      (productsQuery.data ?? []).map((p: any) => [
        p.id as string,
        { name: p.name as string, unit: (p.unit as string) || "kg", category: (p.category as string) || "Övrigt" },
      ]),
    );
    return Array.from(byProduct.entries())
      .map(([id, qty]) => ({
        id,
        qty: Math.round(qty * 1000) / 1000,
        ...(nameById.get(id) ?? { name: "Okänd produkt", unit: "kg", category: "Övrigt" }),
      }))
      .filter((r) => Math.abs(r.qty) > 0.0005)
      .sort((a, b) => a.category.localeCompare(b.category, "sv") || a.name.localeCompare(b.name, "sv"));
  }, [movementsQuery.data, productsQuery.data]);

  const totalKg = rows.reduce((s, r) => s + r.qty, 0);
  const loading = movementsQuery.isLoading || productsQuery.isLoading || locationsQuery.isLoading;
  const isYesterday = date === yesterdayStockholm();

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 border-b bg-muted/50 px-2 py-1.5 text-left hover:bg-muted"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <CalendarClock className="h-3 w-3" />
          Lagret ett valt datum
        </span>
        <span className="text-[10px] text-muted-foreground">
          {isYesterday ? "Gårdagens lager" : date}
        </span>
      </button>

      {open && (
        <CardContent className="space-y-2 p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={date}
              max={dateInStockholm(new Date())}
              onChange={(e) => setDate(e.target.value)}
              className="h-8 w-[150px] text-xs"
            />
            <button
              type="button"
              onClick={() => setDate(yesterdayStockholm())}
              className="h-8 rounded-md border px-2 text-[11px] font-medium hover:bg-muted"
            >
              Igår
            </button>
            <Badge variant="secondary" className="font-mono tabular-nums text-[10px]">
              {rows.length} produkter · {fmtKg(totalKg)} kg
            </Badge>
            {storeName ? (
              <span className="text-[10px] text-muted-foreground">{storeName}</span>
            ) : (
              <span className="text-[10px] text-muted-foreground">Allt lager</span>
            )}
          </div>

          <p className="text-[10px] text-muted-foreground">
            Saldot är summan av alla lagerrörelser till och med {date} kl 23:59 (svensk tid).
          </p>

          {loading ? (
            <div className="flex items-center gap-2 px-1 py-3 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Räknar fram lagret …
            </div>
          ) : rows.length === 0 ? (
            <p className="px-1 py-3 text-[11px] text-muted-foreground">
              Inget lager fanns bokfört {date}.
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 px-2 py-1">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium">{r.name}</p>
                    <p className="text-[10px] text-muted-foreground">{r.category}</p>
                  </div>
                  <span className="shrink-0 font-mono text-[12px] tabular-nums">
                    {fmtKg(r.qty)} {r.unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
