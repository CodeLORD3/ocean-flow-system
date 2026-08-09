import {
  ChevronDown,
  Lock,
  Phone,
  MapPin,
  Package,
  AlertTriangle,
  ExternalLink,
  Pencil,
  Printer,
  Download,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CustomerOrder,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PACK_STATUS_LABELS,
  LINE_PACK_LABELS,
  isUncollected,
} from "@/lib/customerOrders";
import { allergenLabel } from "@/lib/catering";
import { printConfirmation, downloadConfirmation } from "@/lib/customerOrderConfirmation";
import { InlineOrderPacking } from "./InlineOrderPacking";



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

type Tone = {
  row: string;
  hover: string;
  edge: string;
  chip: string;
  label: string;
};

/**
 * Hela raden tonas efter läge, som i orderlistor i affärssystem.
 * Färgen är aldrig enda bäraren: den mättade vänsterkanten och den
 * textade statusetiketten finns kvar även i gråskala.
 */
export const rowTone = (order: CustomerOrder): Tone => {
  if (order.status === "avbruten")
    return {
      row: "bg-row-off",
      hover: "hover:bg-row-off-hover",
      edge: "bg-row-off-edge",
      chip: "bg-card text-row-off-text border-row-off-edge",
      label: "Avbruten",
    };
  if (isUncollected(order))
    return {
      row: "bg-row-late",
      hover: "hover:bg-row-late-hover",
      edge: "bg-row-late-edge",
      chip: "bg-card text-row-late-text border-row-late-edge",
      label: "Ohämtad",
    };
  if (["levererad", "avhamtad"].includes(order.status))
    return {
      row: "bg-row-done",
      hover: "hover:bg-row-done-hover",
      edge: "bg-row-done-edge",
      chip: "bg-card text-row-done-text border-row-done-edge",
      label: order.status === "levererad" ? "Levererad" : "Avhämtad",
    };
  if (order.pack_status === "packad")
    return {
      row: "bg-row-ok",
      hover: "hover:bg-row-ok-hover",
      edge: "bg-row-ok-edge",
      chip: "bg-card text-row-ok-text border-row-ok-edge",
      label: "Packad",
    };
  if (order.pack_status === "pagaende")
    return {
      row: "bg-row-warn",
      hover: "hover:bg-row-warn-hover",
      edge: "bg-row-warn-edge",
      chip: "bg-card text-row-warn-text border-row-warn-edge",
      label: "Pågående",
    };
  return {
    row: "bg-row-neutral",
    hover: "hover:bg-row-neutral-hover",
    edge: "bg-border",
    chip: "bg-card text-muted-foreground border-grid-line",
    label: "Ny",
  };
};

const packTone: Record<string, string> = {
  opackad: "bg-muted text-muted-foreground",
  pagaende: "bg-row-warn text-row-warn-text",
  packad: "bg-row-ok text-row-ok-text",
};

/**
 * En orderrad i tätt rutnät med hel statuston, som en listsida i
 * Dynamics 365. Fälls ut till full information direkt i listan och är
 * byggd för att kunna användas på en telefon bakom fiskdisken.
 */
