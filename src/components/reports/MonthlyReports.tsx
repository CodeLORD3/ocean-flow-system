import { useMemo, useState } from "react";
import { useStores } from "@/hooks/useStores";
import { useMonthlyRegionReports, useMonthlyStoreReports, type MonthlyRegionReport, type MonthlyStoreReport } from "@/hooks/useMonthlyReports";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { weeklyReportPdf, weeklyReportXlsx, type ReportRow } from "@/lib/weeklyReportExport";
import { StoreWeekDays } from "@/components/reports/StoreWeekDays";
import { useDailyReportsRange } from "@/hooks/useDailyReportsRange";
import { dayRowsFrom, weekDayList } from "@/lib/weeklyReportDays";
import { useStoreWeather, weatherLabel } from "@/hooks/useStoreWeather";
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, PencilLine, Printer, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

const int = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};
const money = (value: unknown) => { const n = num(value); return n == null ? "—" : `${int.format(n)} kr`; };
const intFmt = (v: unknown) => { const n = num(v); return n == null ? "—" : int.format(n); };
const decFmt = (v: unknown) => { const n = num(v); return n == null ? "—" : dec.format(n); };
const REGION_LABELS: Record<string, string> = { vast: "Göteborg", stockholm: "Stockholm", schweiz: "Schweiz", SE_TOTAL: "Sverige totalt" };

function monthLabel(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("sv-SE", { month: "long", year: "numeric" });
}

function StatusBadge({ status, corrected }: { status: string; corrected?: boolean }) {
  if (corrected) return <Badge variant="outline" className="gap-1 border-warning/40 text-[10px] text-warning"><AlertTriangle className="h-3 w-3" /> Korrigerad</Badge>;
  const done = status === "klar";
  return <Badge variant="outline" className={cn("text-[10px]", done ? "border-success/40 text-success" : "border-warning/40 text-warning")}>{done ? "Klar" : "Preliminär"}</Badge>;
}

function Metrics({ row }: { row: MonthlyStoreReport | MonthlyRegionReport }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
      <div><p className="text-[10px] text-muted-foreground">Nettoomsättning</p><p className="font-mono text-sm tabular-nums">{money(row.total_sales_sek)}</p></div>
      <div><p className="text-[10px] text-muted-foreground">Netto snitt/dag</p><p className="font-mono text-sm tabular-nums">{money(row.avg_sales_per_day_sek)}</p></div>
      <div><p className="text-[10px] text-muted-foreground">Timmar</p><p className="font-mono text-sm tabular-nums">{decFmt(row.staff_hours)} h</p></div>
      <div><p className="text-[10px] text-muted-foreground">Personpass</p><p className="font-mono text-sm tabular-nums">{intFmt(row.staff_shifts)}</p></div>
      <div><p className="text-[10px] text-muted-foreground">Dagsrapporter</p><p className="font-mono text-sm tabular-nums">{intFmt(row.daily_reports_count)} / {intFmt(row.expected_open_days)}</p></div>
    </div>
  );
}

