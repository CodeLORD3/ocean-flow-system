import { useMemo, useState } from "react";
import { useStores } from "@/hooks/useStores";
import {
  useWeeklyStoreReports,
  useWeeklyRegionReports,
  useWeeklyClosures,
  useToggleWeeklyClosure,
  type WeeklyStoreReport,
  type WeeklyRegionReport,
} from "@/hooks/useWeeklyStoreReports";
import { useDailyReportsRange } from "@/hooks/useDailyReportsRange";
import { dayRowsFrom, weekDayList } from "@/lib/weeklyReportDays";
import { weeklyReportPdf, weeklyReportXlsx, type ReportRow } from "@/lib/weeklyReportExport";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, LockKeyhole, Printer, FileSpreadsheet, FileDown } from "lucide-react";
import { cn } from "@/lib/utils";

const int = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = (v: number | null | undefined) => (v == null ? "—" : `${int.format(v)} kr`);
const REGION_LABELS: Record<string, string> = { vast: "Göteborg", stockholm: "Stockholm", schweiz: "Schweiz", SE_TOTAL: "Sverige totalt" };

const dateLabel = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

function StatusBadge({ status, drift, corrected }: { status: string; drift?: boolean; corrected?: boolean }) {
  if (corrected && !drift) {
    return (
      <Badge variant="outline" className="gap-1 border-success/40 text-[10px] text-success">
        Korrigerad och omlåst
      </Badge>
    );
  }
  if (drift) {
    return (
      <Badge variant="outline" className="gap-1 border-destructive/40 text-[10px] text-destructive">
        <AlertTriangle className="h-3 w-3" /> Avviker efter låsning
      </Badge>
    );
  }
  const label =
    status === "stangd_denna_vecka" ? "Stängd denna vecka"
      : status === "last" || status === "klar" ? "Klar"
      : status === "preliminar" ? "Preliminär"
      : "Pågående";
  const done = status === "last" || status === "klar" || status === "stangd_denna_vecka";
  return (
    <Badge variant="outline" className={cn("text-[10px]", done ? "border-success/40 text-success" : "border-warning/40 text-warning")}>
      {label}
    </Badge>
  );
}

