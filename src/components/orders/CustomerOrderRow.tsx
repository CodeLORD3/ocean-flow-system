import {
  ChevronDown,
  Lock,
  Phone,
  MapPin,
  Package,
  AlertTriangle,
  Sparkles,
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

/** Kort datum, t.ex. "9 aug". */
const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

type Tone = { row: string; edge: string };

/**
 * Hela raden tonas efter läge, som i orderlistor i affärssystem.
 * Färgen är aldrig enda bäraren: den mättade vänsterkanten och
 * statusordet i rullgardinen finns kvar.
 */
const rowTone = (order: CustomerOrder): Tone => {
  if (order.status === "avbruten") return { row: "bg-row-off", edge: "bg-row-off-edge" };
  if (isUncollected(order)) return { row: "bg-row-late", edge: "bg-row-late-edge" };
  if (["levererad", "avhamtad"].includes(order.status))
    return { row: "bg-row-done", edge: "bg-row-done-edge" };
  if (order.pack_status === "packad") return { row: "bg-row-ok", edge: "bg-row-ok-edge" };
  if (order.pack_status === "pagaende") return { row: "bg-row-warn", edge: "bg-row-warn-edge" };
  return { row: "bg-card", edge: "bg-border" };
};

const packTone: Record<string, string> = {
  opackad: "bg-muted text-muted-foreground",
  pagaende: "bg-row-warn text-foreground",
  packad: "bg-row-ok text-foreground",
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
  open,
  onToggle,
}: {
  order: CustomerOrder;
  onOpen: (o: CustomerOrder) => void;
  readOnly?: boolean;
  open?: boolean;
  onToggle?: (id: string) => void;
}) {
  const isOpen = !!open;
  const name = order.customers_retail?.name || order.customer_name_snapshot || "Kund";
  const phone = order.customers_retail?.phone || order.customer_phone_snapshot;
  const lines = [...(order.customer_order_lines || [])].sort((a, b) => a.sort_order - b.sort_order);
  const active = lines.filter((l) => l.pack_status !== "struken");
  const needs = active.filter((l) => l.reservation_status === "inkopsbehov");
  const packedCount = active.filter((l) => l.pack_status === "packad").length;
  const total = Number(order.total_incl_vat || order.estimated_total || 0);
  const allergens = order.excluded_allergens || [];
  const hasAllergy = allergens.length > 0 || !!order.allergy_note;
  const cancelled = order.status === "avbruten";
  const tone = rowTone(order);

  const time = order.wanted_time ? ` ${order.wanted_time.slice(0, 5)}` : "";

  return (
    <div className={`overflow-hidden rounded-md border border-border shadow-sm ${tone.row}`}>
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${tone.edge}`} aria-hidden />
        <button
          type="button"
          onClick={() => onToggle?.(order.id)}
          aria-expanded={isOpen}
          className="min-w-0 flex-1 px-3 py-2.5 text-left transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.07] sm:py-2"
        >
          {/* Desktop: en kolumnrad. Mobil: två rader, kundnamnet störst. */}
          <div className="hidden items-center gap-3 sm:flex">
            <span
              className={`w-40 shrink-0 truncate font-mono text-xs tabular-nums text-muted-foreground ${
                cancelled ? "line-through" : ""
              }`}
            >
              {order.order_number}
            </span>
            <span className="w-36 shrink-0 font-mono text-sm tabular-nums">
              {weekday(order.wanted_date)} {shortDate(order.wanted_date)}
              {time}
            </span>
            <span className="w-20 shrink-0 text-sm text-muted-foreground">
              {active.length} {active.length === 1 ? "vara" : "varor"}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</span>
            {hasAllergy && (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Allergi" />
            )}
            {needs.length > 0 && (
              <Sparkles
                className="h-4 w-4 shrink-0 text-row-warn-edge"
                aria-label="Köps färskt"
              />
            )}
            {readOnly && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className="w-28 shrink-0 text-right font-mono text-sm font-semibold tabular-nums">
              {nf(total, 2)} kr
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>

          <div className="sm:hidden">
            <div className="flex items-center gap-2">
              <span
                className={`min-w-0 flex-1 truncate font-mono text-[11px] tabular-nums text-muted-foreground ${
                  cancelled ? "line-through" : ""
                }`}
              >
                {order.order_number}
              </span>
              <span className="font-mono text-sm font-semibold tabular-nums">
                {nf(total, 2)} kr
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-base font-semibold leading-tight">
                {name}
              </span>
              {hasAllergy && (
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="Allergi" />
              )}
              {needs.length > 0 && (
                <Sparkles className="h-4 w-4 shrink-0 text-row-warn-edge" aria-label="Köps färskt" />
              )}
              {readOnly && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            </div>
            <div className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
              {weekday(order.wanted_date)} {shortDate(order.wanted_date)}
              {time} · {active.length} {active.length === 1 ? "vara" : "varor"}
            </div>
          </div>
        </button>
      </div>

      {isOpen && (
        <div className="space-y-3 border-t border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
            <span className={`rounded px-2 py-0.5 ${packTone[order.pack_status] ?? ""}`}>
              {PACK_STATUS_LABELS[order.pack_status] ?? order.pack_status}
              {packedCount > 0 && active.length > 0 ? ` ${packedCount}/${active.length}` : ""}
            </span>
            <Badge variant="secondary">
              {ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}
            </Badge>
            {order.category === "catering" && <Badge variant="secondary">Catering</Badge>}
            {needs.length > 0 && (
              <span className="rounded bg-row-warn px-2 py-0.5">{needs.length} köps färskt</span>
            )}
          </div>

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
              {order.allergy_note && (
                <div className="font-semibold">Allergi: {order.allergy_note}</div>
              )}
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

          <ul className="divide-y divide-border rounded-md border border-border">
            {lines.map((l) => {
              const label = (l.products?.name || l.free_text_name || "Vara") as string;
              const struck = l.pack_status === "struken";
              return (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-sm"
                >
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      struck ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {label}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {LINE_PACK_LABELS[l.pack_status] ?? l.pack_status}
                  </Badge>
                  <span className="font-mono tabular-nums">
                    {nf(l.quantity_packed ?? l.quantity_ordered, 3)} {l.unit}
                  </span>
                  {l.note && <span className="w-full text-xs text-muted-foreground">{l.note}</span>}
                </li>
              );
            })}
          </ul>

          {order.note && (
            <div className="rounded-md bg-muted/50 p-2.5 text-sm text-muted-foreground">
              {order.note}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2.5 text-sm">
            <span className="text-muted-foreground">
              {order.total_incl_vat ? "Verkligt pris" : "Uppskattat pris"}
            </span>
            <span className="font-mono text-base font-semibold tabular-nums">
              {nf(total, 2)} kr
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="h-12 flex-1" onClick={() => onOpen(order)}>
              <Package className="mr-2 h-5 w-5" />
              {readOnly ? "Öppna order" : "Börja packa"}
              <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
            </Button>
            {!readOnly && onEdit && !cancelled && (
              <Button
                variant="outline"
                className="h-12 sm:w-44"
                onClick={() => onEdit(order)}
              >
                <Pencil className="mr-2 h-4 w-4" /> Redigera order
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Kolumnrubrik som matchar radens desktoplayout. */
export function CustomerOrderRowHeader() {
  return (
    <div className="hidden items-center gap-3 px-3 pb-1 pl-[1.125rem] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
      <span className="w-40 shrink-0">Order</span>
      <span className="w-36 shrink-0">Datum</span>
      <span className="w-20 shrink-0">Antal</span>
      <span className="min-w-0 flex-1">Kund</span>
      <span className="w-28 shrink-0 text-right">Summa</span>
      <span className="w-4 shrink-0" />
    </div>
  );
}
