import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStores } from "@/hooks/useStores";
import { formatWeekdayDate, type DailyReport } from "@/hooks/useDailyReport";
import { Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

function useAllDailyReports() {
  return useQuery({
    queryKey: ["daily-reports", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_reports")
        .select("*")
        .order("report_date", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });
}

const nf = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("sv-SE", { maximumFractionDigits: 0 });

function hours(start?: string, end?: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff / 60 : 0;
}

function totalHours(r: DailyReport) {
  return (r.staff_entries ?? []).reduce((a, e) => a + hours(e.start, e.end), 0);
}

export function DailyReportsArchive() {
  const { data: reports = [], isLoading } = useAllDailyReports();
  const { data: stores = [] } = useStores(true);
  const { data: staff = [] } = useStaff();
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "Butik";
  const staffName = (id: string) => {
    const s = staff.find((p) => p.id === id);
    return s ? `${s.first_name} ${s.last_name}` : "Personal";
  };


  const rows = useMemo(
    () => (storeFilter === "all" ? reports : reports.filter((r) => r.store_id === storeFilter)),
    [reports, storeFilter]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{rows.length} avslutade dagsrapporter</p>
        <Select value={storeFilter} onValueChange={setStoreFilter}>
          <SelectTrigger className="h-8 w-[220px] text-xs">
            <SelectValue placeholder="Alla butiker" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla butiker</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Inga dagsrapporter ännu.</p>
      ) : (
        <div className="rounded-md border divide-y">
          {rows.map((r) => {
            const open = openId === r.id;
            const waste = (r.waste_items ?? []).reduce((a, w) => a + (w.value_sek ?? 0), 0);
            return (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                >
                  {open ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{storeName(r.store_id)}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {formatWeekdayDate(r.report_date)}
                  </span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="font-mono tabular-nums text-sm">{nf(r.gross_sales)} kr</span>
                    <Badge variant="outline" className="text-[10px]">
                      {(r.staff_entries ?? []).length} pers
                    </Badge>
                  </span>
                </button>

                {open && (
                  <div className="px-3 pb-3 pt-1 space-y-3 bg-muted/20">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {[
                        ["Brutto", `${nf(r.gross_sales)} kr`],
                        ["Netto", `${nf(r.net_sales)} kr`],
                        ["Kvitton", nf(r.receipt_count)],
                        ["Snittköp", r.receipt_count ? `${((r.gross_sales ?? 0) / r.receipt_count).toFixed(2)} kr` : "—"],
                        ["Största köp", `${nf(r.largest_sale)} kr`],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <p className="text-[11px] text-muted-foreground">{label}</p>
                          <p className="font-mono tabular-nums text-sm">{value}</p>
                        </div>
                      ))}
                    </div>

                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">
                        Personal som arbetade — totalt {totalHours(r).toFixed(2)} h
                      </p>
                      {(r.staff_entries ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">Ingen personal rapporterad.</p>
                      ) : (
                        <div className="rounded border divide-y bg-background">
                          {r.staff_entries.map((e, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs">
                              <span className="font-medium">{staffName(e.staff_id)}</span>
                              <span className="font-mono tabular-nums text-muted-foreground">
                                {e.start || "—"}–{e.end || "—"}
                              </span>
                              <span className="font-mono tabular-nums text-muted-foreground">
                                {hours(e.start, e.end).toFixed(2)} h
                              </span>
                              {e.deviation && e.deviation !== "none" && (
                                <Badge variant="outline" className="text-[10px]">
                                  {e.deviation}
                                </Badge>
                              )}
                              {e.deviation_note && (
                                <span className="text-muted-foreground">{e.deviation_note}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {r.staff_notes && (
                        <p className="text-xs whitespace-pre-wrap mt-1">{r.staff_notes}</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">
                        Svinn / kastade varor — {nf(wasteKg)} kg · {nf(waste)} kr
                        {r.gross_sales ? ` · ${((waste / r.gross_sales) * 100).toFixed(1)}% av brutto` : ""}
                      </p>
                      {(r.waste_items ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">Inget svinn rapporterat.</p>
                      ) : (
                        <div className="rounded border divide-y bg-background">
                          {r.waste_items.map((w, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-2 px-2 py-1 text-xs">
                              <span className="font-medium">{w.item || "—"}</span>
                              <span className="font-mono tabular-nums text-muted-foreground">
                                {w.weight_kg ?? "—"} kg
                              </span>
                              <span className="font-mono tabular-nums text-muted-foreground">
                                {nf(w.value_sek)} kr
                              </span>
                              {w.reason && <span className="text-muted-foreground">{w.reason}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[11px] text-muted-foreground mb-1">Dagens kommentar</p>
                      <p className={cn("text-xs whitespace-pre-wrap")}>
                        {r.comment || <span className="text-muted-foreground">Ingen kommentar.</span>}
                      </p>
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      Sparad{" "}
                      {new Date(r.updated_at || r.created_at).toLocaleString("sv-SE", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