export function MonthlyReportsSection() {
  const { data: stores = [] } = useStores(true);
  const storeReports = useMonthlyStoreReports();
  const regionReports = useMonthlyRegionReports();
  const [filter, setFilter] = useState("all");
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  const regions = regionReports.data ?? [];
  const details = storeReports.data ?? [];
  const months = useMemo(() => {
    const map = new Map<string, { year: number; month: number; month_start: string; month_end: string }>();
    [...regions, ...details].forEach((row) => map.set(`${row.year}-${row.month}`, { year: row.year, month: row.month, month_start: row.month_start, month_end: row.month_end }));
    return [...map.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => String(b.month_start ?? "").localeCompare(String(a.month_start ?? "")));
  }, [regions, details]);
  const storeName = (id: string) => stores.find((store) => store.id === id)?.name ?? "Butik";
  const groupFilter = filter !== "all" && filter in REGION_LABELS ? filter : null;
  const storeFilter = filter !== "all" && !groupFilter ? filter : null;
  const scopeStoreIds = useMemo(() => {
    if (storeFilter) return new Set([storeFilter]);
    if (groupFilter === "SE_TOTAL") return new Set(stores.filter((store) => store.region === "vast" || store.region === "stockholm").map((store) => store.id));
    if (groupFilter) return new Set(stores.filter((store) => store.region === groupFilter).map((store) => store.id));
    return new Set(stores.filter((store) => store.region).map((store) => store.id));
  }, [stores, groupFilter, storeFilter]);
  const latest = months[0];
  const dailyExport = useDailyReportsRange(
    storeFilter,
    latest?.month_start,
    latest?.month_end,
  );
  const exportWeather = useStoreWeather(storeFilter, latest?.month_start, latest?.month_end);
  const latestRegion = latest ? regions.find((row) => row.group_key === (groupFilter ?? (filter === "all" ? "SE_TOTAL" : "")) && row.year === latest.year && row.month === latest.month) : undefined;
  const latestStore = latest && storeFilter ? details.find((row) => row.store_id === storeFilter && row.year === latest.year && row.month === latest.month) : undefined;
  const summary = latestStore ?? latestRegion;
  const summaryLabel = storeFilter ? storeName(storeFilter) : groupFilter ? REGION_LABELS[groupFilter] ?? "Region" : filter === "SE_TOTAL" ? "Sverige totalt" : "Alla butiker";

  const exportRows: ReportRow[] = useMemo(() => {
    if (!latest) return [];
    const regionRows = storeFilter
      ? []
      : regions.filter((row) => row.year === latest.year && row.month === latest.month && row.group_key === (groupFilter ?? "SE_TOTAL"));
    const storeRows = details.filter((row) => row.year === latest.year && row.month === latest.month && scopeStoreIds.has(row.store_id));
    return [...regionRows, ...storeRows].map((row) => ({
      label: "store_id" in row ? storeName(row.store_id) : row.group_label,
      total_sales_sek: row.total_sales_sek,
      avg_sales_per_day_sek: row.avg_sales_per_day_sek,
      staff_hours: row.staff_hours,
      staff_shifts: row.staff_shifts,
      reports: `${row.daily_reports_count} / ${row.expected_open_days}`,
      status: row.status,
    }));
  }, [latest, regions, details, scopeStoreIds, groupFilter, storeFilter, stores]);

  const exportReport = (format: "pdf" | "xlsx") => {
    if (!latest) return;
    const payload = {
      title: `${summaryLabel} · ${monthLabel(latest.month_start)}`,
      subtitle: `${latest.month_start} – ${latest.month_end}`,
      rows: exportRows,
      ...(storeFilter && latest
        ? {
            days: [{
              storeLabel: summaryLabel,
              rows: dayRowsFrom(
                weekDayList(latest.month_start, latest.month_end),
                dailyExport.data ?? [],
              ).map((row) => ({ ...row, weather: weatherLabel(exportWeather.data?.get(row.date)) })),
            }],
          }
        : {}),
    };
    if (format === "pdf") weeklyReportPdf(payload);
    else weeklyReportXlsx(payload);
  };

  if (storeReports.isLoading || regionReports.isLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (storeReports.error || regionReports.error) return <p className="py-6 text-center text-sm text-destructive">Kunde inte läsa månadsrapporterna.</p>;
  if (months.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Inga månadsrapporter ännu.</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Sammanställs automatiskt från sparade dagsrapporter</p>
        <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => exportReport("pdf")}><Printer className="h-3.5 w-3.5" /> Skriv ut</Button>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => exportReport("xlsx")}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</Button>
        <Select value={filter} onValueChange={setFilter}><SelectTrigger className="h-8 w-full text-xs sm:w-[240px]"><SelectValue placeholder="Alla butiker och regioner" /></SelectTrigger><SelectContent>
          <SelectItem value="all">Alla butiker och regioner</SelectItem><SelectItem value="SE_TOTAL">Sverige totalt</SelectItem><SelectItem value="vast">Göteborg</SelectItem><SelectItem value="stockholm">Stockholm</SelectItem><SelectItem value="schweiz">Schweiz</SelectItem>
          {stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
        </SelectContent></Select>
        </div>
      </div>

      {summary && latest && <div className="border-b pb-4"><div className="mb-3 flex flex-wrap items-end justify-between gap-2"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Senaste månaden</p><p className="mt-1 text-sm font-semibold">{summaryLabel}</p><p className="text-xs capitalize text-muted-foreground">{monthLabel(latest.month_start)}</p></div><StatusBadge status={summary.status} corrected={summary.corrected} /></div><Metrics row={summary} /></div>}

      <div className="divide-y rounded-md border">{months.map((month) => {
        const monthRegions = regions.filter((row) => row.year === month.year && row.month === month.month &&
          (filter === "all" ? row.group_key === "SE_TOTAL" : Boolean(groupFilter) && row.group_key === groupFilter));
        const monthStores = details.filter((row) => row.year === month.year && row.month === month.month &&
          scopeStoreIds.has(row.store_id));
        if (!monthRegions.length && !monthStores.length) return null;
        const headline = monthRegions.find((row) => row.group_key === (groupFilter ?? "SE_TOTAL")) ?? monthRegions[0];
        const total = headline?.total_sales_sek ?? monthStores.reduce((sum, row) => sum + (num(row.total_sales_sek) ?? 0), 0);
        const status = headline?.status ?? (monthStores.length > 0 && monthStores.every((row) => row.status === "klar") ? "klar" : "preliminar");
        const corrected = headline?.corrected ?? monthStores.some((row) => row.corrected);
        const open = openMonth === month.key;
        return <div key={month.key}><button type="button" onClick={() => setOpenMonth(open ? null : month.key)} className="flex w-full items-start gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/40">{open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}<span className="min-w-0 flex-1"><span className="block text-sm font-medium capitalize">{monthLabel(month.month_start)}</span><span className="mt-0.5 block text-xs text-muted-foreground">{storeFilter ? storeName(storeFilter) : REGION_LABELS[groupFilter ?? "SE_TOTAL"] ?? "Sverige totalt"}</span></span><span className="flex shrink-0 flex-col items-end gap-1"><span className="font-mono text-sm tabular-nums">{money(total)}</span><StatusBadge status={status} corrected={corrected} /></span></button>
          {open && <div className="space-y-3 bg-muted/20 px-3 pb-4 pt-2">{monthRegions.map((row) => <div key={row.group_key} className="rounded-md border bg-background p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-medium">{row.group_label}</span><StatusBadge status={row.status} corrected={row.corrected} /></div>{row.missing_stores?.length ? <p className="mb-2 text-[10px] text-muted-foreground">Saknar månadsrapport: {row.missing_stores.join(", ")}</p> : null}<Metrics row={row} /></div>)}
            {monthStores.length > 0 && <div><p className="mb-1.5 text-[11px] text-muted-foreground">Butiksnivå</p><div className="divide-y rounded-md border bg-background">{monthStores.map((row) => <div key={row.store_id} className="p-3"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-sm font-medium">{storeName(row.store_id)}</span><StatusBadge status={row.status} corrected={row.corrected} /></div><Metrics row={row} />{open && storeFilter && <StoreWeekDays storeId={row.store_id} weekStart={month.month_start} weekEnd={month.month_end} />}</div>)}</div></div>}
          </div>}
        </div>;
      })}</div>
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><PencilLine className="h-3 w-3" /> Korrigerad betyder att en underliggande dagsrapport har ändrats i efterhand.</p>
    </div>
  );
}
