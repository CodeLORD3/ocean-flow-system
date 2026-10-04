import { useMemo, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { orderWeekOrdinal } from "@/lib/orderWeek";
import { svenskDatum } from "@/lib/swedishTime";

const HISTORY_STATUSES = ["Ny", "Pågående", "Packad", "Skickad", "Levererad", "Klar / Levererad", "Arkiverad", "Avbruten"];

/**
 * Läsvy över alla beställningar butiken skickat till grossist. Utkast
 * (Öppen) är butikens arbetsyta och hör inte till historiken.
 */
export function ShopOrderHistory({
  storeId,
  renderTable,
}: {
  storeId: string | null;
  products: any[];
  toast: any;
  allowedWeekdays: Set<number> | null;
  isDateDisabled: (d: Date) => boolean;
  renderTable: (orders: any[], emptyMsg: string) => ReactNode;
}) {
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["shop-orders-history", storeId ?? "alla"],
    queryFn: async () => {
      let q = supabase
        .from("shop_orders")
        .select("*, stores(name, address, phone, city), shop_order_lines(*, products(name, unit, category, image_url, hs_code, weight_per_piece, wholesale_price))")
        .neq("status", "Öppen")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [week, setWeek] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const w = Number(week);
    return orders.filter((o: any) => {
      const day = svenskDatum(o.created_at);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (w) {
        const ord = orderWeekOrdinal(o);
        if (!ord || ord % 100 !== w) return false;
      }
      if (statuses.length && !statuses.includes(o.status)) return false;
      if (s) {
        const hay = [
          o.notes, o.note, o.stores?.name,
          ...(o.shop_order_lines || []).map((l: any) => l.products?.name),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [orders, from, to, week, statuses, search]);

  const toggle = (st: string) =>
    setStatuses((p) => (p.includes(st) ? p.filter((x) => x !== st) : [...p, st]));
  const clear = () => { setFrom(""); setTo(""); setWeek(""); setStatuses([]); setSearch(""); };
  const hasFilter = from || to || week || statuses.length || search;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
        <label className="text-[13px] text-muted-foreground sm:text-xs">
          Från
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-11 sm:h-8" />
        </label>
        <label className="text-[13px] text-muted-foreground sm:text-xs">
          Till
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-11 sm:h-8" />
        </label>
        <label className="text-[13px] text-muted-foreground sm:text-xs">
          Vecka
          <Input inputMode="numeric" placeholder="t.ex. 40" value={week} onChange={(e) => setWeek(e.target.value.replace(/\D/g, "").slice(0, 2))} className="h-11 sm:h-8 sm:w-24" />
        </label>
        <label className="text-[13px] text-muted-foreground sm:text-xs">
          Sök
          <Input placeholder="Produkt eller anteckning" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 sm:h-8 sm:w-56" />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {HISTORY_STATUSES.map((st) => (
          <button key={st} type="button" onClick={() => toggle(st)}>
            <Badge variant={statuses.includes(st) ? "default" : "outline"} className="cursor-pointer px-2.5 py-1 text-[13px] sm:text-[11px]">{st}</Badge>
          </button>
        ))}
        <span className="ml-auto text-[14px] text-muted-foreground sm:text-xs">
          {isLoading ? "Hämtar…" : `${filtered.length} av ${orders.length} beställningar`}
        </span>
        {hasFilter && (
          <Button size="sm" variant="ghost" className="h-9 sm:h-7 sm:text-xs" onClick={clear}>Rensa filter</Button>
        )}
      </div>
      {renderTable(filtered, isLoading ? "Hämtar historik…" : "Inga beställningar matchar urvalet.")}
    </div>
  );
}
