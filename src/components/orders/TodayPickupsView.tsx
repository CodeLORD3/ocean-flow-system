import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Phone } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { useCustomerOrders } from "@/hooks/useCustomerOrders";
import {
  CustomerOrder,
  ORDER_STATUS_LABELS,
  PACK_STATUS_LABELS,
  OrderStatus,
  OrderPackStatus,
} from "@/lib/customerOrders";

const nf = (v: unknown, d = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const today = () => new Date().toISOString().slice(0, 10);

/** Tidsfönstret som text, med klockslaget som reserv. */
const windowLabel = (o: CustomerOrder) =>
  (o.wanted_time_window || o.wanted_time || "Utan tid").toString();

/** Sorteringsnyckel: första timmen i fönstret. */
const windowStart = (o: CustomerOrder) => {
  const raw = windowLabel(o);
  const m = raw.match(/(\d{1,2})(?::(\d{2}))?/);
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : 24 * 60;
};

/**
 * Dagens hämtningar — butikens morgonavstämning.
 *
 * Samma data som kundordervyn, men sorterad på tidsfönster och skalad ner till
 * det personalen behöver i disken: tid, kund, telefon, varor och status.
 */
export function TodayPickupsView({ storeId, storeName }: { storeId?: string | null; storeName?: string | null }) {
  const day = today();
  const { data: orders = [], isLoading } = useCustomerOrders({
    storeId: storeId ?? null,
    fromDate: day,
    toDate: day,
  });

  const groups = useMemo(() => {
    const active = orders.filter((o) => o.status !== "avbruten");
    const byWindow = new Map<string, CustomerOrder[]>();
    for (const o of [...active].sort((a, b) => windowStart(a) - windowStart(b))) {
      const key = windowLabel(o);
      byWindow.set(key, [...(byWindow.get(key) ?? []), o]);
    }
    return [...byWindow.entries()];
  }, [orders]);

  const count = groups.reduce((s, [, list]) => s + list.length, 0);

  if (!isLoading && count === 0) {
    return (
      <EmptyState
        title="Inga hämtningar idag"
        description={`Ingen kund har bokat hämtning ${day}${storeName ? ` i ${storeName}` : ""}.`}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {count} hämtningar idag{storeName ? ` — ${storeName}` : ""}. Sorterade på tidsfönster.
      </p>
      {groups.map(([win, list]) => (
        <Card key={win}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" /> {win}
              <Badge variant="secondary">{list.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {list.map((o) => {
              const phoneBooked = !!o.booked_by_staff_id && !o.phone_verified_at;
              return (
                <div
                  key={o.id}
                  className="space-y-1 border-b border-grid-line px-3 py-2 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-sm font-medium">
                        {o.customer_name_snapshot || "Kund"}
                      </span>{" "}
                      <span className="font-mono text-xs text-muted-foreground">
                        {o.customer_phone_snapshot || "utan nummer"}
                      </span>
                      <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                        {o.order_number}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1">
                      {phoneBooked && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Phone className="h-3 w-3" /> Bokad per telefon
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                      </Badge>
                      <Badge
                        variant={o.pack_status === "packad" ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {PACK_STATUS_LABELS[o.pack_status as OrderPackStatus] ?? o.pack_status}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {(o.customer_order_lines ?? [])
                      .filter((l) => l.pack_status !== "struken")
                      .map((l) => (
                        <span key={l.id} className="font-mono tabular-nums">
                          {nf(l.quantity_ordered)} {l.unit}{" "}
                          {l.products?.name || l.free_text_name || "vara"}
                        </span>
                      ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
