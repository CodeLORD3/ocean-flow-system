import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, ClipboardCheck, Loader2 } from "lucide-react";

/**
 * Arkiv över butikernas inventeringsrapporter.
 *
 * Rapporterna ligger i daily_stock_sheets (butiksvitt underlag,
 * location_id = null). En inskickad rapport (status "godkand") är den som
 * satt butikens saldo, så arkivet är underlaget till lagret.
 */

const fmtKg = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const fmtTime = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Europe/Stockholm",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(iso))
    : "—";

interface Props {
  /** Begränsar arkivet till en butik. Utan värde visas alla butiker. */
  storeId?: string | null;
  limit?: number;
}

export function InventoryReportsArchive({ storeId, limit = 100 }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory-reports-archive", storeId ?? "all", limit],
    queryFn: async () => {
      let q = supabase
        .from("daily_stock_sheets")
        .select(
          "id, store_id, sheet_date, status, line_count, counted_total_kg, closing_value, closed_at, closed_by, created_at",
        )
        .is("location_id", null)
        .order("sheet_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(limit);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: stores = [] } = useQuery({
    queryKey: ["inventory-reports-archive-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const storeName = new Map(stores.map((s: any) => [s.id as string, s.name as string]));

  const { data: lines = [], isLoading: linesLoading } = useQuery({
    queryKey: ["inventory-report-archive-lines", openId],
    enabled: !!openId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_stock_sheet_lines")
        .select("id, product_name, unit, counted_qty_kg, note")
        .eq("sheet_id", openId!)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Hämtar inventeringsrapporter …
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="py-3 text-xs text-muted-foreground">
        Ingen inventeringsrapport är inskickad ännu.
      </p>
    );
  }

  return (
    <div className="divide-y rounded-md border">
      {rows.map((r: any) => {
        const open = openId === r.id;
        const done = r.status === "godkand";
        return (
          <div key={r.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.id)}
              className={`flex w-full items-center gap-2 px-2 py-1.5 text-left ${
                done
                  ? "bg-emerald-50/70 hover:bg-emerald-100 dark:bg-emerald-500/10"
                  : "hover:bg-muted/40"
              }`}
            >
              {open ? (
                <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              <ClipboardCheck
                className={`h-3.5 w-3.5 shrink-0 ${done ? "text-success" : "text-muted-foreground"}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium">
                  {storeName.get(r.store_id) || "Butik"}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {r.sheet_date} · {done ? `Inskickad ${fmtTime(r.closed_at)}` : "Utkast"}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-mono text-[12px] tabular-nums">
                  {fmtKg(Number(r.counted_total_kg) || 0)} kg
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {Number(r.line_count) || 0} rader
                </span>
              </span>
              <Badge
                variant={done ? "secondary" : "outline"}
                className="ml-1 shrink-0 text-[10px]"
              >
                {done ? "Inskickad" : "Utkast"}
              </Badge>
            </button>

            {open && (
              <div className="border-t bg-muted/20 px-2 py-1.5">
                {linesLoading ? (
                  <div className="flex items-center gap-2 py-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Hämtar rader …
                  </div>
                ) : !lines.length ? (
                  <p className="py-2 text-[11px] text-muted-foreground">Rapporten har inga rader.</p>
                ) : (
                  <div className="divide-y">
                    {lines.map((l: any) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 py-1">
                        <span className="min-w-0 truncate text-[11px]">{l.product_name}</span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums">
                          {fmtKg(Number(l.counted_qty_kg) || 0)} {l.unit || "kg"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
