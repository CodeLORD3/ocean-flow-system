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

export function DailyReportsArchive() {
  const { data: reports = [], isLoading } = useAllDailyReports();
  const { data: stores = [] } = useStores(true);
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? "Butik";

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
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        ["Brutto", `${nf(r.gross_sales)} kr`],
                        ["Netto", `${nf(r.net_sales)} kr`],
                        ["Kvitton", nf(r.receipt_count)],
                        ["Största köp", `${nf(r.largest_sale)} kr`],
                      ].map(([label, value]) => (
                        <div key={label as string}>
                          <p className="text-[11px] text-muted-foreground">{label}</p>
                          <p className="font-mono tabular-nums text-sm">{value}</p>
                        </div>
                      ))}
                    </div>

                    {(r.waste_items ?? []).length > 0 && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">
                          Svinn — totalt {nf(waste)} kr
                        </p>
                        <div className="space-y-0.5">
                          {r.waste_items.map((w, i) => (
                            <p key={i} className="text-xs">
                              {w.item} · {w.weight_kg ?? "—"} kg · {nf(w.value_sek)} kr
                              {w.reason ? ` · ${w.reason}` : ""}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.comment && (
                      <div>
                        <p className="text-[11px] text-muted-foreground mb-1">Dagens kommentar</p>
                        <p className={cn("text-xs whitespace-pre-wrap")}>{r.comment}</p>
                      </div>
                    )}
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