function Metrics({ row, comparison }: { row: WeeklyStoreReport | WeeklyRegionReport; comparison?: WeeklyRegionReport }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
      <div>
        <p className="text-[10px] text-muted-foreground">Summa</p>
        <p className="font-mono text-sm tabular-nums">{money(row.total_sales_sek)}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Snitt/dag</p>
        <p className="font-mono text-sm tabular-nums">{money(row.avg_sales_per_day_sek)}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Timmar</p>
        <p className="font-mono text-sm tabular-nums">{dec.format(row.staff_hours)} h</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Personpass</p>
        <p className="font-mono text-sm tabular-nums">{int.format(row.staff_shifts)}</p>
      </div>
      <div>
        <p className="text-[10px] text-muted-foreground">Dagsrapporter</p>
        <p className="font-mono text-sm tabular-nums">
          {int.format(row.daily_reports_count)} / {int.format(row.expected_open_days)}
        </p>
      </div>
      {comparison && (
        <div className="col-span-2 sm:col-span-5">
          <p className="text-[10px] text-muted-foreground">Mot föregående vecka</p>
          {comparison.diff_kr == null ? (
            <p className="text-sm text-muted-foreground">—</p>
          ) : (
            <p className={cn("font-mono text-sm tabular-nums", comparison.diff_kr >= 0 ? "text-success" : "text-destructive")}>
              {comparison.diff_kr >= 0 ? "+" : ""}{money(comparison.diff_kr)}
              {comparison.diff_procent != null && ` · ${comparison.diff_procent >= 0 ? "+" : ""}${dec.format(comparison.diff_procent)}%`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function WeeklyStoreReportsSection() {
  const { data: stores = [] } = useStores(true);
  const storeReports = useWeeklyStoreReports();
  const regionReports = useWeeklyRegionReports();
  const closures = useWeeklyClosures();
  const toggleClosure = useToggleWeeklyClosure();
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [openWeek, setOpenWeek] = useState<string | null>(null);
  const [openStore, setOpenStore] = useState<string | null>(null);

  const regions = regionReports.data ?? [];
  const details = storeReports.data ?? [];

  const weeks = useMemo(() => {
    const map = new Map<string, { iso_year: number; iso_week: number; week_start: string; week_end: string }>();
    [...regions, ...details].forEach((r) =>
      map.set(`${r.iso_year}-${r.iso_week}`, {
        iso_year: r.iso_year, iso_week: r.iso_week, week_start: r.week_start, week_end: r.week_end,
      }),
    );
    return [...map.entries()]
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.week_start.localeCompare(a.week_start));
  }, [regions, details]);

  const latestWeekForExport = weeks[0];
  const selectedStoreForExport = filter !== "all" && !(filter in REGION_LABELS) ? filter : null;
  const dailyExport = useDailyReportsRange(
    selectedStoreForExport,
    latestWeekForExport?.week_start,
    latestWeekForExport?.week_end,
  );

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "Butik";
  const isClosed = (storeId: string, year: number, week: number) =>
    (closures.data ?? []).some((c) => c.store_id === storeId && c.iso_year === year && c.iso_week === week);

  const handleToggle = (row: WeeklyStoreReport, closed: boolean) => {
    toggleClosure.mutate(
      { store_id: row.store_id, iso_year: row.iso_year, iso_week: row.iso_week, closed },
      {
        onSuccess: () =>
          toast({
            title: closed ? "Markerad som stängd denna vecka" : "Markering borttagen",
            description: `${storeName(row.store_id)} · vecka ${row.iso_week}`,
          }),
        onError: (error: any) => toast({ title: "Fel", description: error.message, variant: "destructive" }),
      },
    );
  };

  if (storeReports.isLoading || regionReports.isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (storeReports.error || regionReports.error) {
    return <p className="py-6 text-center text-sm text-destructive">Kunde inte läsa veckorapporterna.</p>;
  }
  if (weeks.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Inga veckorapporter ännu.</p>;
  }

  const groupFilter = filter !== "all" && filter in REGION_LABELS ? filter : null;
  const storeFilter = filter !== "all" && !groupFilter ? filter : null;
  const latestWeek = weeks[0];
  const latestRegions = latestWeek
    ? regions.filter((row) => row.iso_year === latestWeek.iso_year && row.iso_week === latestWeek.iso_week)
    : [];
  const selectedSummary = groupFilter
    ? latestRegions.find((row) => row.group_key === groupFilter)
    : filter === "all"
      ? latestRegions.find((row) => row.group_key === "SE_TOTAL") ?? latestRegions[0]
      : details.find((row) => row.store_id === storeFilter && row.iso_year === latestWeek?.iso_year && row.iso_week === latestWeek?.iso_week);
  const summaryLabel = storeFilter
    ? storeName(storeFilter)
    : groupFilter
      ? REGION_LABELS[groupFilter]
      : "Sverige totalt";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">Sammanställs automatiskt från sparade dagsrapporter</p>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-full text-xs sm:w-[240px]">
            <SelectValue placeholder="Alla butiker och regioner" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla butiker och regioner</SelectItem>
            <SelectItem value="SE_TOTAL">Sverige totalt</SelectItem>
            <SelectItem value="vast">Göteborg</SelectItem>
            <SelectItem value="stockholm">Stockholm</SelectItem>
            <SelectItem value="schweiz">Schweiz</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedSummary && latestWeek && (
        <div className="border-b pb-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">Senaste veckan</p>
              <p className="mt-1 text-sm font-semibold">{summaryLabel}</p>
              <p className="text-xs text-muted-foreground">Vecka {latestWeek.iso_week} · {dateLabel(latestWeek.week_start)}–{dateLabel(latestWeek.week_end)}</p>
            </div>
            <StatusBadge
              status={selectedSummary.status}
              drift={"drift_after_lock" in selectedSummary ? selectedSummary.drift_after_lock : false}
              corrected={selectedSummary.corrected}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-md border bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">Summa</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{money(selectedSummary.total_sales_sek)}</p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">Snitt/dag</p>
              <p className="mt-1 font-mono text-sm tabular-nums">{money(selectedSummary.avg_sales_per_day_sek)}</p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">Bemanning</p>
              <p className="mt-1 font-mono text-sm tabular-nums">{dec.format(selectedSummary.staff_hours)} h · {int.format(selectedSummary.staff_shifts)} pass</p>
            </div>
            <div className="rounded-md border bg-muted/20 px-3 py-2.5">
              <p className="text-[10px] text-muted-foreground">Dagsrapporter</p>
              <p className="mt-1 font-mono text-sm tabular-nums">{int.format(selectedSummary.daily_reports_count)} / {int.format(selectedSummary.expected_open_days)}</p>
            </div>
          </div>
        </div>
      )}

      <div className="divide-y rounded-md border">
        {weeks.map((week) => {
          const weekRegions = regions.filter(
            (r) => r.iso_year === week.iso_year && r.iso_week === week.iso_week && (!groupFilter || r.group_key === groupFilter),
          );
          const weekStores = details.filter(
            (r) => r.iso_year === week.iso_year && r.iso_week === week.iso_week && (!storeFilter || r.store_id === storeFilter),
          );
          if (weekRegions.length === 0 && weekStores.length === 0) return null;

          const headline =
            weekRegions.find((r) => r.group_key === (groupFilter ?? "SE_TOTAL")) ?? weekRegions[0] ?? null;
          const headlineTotal = headline
            ? headline.total_sales_sek
            : weekStores.reduce((sum, r) => sum + Number(r.total_sales_sek), 0);
          const headlineStatus = headline?.status ?? (weekStores.every((r) => r.status !== "pagaende") ? "klar" : "pagaende");
          const open = openWeek === week.key;

          return (
            <div key={week.key}>
              <button
                type="button"
                onClick={() => setOpenWeek(open ? null : week.key)}
                className="flex w-full items-start gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/40"
              >
                {open ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    Vecka {week.iso_week}, {dateLabel(week.week_start)}–{dateLabel(week.week_end)}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {storeFilter ? storeName(storeFilter) : REGION_LABELS[groupFilter ?? "SE_TOTAL"]}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-sm tabular-nums">{money(headlineTotal)}</span>
                  <StatusBadge status={headlineStatus} />
                </span>
              </button>

              {open && (
                <div className="space-y-3 bg-muted/20 px-3 pb-4 pt-2">
                  {weekRegions.map((row) => (
                    <div key={row.group_key} className="rounded-md border bg-background p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium">{row.group_label}</span>
                        <StatusBadge status={row.status} />
                      </div>
                      {row.missing_stores?.length ? (
                        <p className="mb-2 text-[10px] text-muted-foreground">
                          Saknar låst veckorapport: {row.missing_stores.join(", ")}
                        </p>
                      ) : null}
                      <Metrics row={row} comparison={row} />
                    </div>
                  ))}

                  {weekStores.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[11px] text-muted-foreground">Butiksnivå</p>
                      <div className="divide-y rounded-md border bg-background">
                        {weekStores.map((row) => {
                          const closed = isClosed(row.store_id, row.iso_year, row.iso_week);
                          return (
                            <div key={row.id} className="p-3">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 text-sm font-medium">
                                  {storeName(row.store_id)}
                                  {row.locked_at && <LockKeyhole className="h-3 w-3 text-muted-foreground" />}
                                </span>
                                <div className="flex items-center gap-2">
                                  <StatusBadge status={row.status} drift={row.drift_after_lock} corrected={row.corrected} />
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px]"
                                    disabled={toggleClosure.isPending}
                                    onClick={() => handleToggle(row, !closed)}
                                  >
                                    {closed ? "Ta bort stängd vecka" : "Stängd denna vecka"}
                                  </Button>
                                </div>
                              </div>
                              <Metrics row={row} />
                              {row.drift_after_lock && row.drift_note && (
                                <p className="mt-2 text-[10px] text-destructive">{row.drift_note}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
