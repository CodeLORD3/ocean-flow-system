import { Loader2 } from "lucide-react";
import { useDailyReportsRange, entryHours } from "@/hooks/useDailyReportsRange";
import { weekDayList, dayRowsFrom } from "@/lib/weeklyReportDays";

const int = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

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

  const rows = dayRowsFrom(weekDayList(weekStart, weekEnd), data ?? []);

  return (
    <div className="mt-2 overflow-x-auto rounded-md border bg-background">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-2 py-1.5 text-left font-medium">Dag</th>
            <th className="px-2 py-1.5 text-right font-medium">Brutto</th>
            <th className="px-2 py-1.5 text-right font-medium">Netto</th>
            <th className="px-2 py-1.5 text-right font-medium">Kvitton</th>
            <th className="px-2 py-1.5 text-right font-medium">Timmar</th>
            <th className="px-2 py-1.5 text-right font-medium">Pass</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((d) => (
            <tr key={d.date} className={d.gross_sales == null ? "text-muted-foreground" : ""}>
              <td className="px-2 py-1.5">
                <span className="font-medium">{d.weekday}</span>{" "}
                <span className="text-muted-foreground">{d.date.slice(5)}</span>
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {d.gross_sales == null ? "—" : `${int.format(d.gross_sales)} kr`}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {d.net_sales == null ? "—" : `${int.format(d.net_sales)} kr`}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                {d.receipt_count == null ? "—" : int.format(d.receipt_count)}
              </td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{dec.format(d.staff_hours)}</td>
              <td className="px-2 py-1.5 text-right font-mono tabular-nums">{int.format(d.staff_shifts)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.every((d) => d.gross_sales == null) && (
        <p className="px-2 py-2 text-[10px] text-muted-foreground">
          Inga dagsrapporter sparade för veckan. {entryHours(null) === 0 ? "" : ""}
        </p>
      )}
    </div>
  );
}
