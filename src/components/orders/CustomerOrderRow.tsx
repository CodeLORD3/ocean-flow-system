import { useState } from "react";
import {
  ChevronDown,
  Lock,
  Clock,
  Phone,
  MapPin,
  Truck,
  ShoppingBag,
  Package,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CustomerOrder,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PACK_STATUS_LABELS,
  LINE_PACK_LABELS,
  isUncollected,
} from "@/lib/customerOrders";
import { allergenLabel } from "@/lib/catering";

const nf = (v: unknown, d = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Veckodag på svenska, t.ex. "Lör". */
const weekday = (iso: string) => {
  const s = new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { weekday: "short" });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
};


/** Färgad kant till vänster, som i orderlistor i affärssystem. */
const stripe = (order: CustomerOrder) => {
  if (order.status === "avbruten") return "bg-muted-foreground/40";
  if (isUncollected(order)) return "bg-destructive";
  if (["levererad", "avhamtad"].includes(order.status)) return "bg-primary/60";
  if (order.pack_status === "packad") return "bg-emerald-500";
  if (order.pack_status === "pagaende") return "bg-amber-500";
  return "bg-muted-foreground/30";
};

const packTone: Record<string, string> = {
  opackad: "bg-muted text-muted-foreground",
  pagaende: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  packad: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

/**
 * En orderrad som fälls ut till full information direkt i listan.
 * Byggd för att kunna användas på en telefon bakom fiskdisken:
 * stora tryckytor, tydlig text och inga dolda menyer.
 */
export function CustomerOrderRow({
  order,
  onOpen,
  readOnly,
}: {
  order: CustomerOrder;
  onOpen: (o: CustomerOrder) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const name = order.customers_retail?.name || order.customer_name_snapshot || "Kund";
  const phone = order.customers_retail?.phone || order.customer_phone_snapshot;
  const lines = [...(order.customer_order_lines || [])].sort((a, b) => a.sort_order - b.sort_order);
  const active = lines.filter((l) => l.pack_status !== "struken");
  const needs = active.filter((l) => l.reservation_status === "inkopsbehov");
  const packedCount = active.filter((l) => l.pack_status === "packad").length;
  const uncollected = isUncollected(order);
  const total = Number(order.total_incl_vat || order.estimated_total || 0);
  const allergens = order.excluded_allergens || [];

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${stripe(order)}`} aria-hidden />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="min-w-0 flex-1 px-3 py-3 text-left transition-colors hover:bg-accent/60 active:bg-accent"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {order.order_number}
                </span>
                <span className="truncate font-semibold">{name}</span>
                {readOnly && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                {uncollected && (
                  <Badge variant="destructive" className="gap-1">
                    <Clock className="h-3 w-3" /> Ohämtad
                  </Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums text-foreground">
                  {weekday(order.wanted_date)} {order.wanted_date}
                  {order.wanted_time ? ` kl ${order.wanted_time.slice(0, 5)}` : ""}

                </span>
                <span className="inline-flex items-center gap-1">
                  {order.order_type === "leverans" ? (
                    <Truck className="h-3.5 w-3.5" />
                  ) : (
                    <ShoppingBag className="h-3.5 w-3.5" />
                  )}
                  {ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}
                </span>
                <span>{active.length} varor</span>
                {order.category === "catering" && <Badge variant="secondary">Catering</Badge>}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <Badge variant="outline">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
                <span className={`rounded px-2 py-0.5 ${packTone[order.pack_status] ?? ""}`}>
                  {PACK_STATUS_LABELS[order.pack_status] ?? order.pack_status}
                  {packedCount > 0 && active.length > 0
                    ? ` ${packedCount}/${active.length}`
                    : ""}
                </span>
                {needs.length > 0 && (
                  <span className="rounded bg-amber-500/20 px-2 py-0.5 text-amber-800 dark:text-amber-300">
                    {needs.length} köps färskt
                  </span>
                )}
                {allergens.length > 0 || order.allergy_note ? (
                  <span className="inline-flex items-center gap-1 rounded bg-destructive/15 px-2 py-0.5 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Allergi
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-mono text-sm font-semibold tabular-nums">{nf(total, 2)} kr</span>
              <ChevronDown
                className={`h-5 w-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              />
            </div>
          </div>
        </button>
      </div>

      {open && (
        <div className="border-t border-border bg-muted/30 p-3 space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <div className="font-semibold">{name}</div>
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-1.5 font-mono tabular-nums text-primary underline-offset-2 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" /> {phone}
                </a>
              )}
              {order.guest_count ? (
                <div className="text-muted-foreground">{order.guest_count} gäster</div>
              ) : null}
            </div>
            {order.order_type === "leverans" && (
              <div className="flex items-start gap-1.5 text-muted-foreground">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  {[order.delivery_street, order.delivery_postal_code, order.delivery_city]
                    .filter(Boolean)
                    .join(", ") || "Adress saknas"}
                </span>
              </div>
            )}
          </div>

          {(order.allergy_note || allergens.length > 0) && (
            <div className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm">
              {order.allergy_note && <div className="font-semibold">Allergi: {order.allergy_note}</div>}
              {allergens.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allergens.map((a) => (
                    <Badge key={a} variant="destructive">
                      Undvik {allergenLabel(a).toLowerCase()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          <ul className="divide-y divide-border rounded-md border border-border bg-card">
            {lines.map((l) => {
              const label = (l.products?.name || l.free_text_name || "Vara") as string;
              const struck = l.pack_status === "struken";
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm">
                  <span className={`min-w-0 flex-1 truncate ${struck ? "line-through text-muted-foreground" : ""}`}>
                    {label}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {LINE_PACK_LABELS[l.pack_status] ?? l.pack_status}
                  </Badge>
                  <span className="font-mono tabular-nums">
                    {nf(l.quantity_packed ?? l.quantity_ordered, 3)} {l.unit}
                  </span>
                  {l.note && (
                    <span className="w-full text-xs text-muted-foreground">{l.note}</span>
                  )}
                </li>
              );
            })}
          </ul>

          {order.note && (
            <div className="rounded-md bg-card p-2.5 text-sm text-muted-foreground">{order.note}</div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-card p-2.5 text-sm">
            <span className="text-muted-foreground">
              {order.total_incl_vat ? "Verkligt pris" : "Uppskattat pris"}
            </span>
            <span className="font-mono text-base font-semibold tabular-nums">{nf(total, 2)} kr</span>
          </div>

          <Button className="h-12 w-full" onClick={() => onOpen(order)}>
            <Package className="mr-2 h-5 w-5" />
            {readOnly ? "Öppna order" : "Börja packa"}
            <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
          </Button>
        </div>
      )}
    </div>
  );
}
