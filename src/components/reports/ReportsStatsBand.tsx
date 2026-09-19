import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStores } from "@/hooks/useStores";
import { StatTile, StatTiles } from "@/components/reports/StatTile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Banknote, Receipt, Users, Trash2, TrendingUp, Store as StoreIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { currencyLabel } from "@/lib/reportCurrency";
import { useFxRates } from "@/hooks/useFxRates";
import { rateFor, type FxRateMap } from "@/lib/fxRates";
import { useWebSales } from "@/hooks/useWebSales";
import type { DailyReport, StaffEntry, WasteItem } from "@/hooks/useDailyReport";

const nf = (v: number) => v.toLocaleString("sv-SE", { maximumFractionDigits: 0 }).replace(/\u00a0/g, " ");
const nf1 = (v: number) => v.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function hoursOf(entries: StaffEntry[] | null | undefined) {
  return (entries ?? []).reduce((sum, e: any) => {
    const [sh, sm] = String(e.start_time ?? "").split(":").map(Number);
    const [eh, em] = String(e.end_time ?? "").split(":").map(Number);
    if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return sum;
    const diff = eh * 60 + em - (sh * 60 + sm);
    return diff > 0 ? sum + diff / 60 : sum;
  }, 0);
}

function wasteOf(items: WasteItem[] | null | undefined) {
  return (items ?? []).reduce((s, i) => s + (i.value_sek ?? 0), 0);
}

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const RANGES = [
  { days: 7, label: "7 dagar" },
  { days: 30, label: "30 dagar" },
  { days: 90, label: "90 dagar" },
];

