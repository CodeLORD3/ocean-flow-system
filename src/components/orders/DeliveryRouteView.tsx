import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Truck, Printer, MapPin, Phone, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { useCustomerOrders, useUpdateCustomerOrder } from "@/hooks/useCustomerOrders";
import { CustomerOrder, ORDER_STATUS_LABELS } from "@/lib/customerOrders";
import { printPackList } from "@/lib/customerOrderPackListPdf";

const nf = (v: unknown, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Leveransrutt för en dag: alla leveransorder i tidsordning med adress och
 * telefon, plus knapp för att kvittera att varan är levererad.
 */
export function DeliveryRouteView({
  storeId,
  storeName,
  readOnly,
}: {
  storeId?: string | null;
  storeName?: string | null;
  readOnly?: boolean;
}) {
  const [date, setDate] = useState(today());
  const update = useUpdateCustomerOrder();

  const { data: orders = [], isLoading } = useCustomerOrders({
    storeId: storeId ?? undefined,
    orderType: "leverans",
    fromDate: date,
    toDate: date,
  });

  const route = useMemo(
    () =>
      [...orders]
        .filter((o) => o.status !== "avbruten")
        .sort((a, b) => String(a.wanted_time || "99").localeCompare(String(b.wanted_time || "99"))),
    [orders],
  );

  const markDelivered = (order: CustomerOrder) => {
    update.mutate(
      {
        id: order.id,
        patch: { status: "levererad", handed_over_at: new Date().toISOString() },
        event: { type: "levererad", description: "Levererad till kund" },
      },
      { onSuccess: () => toast.success(`${order.order_number} är levererad.`) },
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs">Leveransdag</Label>
          <Input
            type="date"
            className="h-12 w-[170px]"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          className="h-12"
          disabled={route.length === 0}
          onClick={() =>
            printPackList({ orders: route, storeName, dateLabel: `Leveranser ${date}` })
          }
        >
          <Printer className="mr-2 h-4 w-4" /> Skriv körlista
        </Button>
        <Badge variant="secondary" className="h-8 px-3 text-sm">
          {route.length} leveranser
        </Badge>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Hämtar leveranser…</p>
      ) : route.length === 0 ? (
        <EmptyState
          title="Inga leveranser den dagen"
          description="Order med leverans hem till kund visas här i tidsordning med adress och telefon."
          icon={<Truck className="h-8 w-8" />}
        />
      ) : (
        <div className="space-y-2">
          {route.map((o, i) => {
            const address = [o.delivery_street, o.delivery_postal_code, o.delivery_city]
              .filter(Boolean)
              .join(", ");
            const done = ["levererad", "avhamtad"].includes(o.status);
            return (
              <Card key={o.id} className={done ? "border-emerald-600/40 bg-emerald-500/5" : ""}>
                <CardContent className="flex flex-wrap items-center gap-3 p-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold">
                    {i + 1}
                  </div>
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{o.order_number}</span>
                      <Badge variant="outline">{ORDER_STATUS_LABELS[o.status]}</Badge>
                      {o.category === "catering" && <Badge variant="secondary">Catering</Badge>}
                    </div>
                    <p className="font-medium">
                      {o.customers_retail?.name || o.customer_name_snapshot || "Kund"}
                    </p>
                    <p className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {address || "Adress saknas"}
                      </span>
                      {(o.customers_retail?.phone || o.customer_phone_snapshot) && (
                        <a
                          className="inline-flex items-center gap-1 underline"
                          href={`tel:${o.customers_retail?.phone || o.customer_phone_snapshot}`}
                        >
                          <Phone className="h-3 w-3" />
                          {o.customers_retail?.phone || o.customer_phone_snapshot}
                        </a>
                      )}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono tabular-nums text-sm">
                      {o.wanted_time ? String(o.wanted_time).slice(0, 5) : "Ingen tid"}
                    </p>
                    <p className="font-mono tabular-nums text-xs text-muted-foreground">
                      {nf(o.total_incl_vat || o.estimated_total)} kr
                    </p>
                  </div>
                  {!readOnly && !done && (
                    <Button className="h-12" onClick={() => markDelivered(o)}>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Levererad
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
