import { History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { CustomerOrder, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/customerOrders";

const nf = (v: unknown, d = 2) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Kundhistorik: allt kunden har beställt tidigare, senaste först. */
export function CustomerHistoryDialog({
  open,
  onOpenChange,
  customerName,
  orders,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerName: string;
  orders: CustomerOrder[];
}) {
  const sorted = [...orders].sort((a, b) => b.wanted_date.localeCompare(a.wanted_date));
  const spent = sorted.reduce(
    (s, o) => s + Number(o.total_incl_vat || o.estimated_total || 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Kundhistorik — {customerName}</DialogTitle>
          <DialogDescription>
            {sorted.length} beställningar · {nf(spent)} kr totalt. Tryck en beställning i orderlistan
            för att öppna den igen.
          </DialogDescription>
        </DialogHeader>

        {sorted.length === 0 ? (
          <EmptyState
            bare
            title="Ingen historik"
            description="Kunden har inte beställt något ännu."
            icon={<History className="h-6 w-6" />}
          />
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {sorted.map((o) => (
              <div key={o.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{o.order_number}</span>
                  <span className="font-mono text-xs tabular-nums">{o.wanted_date}</span>
                  <Badge variant="outline">{ORDER_TYPE_LABELS[o.order_type]}</Badge>
                  <Badge variant="secondary">{ORDER_STATUS_LABELS[o.status]}</Badge>
                  <span className="ml-auto font-mono text-sm tabular-nums">
                    {nf(o.total_incl_vat || o.estimated_total)} kr
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {(o.customer_order_lines || [])
                    .filter((l) => l.pack_status !== "struken")
                    .map((l) => (
                      <li key={l.id}>
                        {l.is_free_text ? l.free_text_name : l.products?.name} —{" "}
                        {nf(l.quantity_packed ?? l.quantity_ordered, 3)} {l.unit}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