/** Färglagt nyckeltalsband över rapportsidorna — bygger på sparade dagsrapporter. */
export function ReportsStatsBand({ storeId }: { storeId?: string | null }) {
  const [days, setDays] = useState(30);
  const from = isoDaysAgo(days * 2);
  const { data: stores = [] } = useStores();
  const { data: fx = new Map() as FxRateMap } = useFxRates(from);
  /* Nätförsäljningen (fiskskaldjur.se/.ch) på leveransdagen, per butik. */
  const { data: web } = useWebSales(from, isoDaysAgo(0), storeId ?? null);

  /* Valutan följer butiken; utan valt butik visas kr som gemensam etikett. */
  const curOf = (id: string) => currencyLabel(stores.find((s) => s.id === id)?.currency);
  const rawCurOf = (id: string) => (stores.find((s) => s.id === id)?.currency || "SEK").toUpperCase();
  const bandCur = storeId ? curOf(storeId) : "kr";

  const { data: rows = [] } = useQuery({
    queryKey: ["reports-stats-band", from, storeId ?? "all"],
    queryFn: async () => {
      let q = (supabase as any)
        .from("daily_reports")
        .select("store_id, report_date, net_sales, receipt_count, staff_entries, waste_items, currency")
        .gte("report_date", from)
        .order("report_date", { ascending: true });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });

  const stats = useMemo(() => {
    const cut = isoDaysAgo(days);
    const current = rows.filter((r) => r.report_date >= cut);
    const previous = rows.filter((r) => r.report_date < cut);

    /* Utan vald butik summeras flera valutor ihop — då räknas varje dag om till
       SEK med den dagens kurs, annars visas butikens egen valuta som den är. */
    const convert = (r: DailyReport, value: number) => {
      if (storeId) return value;
      const cur = (r.currency || rawCurOf(r.store_id) || "SEK").toUpperCase();
      if (cur === "SEK") return value;
      const rate = rateFor(fx, cur, r.report_date);
      return rate == null ? value : value * rate;
    };

    const sum = (list: DailyReport[]) => ({
      net: list.reduce((s, r) => s + convert(r, r.net_sales ?? 0), 0),
      receipts: list.reduce((s, r) => s + (r.receipt_count ?? 0), 0),
      hours: list.reduce((s, r) => s + hoursOf(r.staff_entries), 0),
      waste: list.reduce((s, r) => s + convert(r, wasteOf(r.waste_items)), 0),
      count: list.length,
    });

    const now = sum(current);
    const before = sum(previous);
    const trend = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

    const byDay = new Map<string, number>();
    current.forEach((r) => byDay.set(r.report_date, (byDay.get(r.report_date) ?? 0) + convert(r, r.net_sales ?? 0)));
    const spark = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v);

    const byStore = new Map<string, { net: number; waste: number; receipts: number; reports: number; netSek: number | null }>();
    current.forEach((r) => {
      const e = byStore.get(r.store_id) ?? { net: 0, waste: 0, receipts: 0, reports: 0, netSek: 0 as number | null };
      const cur = (r.currency || rawCurOf(r.store_id) || "SEK").toUpperCase();
      const rate = cur === "SEK" ? 1 : rateFor(fx, cur, r.report_date);
      e.net += r.net_sales ?? 0;
      e.waste += wasteOf(r.waste_items);
      e.receipts += r.receipt_count ?? 0;
      e.reports += 1;
      e.netSek = e.netSek == null || rate == null ? null : e.netSek + (r.net_sales ?? 0) * rate;
      byStore.set(r.store_id, e);
    });
    /* Webbförsäljning per butik i perioden — egen siffra, aldrig inräknad i kassans netto. */
    const webByStore = new Map<string, { amount: number; sek: number | null; orders: number }>();
    (web ?? new Map()).forEach((row: { amount: number; orders: number }, key: string) => {
      const [sid, date] = key.split("|");
      if (!sid || !date || date < cut) return;
      const cur = rawCurOf(sid);
      const rate = cur === "SEK" ? 1 : rateFor(fx, cur, date);
      const e = webByStore.get(sid) ?? { amount: 0, sek: 0 as number | null, orders: 0 };
      e.amount += row.amount;
      e.orders += row.orders;
      e.sek = e.sek == null || rate == null ? null : e.sek + row.amount * rate;
      webByStore.set(sid, e);
    });

    const ranked = [...byStore.entries()]
      .map(([id, v]) => ({
        id,
        name: stores.find((s: any) => s.id === id)?.name ?? "Okänd butik",
        ...v,
        web: webByStore.get(id) ?? null,
      }))
      .sort((a, b) => (b.netSek ?? b.net) - (a.netSek ?? a.net));

    const webTotalSek = [...webByStore.values()].reduce((s, v) => s + (v.sek ?? v.amount), 0);
    const webOrders = [...webByStore.values()].reduce((s, v) => s + v.orders, 0);


    return {
      now,
      trends: {
        net: trend(now.net, before.net),
        receipts: trend(now.receipts, before.receipts),
        hours: trend(now.hours, before.hours),
        waste: trend(now.waste, before.waste),
      },
      spark,
      ranked,
      perReceipt: now.receipts > 0 ? now.net / now.receipts : 0,
      perHour: now.hours > 0 ? now.net / now.hours : 0,
      wasteShare: now.net > 0 ? (now.waste / now.net) * 100 : 0,
    };
  }, [rows, days, stores, fx, storeId]);

  const maxNet = Math.max(...stats.ranked.map((r) => r.netSek ?? r.net), 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-primary">
          <TrendingUp className="h-4 w-4" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Nyckeltal · {stats.now.count} rapporter</span>
        </div>
        <div className="flex gap-1 rounded-md border bg-card p-0.5">
          {RANGES.map((r) => (
            <Button
              key={r.days}
              size="sm"
              variant={days === r.days ? "default" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setDays(r.days)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      <StatTiles>
        <StatTile
          label="Nettoomsättning"
          value={nf(stats.now.net)}
          unit={bandCur}
          icon={Banknote}
          tone="navy"
          trend={stats.trends.net}
          hint={`${nf(stats.perReceipt)} ${bandCur} per kvitto`}
          spark={stats.spark}
        />
        <StatTile
          label="Kvitton"
          value={nf(stats.now.receipts)}
          icon={Receipt}
          tone="spruce"
          trend={stats.trends.receipts}
          hint={`${nf1(stats.now.count > 0 ? stats.now.receipts / stats.now.count : 0)} per dag`}
        />
        <StatTile
          label="Bemanning"
          value={nf1(stats.now.hours)}
          unit="h"
          icon={Users}
          tone="amber"
          trend={stats.trends.hours}
          hint={`${nf(stats.perHour)} ${bandCur} per timme`}
        />
        <StatTile
          label="Svinn"
          value={nf(stats.now.waste)}
          unit={bandCur}
          icon={Trash2}
          tone="brick"
          trend={stats.trends.waste}
          hint={`${nf1(stats.wasteShare)} % av omsättningen`}
        />
      </StatTiles>

      {stats.ranked.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2">
            <StoreIcon className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">Butiker i perioden</p>
          </div>
          <div className="space-y-2">
            {stats.ranked.map((r, i) => (
              <div key={r.id} className="grid grid-cols-[minmax(0,1fr)_120px] items-center gap-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-medium">
                      {i + 1}. {r.name}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {r.reports} rapporter · {nf(r.receipts)} kvitton
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", i === 0 ? "bg-primary" : "bg-primary/60")}
                      style={{ width: `${Math.max(3, ((r.netSek ?? r.net) / maxNet) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-semibold tabular-nums">{nf(r.net)} {curOf(r.id)}</p>
                  {curOf(r.id) !== "kr" && (
                    <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {r.netSek == null ? "kurs saknas" : `≈ ${nf(r.netSek)} kr`}
                    </p>
                  )}
                  <p className="font-mono text-[10px] tabular-nums text-destructive">svinn {nf(r.waste)} {curOf(r.id)}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
