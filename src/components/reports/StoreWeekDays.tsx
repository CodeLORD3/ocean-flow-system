import { Loader2 } from "lucide-react";
import { useDailyReportsRange } from "@/hooks/useDailyReportsRange";
import { weekDayList, dayRowsFrom } from "@/lib/weeklyReportDays";
import { useStoreWeather } from "@/hooks/useStoreWeather";
import { WeatherCell } from "./WeatherCell";
import { useStores } from "@/hooks/useStores";
import { currencyLabel } from "@/lib/reportCurrency";
import { useWebSales, webKey, webTotal } from "@/hooks/useWebSales";

const int = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};
const intFmt = (v: unknown) => { const n = num(v); return n == null ? "—" : int.format(n); };
const decFmt = (v: unknown) => { const n = num(v); return n == null ? "—" : dec.format(n); };

/** Dag-för-dag-tabell för en butik under en vecka. */
export function StoreWeekDays({
  storeId,
  weekStart,
  weekEnd,
}: {
  storeId: string;
  weekStart: string;
  weekEnd: string;
}) {
  const { data, isLoading, error } = useDailyReportsRange(storeId, weekStart, weekEnd);
  const weather = useStoreWeather(storeId, weekStart, weekEnd);
  /* Schweiziska butiker visar CHF, svenska kr. */
  const { data: stores = [] } = useStores();
  const cur = currencyLabel(stores.find((s) => s.id === storeId)?.currency);
  /* Nätförsäljning på leveransdagen, vid sidan av kassan. */
  const web = useWebSales(weekStart, weekEnd, storeId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Läser dagsrapporter…
      </div>
    );
  }
  if (error) {
    return <p className="px-3 py-3 text-xs text-destructive">Kunde inte läsa dagsrapporterna.</p>;
  }

  const days = weekDayList(weekStart, weekEnd);
  const rows = dayRowsFrom(days, data ?? []);
  const webWeek = webTotal(web.data, storeId, days);

  const webNoReport = rows.reduce(
    (acc, d) => {
      const w = web.data?.get(webKey(storeId, d.date));
      return w && d.net_sales == null
        ? { net: acc.net + w.net, orders: acc.orders + w.orders }
        : acc;
    },
    { net: 0, orders: 0 },
  );

  return (
    <div className="mt-2 overflow-x-auto rounded-md border bg-background">
      <table className="w-full min-w-[720px] text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Dag</th>
            <th className="px-2 py-1.5 text-right font-medium">Brutto ({cur})</th>
            <th className="px-2 py-1.5 text-right font-medium">Nettoomsättning ({cur})</th>
            <th className="px-2 py-1.5 text-right font-medium">Varav webbshop ({cur})</th>
            <th className="w-[11rem] px-2 py-1.5 text-left font-medium">Väder</th>
            <th className="px-2 py-1.5 text-right font-medium">Antal köp</th>
            <th className="px-2 py-1.5 text-right font-medium">Timmar</th>
            <th className="px-2 py-1.5 text-right font-medium">Pass</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((d) => {
            const w = web.data?.get(webKey(storeId, d.date));
            /* Webben är förbetald och ingår därför i dagens netto. */
            const net = num(d.net_sales) == null && !w ? null : (num(d.net_sales) ?? 0) + (w?.net ?? 0);
            const gross = num(d.gross_sales) == null && !w ? null : (num(d.gross_sales) ?? 0) + (w?.gross ?? 0);
            return (
            <tr key={d.date} className={d.net_sales == null ? "text-muted-foreground" : ""}>
              <td className="px-2 py-1.5">
                <span className="font-medium">{d.weekday}</span>{" "}
                <span className="text-muted-foreground">{String(d.date ?? "").slice(5)}</span>
                {d.net_sales == null && w ? (
                  <span className="ml-1 text-[10px] text-muted-foreground">(bara webbshop)</span>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {gross == null ? "—" : `${intFmt(gross)} ${cur}`}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {net == null ? "—" : `${intFmt(net)} ${cur}`}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums text-primary">
                {w ? (
                  <span title={`${w.orders} webbordrar`}>{intFmt(w.net)} {cur}</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="w-[11rem] px-2 py-1.5">
                <WeatherCell day={weather.data?.get(d.date)} loading={weather.isLoading} />
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {/* Antal köp = kassans kvitton + förbetalda webbordrar samma dag. */}
                {num(d.receipt_count) == null && !w
                  ? "—"
                  : intFmt((num(d.receipt_count) ?? 0) + (w?.orders ?? 0))}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{decFmt(d.staff_hours)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{intFmt(d.staff_shifts)}</td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {webWeek.orders > 0 && (
        <p className="px-2 py-2 text-[10px] text-muted-foreground">
          Varav webbshop denna vecka: <span className="font-mono tabular-nums">{intFmt(webWeek.net)} {cur}</span> på{" "}
          {webWeek.orders} ordrar (netto, bokförda på leveransdagen och inräknade i totalen).
          {webNoReport.orders > 0 && (
            <> Av dessa {intFmt(webNoReport.net)} {cur} på dagar utan dagsrapport.</>
          )}
        </p>
      )}
      {rows.every((d) => d.gross_sales == null) && (
        <p className="px-2 py-2 text-[10px] text-muted-foreground">Inga dagsrapporter sparade för veckan.</p>
      )}
    </div>
  );
}
