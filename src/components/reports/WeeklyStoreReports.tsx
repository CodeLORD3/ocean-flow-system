import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStores } from "@/hooks/useStores";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ChevronDown, ChevronRight, AlertTriangle, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";

export type WeeklyStoreReport = {
  id: string;
  store_id: string;
  region: string | null;
  iso_year: number;
  iso_week: number;
  week_start: string;
  week_end: string;
  daily_reports_count: number;
  expected_open_days: number;
  status: string;
  total_sales_sek: number;
  avg_sales_per_day_sek: number;
  staff_hours: number;
  staff_shifts: number;
  locked_at: string | null;
  drift_after_lock: boolean;
  drift_note: string | null;
  store_name?: string;
};

type WeeklyRegionReport = {
  group_key: string;
  group_label: string;
  iso_year: number;
  iso_week: number;
  week_start: string;
  week_end: string;
  total_sales_sek: number;
  avg_sales_per_day_sek: number;
  staff_hours: number;
  staff_shifts: number;
  daily_reports_count: number;
  expected_open_days: number;
  status: string;
  missing_stores: string[] | null;
  prev_total_sales_sek: number | null;
  diff_kr: number | null;
  diff_procent: number | null;
};

const number = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = (value: number | null | undefined) => value == null ? "—" : `${number.format(value)} kr`;
const regionLabel = (value: string | null) => ({ vast: "Göteborg", stockholm: "Stockholm", schweiz: "Schweiz" }[value ?? ""] ?? value ?? "—");
const formatRange = (start: string, end: string) => `${new Date(`${start}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })} – ${new Date(`${end}T12:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" })}`;

function useWeeklyStoreReports() {
  return useQuery({
    queryKey: ["weekly-store-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("weekly_store_reports").select("*").order("week_start", { ascending: false }).order("store_id");
      if (error) throw error;
      return (data ?? []) as WeeklyStoreReport[];
    },
  });
}

function useWeeklyRegionReports() {
  return useQuery({
    queryKey: ["weekly-region-reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("weekly_region_reports").select("*").order("week_start", { ascending: false }).order("group_label");
      if (error) throw error;
      return (data ?? []) as WeeklyRegionReport[];
    },
  });
}

function StatusBadge({ status, drift }: { status: string; drift?: boolean }) {
  if (drift) return <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive"><AlertTriangle className="h-3 w-3" /> Avviker efter låsning</Badge>;
  return <Badge variant="outline" className={cn("text-[10px]", status === "klar" || status === "last" ? "border-success/40 text-success" : "border-warning/40 text-warning")}>{status === "last" || status === "klar" ? "Klar" : "Pågående"}</Badge>;
}

function Comparison({ diff, percent }: { diff: number | null; percent: number | null }) {
  if (diff == null || percent == null) return <span className="text-muted-foreground">—</span>;
  return <span className={cn("font-mono tabular-nums", diff >= 0 ? "text-success" : "text-destructive")}>{diff >= 0 ? "+" : ""}{money(diff)} · {diff >= 0 ? "+" : ""}{decimal.format(percent)}%</span>;
}

function MetricGrid({ row, region = false }: { row: WeeklyStoreReport | WeeklyRegionReport; region?: boolean }) {
  return <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
    <div><p className="text-[10px] text-muted-foreground">Summa omsättning</p><p className="font-mono tabular-nums text-sm">{money(row.total_sales_sek)}</p></div>
    <div><p className="text-[10px] text-muted-foreground">Snitt per dag</p><p className="font-mono tabular-nums text-sm">{money(row.avg_sales_per_day_sek)}</p></div>
    <div><p className="text-[10px] text-muted-foreground">Bemanning timmar</p><p className="font-mono tabular-nums text-sm">{decimal.format(row.staff_hours)} h</p></div>
    <div><p className="text-[10px] text-muted-foreground">Personpass</p><p className="font-mono tabular-nums text-sm">{row.staff_shifts}</p></div>
    <div><p className="text-[10px] text-muted-foreground">Dagsrapporter</p><p className="font-mono tabular-nums text-sm">{row.daily_reports_count} / {row.expected_open_days}</p></div>
    {region && <div className="col-span-2 sm:col-span-5"><p className="text-[10px] text-muted-foreground">Föregående låsta vecka</p><Comparison diff={(row as WeeklyRegionReport).diff_kr} percent={(row as WeeklyRegionReport).diff_procent} /></div>}
  </div>;
}

export function WeeklyStoreReports() {
  const { data: stores = [] } = useStores(true);
  const { data: storeReports = [], isLoading: storesLoading, error: storesError } = useWeeklyStoreReports();
  const { data: regionReports = [], isLoading: regionsLoading, error: regionsError } = useWeeklyRegionReports();
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const seen = new Map<string, WeeklyRegionReport>();
    regionReports.forEach((row) => seen.set(`${row.iso_year}-${row.iso_week}`, row));
    storeReports.forEach((row) => {
      const key = `${row.iso_year}-${row.iso_week}`;
      if (!seen.has(key)) seen.set(key, row as unknown as WeeklyRegionReport);
    });
    return [...seen.values()].sort((a, b) => b.week_start.localeCompare(a.week_start));
  }, [regionReports, storeReports]);

  const filteredRegions = regionReports.filter((row) => filter === "all" || row.group_key === filter);
  const filteredStores = storeReports.filter((row) => filter === "all" || row.store_id === filter || row.region === filter);
  const error = storesError || regionsError;
  if (storesLoading || regionsLoading) return <div className="flex items-center justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (error) return <p className="py-6 text-center text-sm text-destructive">Kunde inte läsa veckorapporterna.</p>;
  if (weeks.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Inga veckorapporter ännu.</p>;

  return <div className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">Automatiskt sammanställda från sparade dagsrapporter</p>
      <Select value={filter} onValueChange={setFilter}>
        <SelectTrigger className="h-8 w-full text-xs sm:w-[240px]"><SelectValue placeholder="Alla butiker och regioner" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Alla butiker och regioner</SelectItem>
          <SelectItem value="vast">Göteborg</SelectItem><SelectItem value="stockholm">Stockholm</SelectItem><SelectItem value="schweiz">Schweiz</SelectItem><SelectItem value="SE_TOTAL">Sverige totalt</SelectItem>
          {stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div className="rounded-md border divide-y">
      {weeks.map((week) => {
        const key = `${week.iso_year}-${week.iso_week}`;
        const rows = filteredRegions.filter((row) => `${row.iso_year}-${row.iso_week}` === key);
        const details = filteredStores.filter((row) => `${row.iso_year}-${row.iso_week}` === key);
        if (filter !== "all" && rows.length === 0 && details.length === 0) return null;
        const total = rows.find((row) => row.group_key === "SE_TOTAL") ?? rows.find((row) => row.group_key === "vast") ?? details[0];
        if (!total) return null;
        const isOpen = open === key;
        return <div key={key}>
          <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="flex w-full items-start gap-2 px-3 py-3 text-left transition-colors hover:bg-muted/40">
            {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Vecka {week.iso_week} · {formatRange(total.week_start, total.week_end)}</span><span className="mt-1 block text-xs text-muted-foreground">{filter === "all" ? "Sverige totalt" : regionLabel(filter === "SE_TOTAL" ? null : filter)}</span></span>
            <span className="flex shrink-0 flex-col items-end gap-1"><span className="font-mono tabular-nums text-sm">{money(total.total_sales_sek)}</span><StatusBadge status={total.status} /></span>
          </button>
          {isOpen && <div className="space-y-4 bg-muted/20 px-3 pb-4 pt-2">
            {rows.map((row) => <div key={row.group_key} className="rounded-md border bg-background p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{row.group_label}</span><div className="flex items-center gap-2"><StatusBadge status={row.status} />{row.missing_stores?.length ? <span className="text-[10px] text-warning">Saknas: {row.missing_stores.join(", ")}</span> : null}</div></div><MetricGrid row={row} region /></div>)}
            <div><p className="mb-2 text-[11px] text-muted-foreground">Butiksnivå</p><div className="divide-y rounded-md border bg-background">{details.map((row) => <div key={row.id} className="p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{row.store_name ?? stores.find((store) => store.id === row.store_id)?.name ?? "Butik"}</span><div className="flex items-center gap-2"><StatusBadge status={row.status} drift={row.drift_after_lock} />{row.locked_at && <LockKeyhole className="h-3.5 w-3.5 text-muted-foreground" />}</div></div><MetricGrid row={row} /></div>)}</div></div>
          </div>}
        </div>;
      })}
    </div>
  </div>;
}
