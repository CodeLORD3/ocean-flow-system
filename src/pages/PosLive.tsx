import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Radio,
  Receipt,
  ShoppingBag,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStores } from "@/hooks/useStores";
import {
  posDateIso,
  usePosLiveSummary,
  usePosRealtime,
  usePosRecentTransactions,
  useNimposEvents,
} from "@/hooks/usePosLive";
import { PosStoreCard } from "@/components/poslive/PosStoreCard";
import { PosHourChart } from "@/components/poslive/PosHourChart";
import { PosReceiptList } from "@/components/poslive/PosReceiptList";
import { NimposProductMapping, NimposStoreMapping } from "@/components/poslive/NimposMappingPanel";
import { SumupHealthCard } from "@/components/poslive/SumupHealthCard";
import { SumupProductMapping } from "@/components/poslive/SumupProductMapping";
import { SumupLineReview } from "@/components/poslive/SumupLineReview";
import { SumupCatalogPanel } from "@/components/poslive/SumupCatalogPanel";
import { PosHealthCard } from "@/components/poslive/PosHealthCard";
import { PosLineReview } from "@/components/poslive/PosLineReview";
import { PosPricePanel } from "@/components/poslive/PosPricePanel";


const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/\u00a0/g, " ");

function shiftDay(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return posDateIso(dt);
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: any;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="shadow-card">
      <CardContent className="p-3">
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" /> {label}
        </p>
        <p className="font-mono tabular-nums text-xl text-foreground mt-0.5">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/**
 * Kassa live — försäljning per butik i realtid från egna och externa kassor
 * (Nimpos). Alla siffror kommer från pos_live_summary så livevyn och
 * stängningsrapporten aldrig kan visa olika tal.
 */
export default function PosLive() {
  const [date, setDate] = useState(() => posDateIso());
  const [storeId, setStoreId] = useState<string | null>(null);
  const isToday = date === posDateIso();

  usePosRealtime(isToday);
  const { data: summary, isLoading } = usePosLiveSummary(date);
  const { data: stores = [] } = useStores(true);
  const { data: receipts = [] } = usePosRecentTransactions(date, storeId);
  const { data: problems = [] } = useNimposEvents("problem");

  const storeName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? "—";
  const currencyOf = (id: string) =>
    ((stores.find((s) => s.id === id) as any)?.currency ?? "SEK").toUpperCase();

  /**
   * Valutor blandas aldrig: totalerna räknas per valuta. Utan vald butik visas
   * hemvalutan (SEK) och butiker i annan valuta (Zollikon, CHF) får en egen rad.
   */
  const sums = useMemo(() => {
    const rows = (summary?.stores ?? []).filter((s) => !storeId || s.store_id === storeId);
    const byCurrency = new Map<string, typeof rows>();
    for (const r of rows) {
      const cur = currencyOf(r.store_id);
      byCurrency.set(cur, [...(byCurrency.get(cur) ?? []), r]);
    }
    const total = (list: typeof rows) => {
      const gross = list.reduce((s, r) => s + r.summary.gross_sales, 0);
      const net = list.reduce((s, r) => s + r.summary.net_sales, 0);
      const count = list.reduce((s, r) => s + r.summary.receipt_count, 0);
      const returns = list.reduce((s, r) => s + r.summary.return_count, 0);
      const largest = Math.max(0, ...list.map((r) => r.summary.largest_sale));
      return { gross, net, count, returns, largest, avg: count ? gross / count : 0 };
    };
    return [...byCurrency.entries()]
      .sort(([a], [b]) => (a === "SEK" ? -1 : b === "SEK" ? 1 : a.localeCompare(b)))
      .map(([currency, list]) => ({ currency, ...total(list) }));
  }, [summary, storeId, stores]);

  const totals = sums[0] ?? {
    currency: "SEK",
    gross: 0,
    net: 0,
    count: 0,
    returns: 0,
    largest: 0,
    avg: 0,
  };

  const ops = summary?.ops;
  const opsIssues = (ops?.failed ?? 0) + (ops?.unmapped ?? 0) + (ops?.unmatched_products ?? 0);

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Hem › Rapporter › Kassa live</p>
          <h1 className="font-heading text-xl md:text-2xl text-foreground flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            Kassa live
          </h1>
          <p className="text-sm text-muted-foreground">
            Försäljning per butik i realtid — samma siffror som stängningsrapporten hämtar.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setDate(shiftDay(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-mono tabular-nums text-sm px-2">{date}</span>
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={isToday}
            onClick={() => setDate(shiftDay(date, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isToday && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setDate(posDateIso())}>
              Idag
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="live">
        <TabsList>
          <TabsTrigger value="live">Live</TabsTrigger>
          <TabsTrigger value="receipts">Kvitton</TabsTrigger>
          <TabsTrigger value="mapping">
            Mappning
            {opsIssues > 0 && (
              <Badge variant="outline" className="ml-1 text-[10px] text-warning border-warning/40">
                {opsIssues}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="prices">Priser</TabsTrigger>
          <TabsTrigger value="ops">Drift</TabsTrigger>

        </TabsList>

        <TabsContent value="live" className="space-y-4 mt-4">
          {(sums.length ? sums : [totals]).map((t) => {
            const cur = t.currency === "SEK" ? "kr" : t.currency;
            return (
              <div key={t.currency} className="space-y-1">
                {sums.length > 1 && (
                  <p className="text-[11px] text-muted-foreground">Totalt i {t.currency}</p>
                )}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Kpi icon={TrendingUp} label="Brutto" value={`${kr(t.gross)} ${cur}`} />
                  <Kpi icon={CreditCard} label="Netto (ex moms)" value={`${kr(t.net)} ${cur}`} />
                  <Kpi
                    icon={ShoppingBag}
                    label="Antal köp"
                    value={String(t.count)}
                    hint={`${t.returns} returer`}
                  />
                  <Kpi icon={Receipt} label="Snittköp" value={`${kr(t.avg)} ${cur}`} />
                  <Kpi icon={Activity} label="Största köp" value={`${kr(t.largest)} ${cur}`} />
                </div>
              </div>
            );
          })}

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Försäljning per timme</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <PosHourChart
                  hours={summary?.hours ?? []}
                  currentHour={isToday ? new Date().getHours() : null}
                />
              )}
            </CardContent>
          </Card>

          {storeId && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setStoreId(null)}>
              Visa alla butiker
            </Button>
          )}

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-40 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(summary?.stores ?? []).map((s) => (
                <PosStoreCard
                  key={s.store_id}
                  name={s.name}
                  summary={s.summary}
                  currency={currencyOf(s.store_id)}
                  isToday={isToday}
                  selected={storeId === s.store_id}
                  onSelect={() => setStoreId(storeId === s.store_id ? null : s.store_id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="receipts" className="mt-4">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">
                Senaste kvitton{storeId ? ` — ${storeName(storeId)}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PosReceiptList rows={receipts} storeName={storeName} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping" className="space-y-4 mt-4">
          <PosLineReview />
          <NimposStoreMapping />
          <NimposProductMapping />
          <SumupProductMapping />
          <SumupLineReview />
        </TabsContent>

        <TabsContent value="prices" className="mt-4">
          <PosPricePanel />
          <SumupCatalogPanel />
        </TabsContent>



        <TabsContent value="ops" className="space-y-4 mt-4">
          <PosHealthCard />
          <SumupHealthCard />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Kpi icon={AlertTriangle} label="Misslyckade" value={String(ops?.failed ?? 0)} />
            <Kpi icon={AlertTriangle} label="Okänd kassa" value={String(ops?.unmapped ?? 0)} />
            <Kpi icon={Activity} label="Väntande" value={String(ops?.pending ?? 0)} />
            <Kpi icon={AlertTriangle} label="Omatchade artiklar" value={String(ops?.unmatched_products ?? 0)} />
          </div>

          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Händelser som behöver åtgärd</CardTitle>
            </CardHeader>
            <CardContent>
              {problems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  Inga fel — alla kassahändelser har bokförts.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {problems.map((e) => (
                    <div key={e.id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                      <span className="font-mono tabular-nums text-muted-foreground w-32">
                        {new Date(e.received_at).toLocaleString("sv-SE", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {e.status}
                      </Badge>
                      <span className="text-foreground">{e.event_type}</span>
                      {e.store_code && (
                        <span className="font-mono text-muted-foreground">kassa {e.store_code}</span>
                      )}
                      <span className="flex-1 min-w-[8rem] truncate text-destructive">
                        {e.last_error || ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