export function CustomerOrderRow({
  order,
  onEdit,
  readOnly,
  open,
  onToggle,
  selected,
  onSelect,
}: {
  order: CustomerOrder;
  onEdit?: (o: CustomerOrder) => void;

  readOnly?: boolean;
  open?: boolean;
  onToggle?: (id: string) => void;
  selected?: boolean;
  onSelect?: (id: string, next: boolean) => void;
}) {
  const isOpen = !!open;
  const name = order.customers_retail?.name || order.customer_name_snapshot || "Kund";
  const phone = order.customers_retail?.phone || order.customer_phone_snapshot;
  const lines = [...(order.customer_order_lines || [])].sort((a, b) => a.sort_order - b.sort_order);
  const active = lines.filter((l) => l.pack_status !== "struken");

  const packedCount = active.filter((l) => l.pack_status === "packad").length;
  const total = Number(order.total_incl_vat || order.estimated_total || 0);
  const allergens = order.excluded_allergens || [];
  const hasAllergy = allergens.length > 0 || !!order.allergy_note;
  const cancelled = order.status === "avbruten";
  const tone = rowTone(order);

  const time = order.wanted_time ? ` ${order.wanted_time.slice(0, 5)}` : "";

  const statusChip = (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight ${tone.chip}`}
    >
      {tone.label}
    </span>
  );

  return (
    <div
      className={`overflow-hidden border-x border-b border-grid-line ${tone.row} ${
        isOpen ? "border-primary ring-1 ring-primary" : ""
      } ${selected && !isOpen ? "ring-1 ring-inset ring-primary" : ""}`}
    >
      <div className="flex">
        <div className={`w-1 shrink-0 ${tone.edge}`} aria-hidden />
        {onSelect && (
          <div className="hidden w-9 shrink-0 items-center justify-center border-r border-grid-line/70 sm:flex">
            <Checkbox
              checked={!!selected}
              onCheckedChange={(v) => onSelect(order.id, !!v)}
              aria-label={`Markera ${order.order_number}`}
            />
          </div>
        )}
        <button
          type="button"
          onClick={() => onToggle?.(order.id)}
          aria-expanded={isOpen}
          className={`min-w-0 flex-1 px-3 py-2 text-left transition-colors ${tone.hover}`}
        >
          {/* Desktop: fast kolumnraster. Mobil: två rader, kundnamnet störst. */}
          <div className="hidden h-6 items-center gap-0 text-[13px] sm:flex">
            <span
              className={`flex w-36 shrink-0 items-center gap-1.5 whitespace-nowrap border-r border-grid-line/70 pr-2 font-mono text-xs tabular-nums ${
                cancelled ? "line-through" : ""
              }`}
            >
              <span>{weekday(order.wanted_date)} {shortDate(order.wanted_date)}</span>
              {time && <span className="font-semibold text-foreground">{time.trim()}</span>}
            </span>


            <span className="w-16 shrink-0 border-r border-grid-line/70 px-2 font-mono tabular-nums text-muted-foreground">
              {active.length} st
            </span>
            <span className="min-w-[6rem] flex-1 truncate border-r border-grid-line/70 px-2 font-semibold">
              {name}
            </span>
            <span className="flex w-24 shrink-0 items-center gap-1 border-r border-grid-line/70 px-2">
              {statusChip}
              {hasAllergy && (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Allergi" />
              )}
              {readOnly && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
            </span>
            <span className="w-24 shrink-0 px-2 text-right font-mono font-semibold tabular-nums">
              {nf(total, 2)}
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
                className={`min-w-0 flex-1 truncate text-base font-semibold leading-tight ${
                  cancelled ? "line-through" : ""
                }`}
              >
                {name}
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
            {(hasAllergy || readOnly) && (
              <div className="mt-0.5 flex items-center gap-2">
                {hasAllergy && (
                  <AlertTriangle
                    className="h-4 w-4 shrink-0 text-destructive"
                    aria-label="Allergi"
                  />
                )}
                {readOnly && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              </div>
            )}

            <div className="mt-1 flex items-center gap-2 font-mono text-xs tabular-nums text-muted-foreground">
              {statusChip}
              <span>
                {weekday(order.wanted_date)} {shortDate(order.wanted_date)}
                {time} · {active.length} st
              </span>
            </div>
          </div>
        </button>
      </div>

      {isOpen && (
        <div className="space-y-3 border-t-2 border-primary bg-card p-3">
          {/* Tydlig rubrik så det aldrig är tvekan om vilken order som är öppen. */}
          <div className="flex items-center gap-2 rounded-sm bg-primary px-3 py-2 text-primary-foreground">
            <Package className="h-5 w-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-base font-semibold">{name}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums opacity-90">
              {order.order_number}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
            <span className={`rounded-sm px-2 py-0.5 ${packTone[order.pack_status] ?? ""}`}>
              {PACK_STATUS_LABELS[order.pack_status] ?? order.pack_status}
              {packedCount > 0 && active.length > 0 ? ` ${packedCount}/${active.length}` : ""}
            </span>
            <Badge variant="secondary">
              {ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}
            </Badge>
            {order.category === "catering" && <Badge variant="secondary">Catering</Badge>}
          </div>

          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="space-y-1">
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
            <div className="space-y-1.5 rounded-sm border border-destructive/40 bg-destructive/10 p-2.5 text-sm">
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

          {readOnly ? (
            <ul className="divide-y divide-grid-line rounded-sm border border-grid-line">
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
                    {l.note && (
                      <span className="w-full text-xs text-muted-foreground">{l.note}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <InlineOrderPacking order={order} />
          )}

          {order.note && (
            <div className="rounded-sm bg-muted/50 p-2.5 text-sm text-muted-foreground">
              {order.note}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-muted/50 p-2.5 text-sm">
            <span className="text-muted-foreground">
              {order.total_incl_vat ? "Verkligt pris" : "Uppskattat pris"}
            </span>
            <span className="font-mono text-base font-semibold tabular-nums">
              {nf(total, 2)} kr
            </span>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            {!readOnly && onEdit && !cancelled && (
              <Button variant="outline" className="h-12 flex-1" onClick={() => onEdit(order)}>
                <Pencil className="mr-2 h-4 w-4" /> Redigera order
              </Button>
            )}
            <Button
              variant="outline"
              className="h-12 flex-1"
              onClick={() => printConfirmation(order)}
            >
              <Printer className="mr-2 h-4 w-4" /> Skriv ut order
            </Button>
            <Button
              variant="outline"
              className="h-12 flex-1"
              onClick={() => downloadConfirmation(order)}
            >
              <Download className="mr-2 h-4 w-4" /> Ladda ner PDF
            </Button>
            <Button variant="ghost" className="h-12 sm:w-32" onClick={() => onOpen(order)}>
              <Package className="mr-2 h-4 w-4" />
              {readOnly ? "Öppna" : "Fullvy"}
              <ExternalLink className="ml-2 h-4 w-4 opacity-70" />
            </Button>
          </div>

        </div>
      )}
    </div>
  );
}

/** Kolumnrubrik som matchar radens desktoplayout. */
export function CustomerOrderRowHeader({
  selectable,
  allSelected,
  onSelectAll,
}: {
  selectable?: boolean;
  allSelected?: boolean;
  onSelectAll?: (next: boolean) => void;
}) {
  return (
    <div className="hidden items-center border border-grid-line bg-grid-head text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
      <span className="w-1 shrink-0" aria-hidden />
      {selectable && (
        <span className="flex w-9 shrink-0 items-center justify-center border-r border-grid-line py-1.5">
          <Checkbox
            checked={!!allSelected}
            onCheckedChange={(v) => onSelectAll?.(!!v)}
            aria-label="Markera alla"
          />
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center px-3 py-1.5">
        <span className="w-24 shrink-0 border-r border-grid-line pr-2">Datum</span>

        <span className="w-16 shrink-0 border-r border-grid-line px-2">Antal</span>
        <span className="min-w-[6rem] flex-1 border-r border-grid-line px-2">Kund</span>
        <span className="w-24 shrink-0 border-r border-grid-line px-2">Status</span>
        <span className="w-24 shrink-0 px-2 text-right">Summa (kr)</span>
        <span className="w-4 shrink-0" />
      </span>
    </div>
  );
}
