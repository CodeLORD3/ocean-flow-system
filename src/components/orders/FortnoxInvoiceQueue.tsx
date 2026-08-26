import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { FileUp, Search } from "lucide-react";
import { FortnoxInvoiceButton } from "@/components/orders/FortnoxInvoiceButton";

const db = supabase as any;

interface QueueOrder {
  id: string;
  order_number: string | null;
  customer_name_snapshot: string | null;
  wanted_date: string | null;
  handed_over_at: string | null;
  pack_status: string | null;
  total_incl_vat: number | null;
  estimated_total: number | null;
  currency: string | null;
  stores?: { name: string | null } | null;
}

/**
 * Kundbeställningar som är packade eller överlämnade och därmed klara att
 * skickas som fakturautkast till Fortnox. Knappen är samma som i orderraden.
 */
export function FortnoxInvoiceQueue() {
  const [search, setSearch] = useState("");

  const { data = [], isLoading } = useQuery({
    queryKey: ["fortnox_invoice_queue"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_orders")
        .select(
          "id, order_number, customer_name_snapshot, wanted_date, handed_over_at, pack_status, total_incl_vat, estimated_total, currency, stores(name)",
        )
        .is("cancelled_at", null)
        .or("pack_status.eq.packad,handed_over_at.not.is.null")
        .order("wanted_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as QueueOrder[];
    },
  });

  const q = search.trim().toLowerCase();
  const rows = q
    ? data.filter(
        (o) =>
          (o.order_number || "").toLowerCase().includes(q) ||
          (o.customer_name_snapshot || "").toLowerCase().includes(q) ||
          (o.stores?.name || "").toLowerCase().includes(q),
      )
    : data;

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileUp className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-heading">Kundbeställningar till Fortnox</CardTitle>
              <CardDescription className="text-xs">
                Packade och överlämnade ordrar. Skicka som utkast — bokför och skicka i Fortnox.
              </CardDescription>
            </div>
          </div>
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sök order, kund, butik"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Inga packade eller överlämnade kundbeställningar just nu.
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {rows.map((o) => {
              const total = Number(o.total_incl_vat ?? o.estimated_total ?? 0);
              return (
                <div key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-xs">
                  <span className="font-mono text-[11px] font-medium text-foreground">{o.order_number || "–"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {o.customer_name_snapshot || "Kund saknas"}
                  </span>
                  <span className="text-muted-foreground">{o.stores?.name || "–"}</span>
                  <span className="text-muted-foreground">{o.wanted_date || "–"}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {o.handed_over_at ? "Överlämnad" : "Packad"}
                  </Badge>
                  <span className="font-mono tabular-nums text-foreground">
                    {total.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    {o.currency || "SEK"}
                  </span>
                  <FortnoxInvoiceButton orderId={o.id} />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
