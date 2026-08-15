import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImageIcon, Camera, Star } from "lucide-react";
import {
  ChevronDown,
  Lock,
  Phone,
  MapPin,
  AlertTriangle,
  MessageSquare,
  Pencil,
  Printer,
  Download,
  UserX,
  Undo2,
  PackageCheck,
  BadgeCheck,
  Trash2,
  RotateCcw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Archive, ArchiveRestore } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useUpdateCustomerOrder,
  useArchiveCustomerOrder,
  useHandOverCustomerOrder,
  useMarkCustomerOrderPaid,
  useMarkCustomerOrderPacked,
  useSoftDeleteCustomerOrder,
} from "@/hooks/useCustomerOrders";
import { useMarkNoShow } from "@/hooks/useBookingAdmin";
import {
  CustomerOrder,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  PACK_STATUS_LABELS,
  LINE_PACK_LABELS,
  isUncollected,
  isHandedOver,
  isPaid,
  lateText,
  DELETE_REASONS,
} from "@/lib/customerOrders";
import { allergenLabel } from "@/lib/catering";
import { printConfirmation, downloadConfirmation } from "@/lib/customerOrderConfirmation";
import { InlineOrderPacking } from "./InlineOrderPacking";
import { InlineOrderEdit } from "./InlineOrderEdit";
import { ProductThumb } from "@/components/products/ProductThumb";
import { EntityImageGallery } from "@/components/images/EntityImageGallery";




const nf = (v: unknown, d = 1) =>
  Number(v ?? 0).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

/** Vikt visas med max en decimal på kilo (2 kg blir "2") och utan decimal på styck. */
const qtyText = (v: unknown, unit?: string | null) =>
  Number(v ?? 0).toLocaleString("sv-SE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: String(unit ?? "").toLowerCase().startsWith("st") ? 0 : 1,
  });


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
  if (order.status === "avbruten") {
    // Avbokad webborder som redan var packad: larmläge, varorna finns plockade.
    if (order.cancelled_was_packed)
      return {
        row: "bg-row-late",
        hover: "hover:bg-row-late-hover",
        edge: "bg-row-late-edge",
        chip: "bg-card text-row-late-text border-row-late-edge",
        label: "Avbokad efter packning",
      };
    return {
      row: "bg-row-off",
      hover: "hover:bg-row-off-hover",
      edge: "bg-row-off-edge",
      chip: "bg-card text-row-off-text border-row-off-edge",
      label: order.cancelled_source === "shopify" ? "Avbokad på webben" : "Avbruten",
    };
  }
  if (isUncollected(order))
    return {
      row: "bg-row-late",
      hover: "hover:bg-row-late-hover",
      edge: "bg-row-late-edge",
      chip: "bg-card text-row-late-text border-row-late-edge",
      label: "Ohämtad",
    };
  if (isHandedOver(order) && !isPaid(order))
    return {
      row: "bg-row-late",
      hover: "hover:bg-row-late-hover",
      edge: "bg-row-late-edge",
      chip: "bg-card text-row-late-text border-row-late-edge",
      label: "Ej betald",
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
  canEdit,
  readOnly,
  open,
  onToggle,
  selected,
  onSelect,
  photoCount = 0,
  orderCount = 0,
}: {
  order: CustomerOrder;
  canEdit?: boolean;

  readOnly?: boolean;
  open?: boolean;
  onToggle?: (id: string) => void;
  selected?: boolean;
  onSelect?: (id: string, next: boolean) => void;
  /** Antal interna bilder på beställningen, visas som kameraikon på namnraden. */
  photoCount?: number;
  /** Kundens totala antal beställningar i kedjan, visas som stjärna. */
  orderCount?: number;
}) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const updateOrder = useUpdateCustomerOrder();
  const archiveOrder = useArchiveCustomerOrder();
  const markNoShow = useMarkNoShow();
  const handOver = useHandOverCustomerOrder();
  const markPaid = useMarkCustomerOrderPaid();
  const markPacked = useMarkCustomerOrderPacked();
  const softDelete = useSoftDeleteCustomerOrder();
  const [deleteReason, setDeleteReason] = useState<string | null>(null);
  const isArchived = !!order.archived_at;
  const isOpen = !!open;
  const name = order.customers_retail?.name || order.customer_name_snapshot || "Kund";
  const phone = order.customers_retail?.phone || order.customer_phone_snapshot;
  const lines = [...(order.customer_order_lines || [])].sort((a, b) => a.sort_order - b.sort_order);
  const active = lines.filter((l) => l.pack_status !== "struken");

  /* Kommentarer: orderns egen not och eventuella noteringar på raderna. */
  const lineNotes = lines.map((l) => l.note).filter((n): n is string => !!n && !!n.trim());
  const hasComment = !!order.note?.trim() || lineNotes.length > 0;
  const commentPreview = [order.note?.trim(), ...lineNotes].filter(Boolean).join(" · ").slice(0, 140);
  const itemsLabel = `${active.length} ${active.length === 1 ? "artikel" : "artiklar"}`;




  const packedCount = active.filter((l) => l.pack_status === "packad").length;
  const total = Number(order.total_incl_vat || order.estimated_total || 0);
  const allergens = order.excluded_allergens || [];
  const hasAllergy = allergens.length > 0 || !!order.allergy_note;
  const cancelled = order.status === "avbruten";
  const tone = rowTone(order);

  const time = order.wanted_time ? ` ${order.wanted_time.slice(0, 5)}` : "";

  const packedAlarm = cancelled && !!order.cancelled_was_packed;

  /* Förbokning: telefonvägen har personal som bokare och saknar verifierad kod. */
  const isBooking = !!order.phone_verified_at || !!order.booked_by_staff_id;
  const phoneBooked = !!order.booked_by_staff_id && !order.phone_verified_at;
  const noShow = !!order.no_show_at;

  /* Försenad hämtning markeras inne i Pågående/Packade — ingen egen flik. */
  const late = !cancelled && !isHandedOver(order) ? lateText(order) : null;
  const handedOver = isHandedOver(order);
  const paid = isPaid(order);

  const statusChip = (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight ${tone.chip}`}
      >
        {tone.label}
      </span>
      {late && (
        <span className="inline-flex items-center rounded-sm border border-row-late-edge bg-card px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight text-row-late-text">
          {late}
        </span>
      )}
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
          className={`min-w-0 flex-1 px-2.5 py-1.5 text-left transition-colors ${tone.hover}`}
        >
          {/* Desktop: fast kolumnraster. Mobil: två rader, kundnamnet störst. */}
          <div className="hidden min-h-5 items-center gap-0 text-xs sm:flex">
            <span
              className={`flex w-36 shrink-0 items-center gap-1.5 whitespace-nowrap border-r border-grid-line/70 pr-2 font-mono text-[11px] tabular-nums ${
                cancelled ? "line-through" : ""
              }`}
            >
              <span>{weekday(order.wanted_date)} {shortDate(order.wanted_date)}</span>
              {time && <span className="font-semibold text-foreground">{time.trim()}</span>}
            </span>

            <span className="w-16 shrink-0 whitespace-nowrap border-r border-grid-line/70 px-2 font-mono text-[9px] tabular-nums text-muted-foreground">
              {itemsLabel}
            </span>
            {/* Kundnamnet börjar alltid på samma x-position — källan står i egen kolumn efter namnet. */}
            <span className="flex min-w-[14rem] shrink-0 flex-1 items-center whitespace-nowrap border-r border-grid-line/70 pl-3 pr-5 font-semibold">
              {order.customer_id ? (
                <span
                  role="link"
                  tabIndex={0}
                  title="Öppna kundkortet"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/customer-orders/kund/${order.customer_id}`);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/customer-orders/kund/${order.customer_id}`);
                    }
                  }}
                  className="cursor-pointer whitespace-nowrap leading-tight hover:text-primary hover:underline"
                >
                  {name}
                </span>
              ) : (
                <span className="whitespace-nowrap leading-tight">{name}</span>
              )}
            </span>

            {/* Stamkund: antal beställningar. Nya kunder (1 order) visas utan stjärna. */}
            <span className="flex w-12 shrink-0 items-center justify-center gap-0.5 whitespace-nowrap border-r border-grid-line/70 px-2">
              {orderCount > 1 && (
                <>
                  <Star
                    className={`h-3.5 w-3.5 ${
                      orderCount > 10
                        ? "fill-amber-400 text-amber-500"
                        : "text-muted-foreground"
                    }`}
                    aria-hidden
                  />
                  <span
                    className="font-mono text-[10px] tabular-nums text-muted-foreground"
                    title={`${orderCount} beställningar totalt`}
                  >
                    {orderCount}
                  </span>
                </>
              )}
            </span>


            <span className="w-14 shrink-0 whitespace-nowrap border-r border-grid-line/70 px-2">
              {order.is_web_order ? (
                <span
                  className="rounded-sm bg-primary/15 px-1 text-[10px] font-bold uppercase tracking-wide text-primary"
                  title="Ny webborder från Shopify"
                >
                  Webb
                </span>
              ) : phoneBooked ? (
                <span
                  className="rounded-sm bg-muted px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground"
                  title="Bokad per telefon av butikspersonal — numret är inte verifierat med kod"
                >
                  Tel
                </span>
              ) : null}
            </span>

            {/* Kommentar och bilder i egen kolumn så namnen står symmetriskt. */}
            <span className="flex w-12 shrink-0 items-center gap-1 whitespace-nowrap border-r border-grid-line/70 px-2">
              {hasComment && (
                <span className="shrink-0" title={`Kommentar: ${commentPreview}`}>
                  <MessageSquare className="h-3.5 w-3.5 text-primary" aria-label="Kommentar finns" />
                </span>
              )}
              {photoCount > 0 && (
                <span
                  className="flex shrink-0 items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground"
                  title={`${photoCount} interna bilder på beställningen`}
                >
                  <Camera className="h-3.5 w-3.5" aria-label="Bilder finns" />
                  {photoCount}
                </span>
              )}
            </span>




            <span className="flex w-24 shrink-0 items-center gap-1 border-r border-grid-line/70 px-2">
              {statusChip}
              {hasAllergy && (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Allergi" />
              )}
              {readOnly && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
            </span>
            <span className="w-24 shrink-0 border-r border-grid-line/70 px-2 text-right font-mono text-[11px] font-semibold tabular-nums">
              {nf(total, 2)}
            </span>
            <span className="w-28 shrink-0 truncate px-2 text-[11px] text-muted-foreground">
              {order.stores?.name ?? ""}
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          </div>

          <div className="sm:hidden">
            <div className="flex min-h-5 items-center gap-2">
              {order.is_web_order && (
                <span className="shrink-0 rounded-sm bg-primary/15 px-1 text-[10px] font-bold uppercase text-primary">
                  Webb
                </span>
              )}
              <span
                className={`min-w-0 flex-1 whitespace-nowrap text-sm font-semibold leading-tight ${
                  cancelled ? "line-through" : ""
                }`}
              >
                {name}
              </span>

              {hasComment && (
                <MessageSquare
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                  aria-label="Kommentar finns"
                />
              )}
              {photoCount > 0 && (
                <span className="flex shrink-0 items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  <Camera className="h-3.5 w-3.5" aria-label="Bilder finns" />
                  {photoCount}
                </span>
              )}
              {hasAllergy && (
                <AlertTriangle
                  className="h-3.5 w-3.5 shrink-0 text-destructive"
                  aria-label="Allergi"
                />
              )}
              {readOnly && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <span className="font-mono text-xs font-semibold tabular-nums">
                {nf(total, 2)} kr
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </div>

            <div className="mt-0.5 flex h-5 items-center gap-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              {statusChip}
              <span className="truncate">
                {weekday(order.wanted_date)} {shortDate(order.wanted_date)}
                {time} · {itemsLabel}
                {order.stores?.name ? ` · ${order.stores.name}` : ""}
              </span>
            </div>
          </div>


        </button>
      </div>

      {cancelled && (
        <div
          className={`flex items-start gap-2 border-t border-grid-line px-3 py-1.5 text-[11px] font-semibold ${
            packedAlarm
              ? "bg-row-late-edge/15 text-row-late-text"
              : "bg-row-off/60 text-row-off-text"
          }`}
        >
          <span aria-hidden>{packedAlarm ? "⚠" : "✕"}</span>
          <span className="min-w-0">
            {packedAlarm
              ? "Avbokad efter att varorna packats — kontrollera och hantera varorna i butiken"
              : order.cancelled_source === "shopify"
                ? "Avbokad i webbutiken — reservationer frisläppta"
                : "Avbruten order"}
            {order.cancelled_reason ? ` · ${order.cancelled_reason}` : ""}
          </span>
        </div>
      )}

      {isOpen && (
        <div className="space-y-2.5 border-t-2 border-primary bg-muted/60 p-2.5">
          {/* Allergi är säkerhetskritisk och visas alltid först. */}
          {(order.allergy_note || allergens.length > 0) && (
            <div className="space-y-1.5 rounded-sm border border-destructive/40 bg-destructive/10 p-2 text-xs">
              {order.allergy_note && (
                <div className="font-semibold">Allergi: {order.allergy_note}</div>
              )}
              {allergens.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {allergens.map((a) => (
                    <Badge key={a} variant="destructive" className="text-[10px]">
                      Undvik {allergenLabel(a).toLowerCase()}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Varorna först: vad är beställt och hur mycket. */}
          {readOnly ? (
            <ul className="divide-y divide-grid-line rounded-sm border border-grid-line">
              {lines.map((l) => {
                const label = (l.products?.name || l.free_text_name || "Vara") as string;
                const struck = l.pack_status === "struken";
                return (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2.5 py-1.5 text-xs"
                  >
                    <ProductThumb
                      src={l.products?.image_url}
                      alt={label}
                      productId={l.product_id}
                      className="h-8 w-10 rounded"
                    />
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
                      {qtyText(l.quantity_packed ?? l.quantity_ordered, l.unit)} {l.unit}
                    </span>
                    {l.note && (
                      <span className="w-full text-[11px] text-muted-foreground">{l.note}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : editing ? (
            <InlineOrderEdit order={order} onClose={() => setEditing(false)} />
          ) : (
            <InlineOrderPacking order={order} onOrderPacked={() => onToggle?.(order.id)} />
          )}

          {/* Kommentaren direkt under varorna — den styr ofta packningen. */}
          {(order.note || lineNotes.length > 0) && (
            <div className="space-y-1 rounded-sm border border-grid-line bg-card p-2 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <MessageSquare className="h-3.5 w-3.5 text-primary" /> Kommentar
              </div>
              {order.note && <div className="text-muted-foreground">{order.note}</div>}
              {lineNotes.map((n, i) => (
                <div key={i} className="text-muted-foreground">
                  · {n}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-muted/50 p-2 text-xs">
            <span className="text-muted-foreground">
              {order.total_incl_vat ? "Verkligt pris" : "Uppskattat pris"}
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums">{nf(total, 2)} kr</span>
          </div>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
          >
            {showMore ? "Visa mindre" : "Visa mer"}
          </button>


          {showMore && (
            <div className="space-y-2.5">
              {/* Interna bilder på beställningen — syns aldrig på utskrifter. */}
              <div className="rounded-sm border border-grid-line bg-card p-2">
                <button
                  type="button"
                  onClick={() => setShowPhotos((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-foreground"
                >
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5 text-primary" /> Bilder på beställningen
                    {photoCount > 0 && (
                      <span className="font-mono tabular-nums text-muted-foreground">
                        ({photoCount})
                      </span>
                    )}
                    <span className="font-normal text-muted-foreground">(internt)</span>
                  </span>
                  <span className="text-primary underline-offset-2 hover:underline">
                    {showPhotos ? "Stäng" : "Öppna"}
                  </span>
                </button>
                {showPhotos && (
                  <div className="mt-2">
                    <EntityImageGallery
                      entityType="customer_order"
                      entityId={order.id}
                      title=""
                      description="Interna bilder, t.ex. packad vara eller var beställningen står. Kommer inte med på utskrifter."
                      editable={!readOnly}
                      columnsClassName="grid-cols-3 sm:grid-cols-4"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">

                <Badge variant="outline" className="text-[10px]">
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </Badge>
                <span className={`rounded-sm px-1.5 py-0.5 ${packTone[order.pack_status] ?? ""}`}>
                  {PACK_STATUS_LABELS[order.pack_status] ?? order.pack_status}
                  {packedCount > 0 && active.length > 0 ? ` ${packedCount}/${active.length}` : ""}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  {ORDER_TYPE_LABELS[order.order_type] ?? order.order_type}
                </Badge>
                {order.category === "catering" && (
                  <Badge variant="secondary" className="text-[10px]">
                    Catering
                  </Badge>
                )}
                {order.is_web_order && (
                  <>
                    <Badge className="bg-primary/15 text-[10px] text-primary hover:bg-primary/15">
                      Webborder {order.shopify_order_number ?? ""}
                    </Badge>
                    {order.web_paid && (
                      <Badge variant="secondary" className="text-[10px]">
                        Betald via webben
                      </Badge>
                    )}
                    {order.price_locked && (
                      <Badge variant="outline" className="text-[10px]">
                        Låsta priser
                      </Badge>
                    )}
                  </>
                )}
                {phoneBooked && (
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    title="Bokad per telefon av butikspersonal, numret är inte verifierat med kod"
                  >
                    Bokad per telefon
                  </Badge>
                )}
                {isBooking && !phoneBooked && (
                  <Badge variant="outline" className="text-[10px]">
                    Förbokning, kod verifierad
                  </Badge>
                )}
                {noShow && (
                  <Badge variant="destructive" className="text-[10px]">
                    Uteblev
                  </Badge>
                )}
                {order.wanted_time_window && (
                  <Badge variant="outline" className="font-mono text-[10px] tabular-nums">
                    {order.wanted_time_window}
                  </Badge>
                )}
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {order.order_number}
                </span>
              </div>

              {order.is_web_order && order.paid_total != null && (
                <div className="text-[11px] text-muted-foreground">
                  Betalt via webben: {nf(Number(order.paid_total), 2)} kr
                  {Math.abs(total - Number(order.paid_total)) > 0.5 && (
                    <span className="ml-1 font-semibold text-amber-600">
                      · vägd summa {nf(total, 2)} kr avviker, justering görs manuellt i Shopify
                    </span>
                  )}
                </div>
              )}

              <div className="grid gap-2 text-xs sm:grid-cols-2">
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

              {/* Datum och tid ändras direkt i rullgardinen, utan nytt fönster. */}
              {!readOnly && canEdit && !cancelled && !editing && (
                <div className="flex flex-wrap items-end gap-2 rounded-sm border border-grid-line bg-muted/30 p-2">
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Datum</Label>
                    <Input
                      type="date"
                      className="h-8 w-[9.5rem] font-mono text-xs tabular-nums"
                      value={order.wanted_date}
                      onChange={(e) =>
                        e.target.value &&
                        updateOrder.mutate({
                          id: order.id,
                          patch: { wanted_date: e.target.value },
                          event: {
                            type: "andrad",
                            description: `Datum ändrat till ${e.target.value}`,
                          },
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Tid</Label>
                    <Input
                      type="time"
                      className="h-8 w-[7rem] font-mono text-xs tabular-nums"
                      value={order.wanted_time ? order.wanted_time.slice(0, 5) : ""}
                      onChange={(e) =>
                        updateOrder.mutate({
                          id: order.id,
                          patch: { wanted_time: e.target.value || null },
                          event: { type: "andrad", description: "Tid ändrad" },
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {!readOnly && canEdit && !cancelled && !handedOver && order.pack_status !== "packad" && (
                  <Button
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={markPacked.isPending}
                    onClick={() => markPacked.mutate({ order })}
                  >
                    <PackageCheck className="mr-1 h-3.5 w-3.5" /> Markera packad
                  </Button>
                )}
                {!readOnly && canEdit && !cancelled && !handedOver && order.pack_status === "packad" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={markPacked.isPending}
                    onClick={() => markPacked.mutate({ order, undo: true })}
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Ångra packad
                  </Button>
                )}
                {!readOnly && canEdit && !cancelled && !handedOver && (
                  <Button
                    size="sm"
                    variant={order.pack_status === "packad" ? "default" : "outline"}
                    className="h-7 text-[11px]"
                    disabled={handOver.isPending}
                    onClick={() => handOver.mutate({ order })}
                  >
                    <PackageCheck className="mr-1 h-3.5 w-3.5" />
                    {order.order_type === "leverans" ? "Markera levererad" : "Markera hämtad"}
                  </Button>
                )}
                {!readOnly && canEdit && !cancelled && handedOver && !paid && (
                  <Button
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={markPaid.isPending}
                    onClick={() => markPaid.mutate({ order })}
                  >
                    <BadgeCheck className="mr-1 h-3.5 w-3.5" /> Markera betald
                  </Button>
                )}
                {!readOnly && canEdit && !cancelled && handedOver && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={handOver.isPending}
                    onClick={() => handOver.mutate({ order, undo: true })}
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Ångra utlämning
                  </Button>
                )}
                {!readOnly && canEdit && !cancelled && !!order.paid_at && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={markPaid.isPending}
                    onClick={() => markPaid.mutate({ order, undo: true })}
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Ångra betalning
                  </Button>
                )}

                {!readOnly && canEdit && !cancelled && (
                  <Button
                    variant={editing ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-[11px]"
                    onClick={() => setEditing((v) => !v)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Redigera order
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => printConfirmation(order)}
                >
                  <Printer className="mr-1 h-3.5 w-3.5" /> Skriv ut order
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => downloadConfirmation(order)}
                >
                  <Download className="mr-1 h-3.5 w-3.5" /> Ladda ner PDF
                </Button>
                {!readOnly && canEdit && isBooking && (
                  <Button
                    variant={noShow ? "outline" : "destructive"}
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={markNoShow.isPending}
                    onClick={() =>
                      markNoShow.mutate({
                        orderId: order.id,
                        customerId: order.customer_id,
                        orderNumber: order.order_number,
                        undo: noShow,
                      })
                    }
                  >
                    {noShow ? (
                      <>
                        <Undo2 className="mr-1 h-3.5 w-3.5" /> Ångra uteblev
                      </>
                    ) : (
                      <>
                        <UserX className="mr-1 h-3.5 w-3.5" /> Uteblev
                      </>
                    )}
                  </Button>
                )}
                {!readOnly && canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={archiveOrder.isPending}
                    onClick={() => archiveOrder.mutate({ ids: [order.id], archive: !isArchived })}
                  >
                    {isArchived ? (
                      <>
                        <ArchiveRestore className="mr-1 h-3.5 w-3.5" /> Återställ
                      </>
                    ) : (
                      <>
                        <Archive className="mr-1 h-3.5 w-3.5" /> Arkivera
                      </>
                    )}
                  </Button>
                )}
                {!readOnly && canEdit && !cancelled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] text-destructive"
                    onClick={() => setDeleteReason((v) => (v === null ? "" : null))}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Ta bort order
                  </Button>
                )}
                {!readOnly && canEdit && cancelled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={softDelete.isPending}
                    onClick={() => softDelete.mutate({ order, restore: true })}
                  >
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Återställ order
                  </Button>
                )}
              </div>

              {/* Borttagning raderar inget — ordern flyttas till Borttagna med anledning. */}
              {deleteReason !== null && !cancelled && (
                <div className="space-y-1.5 rounded-sm border border-destructive/40 bg-destructive/5 p-2">
                  <span className="text-[11px] font-semibold text-destructive">
                    Varför tas beställningen bort? Den sparas i Borttagna för historiken.
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {DELETE_REASONS.map((r) => (
                      <Button
                        key={r}
                        variant="destructive"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={softDelete.isPending}
                        onClick={() =>
                          softDelete.mutate(
                            { order, reason: r },
                            { onSuccess: () => setDeleteReason(null) },
                          )
                        }
                      >
                        {r}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => setDeleteReason(null)}
                    >
                      Avbryt
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
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
    <div className="hidden items-center border border-grid-line bg-grid-head text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
      <span className="w-1 shrink-0" aria-hidden />
      {selectable && (
        <span className="flex w-9 shrink-0 items-center justify-center border-r border-grid-line py-1">
          <Checkbox
            checked={!!allSelected}
            onCheckedChange={(v) => onSelectAll?.(!!v)}
            aria-label="Markera alla"
          />
        </span>
      )}
      <span className="flex min-w-0 flex-1 items-center px-2.5 py-1">
        <span className="w-36 shrink-0 border-r border-grid-line pr-2">Datum</span>
        <span className="w-16 shrink-0 border-r border-grid-line px-2">Art.</span>
        <span className="min-w-[14rem] flex-1 border-r border-grid-line pl-3 pr-5">Kund</span>
        <span className="w-12 shrink-0 border-r border-grid-line px-2 text-center">Ordrar</span>
        <span className="w-14 shrink-0 border-r border-grid-line px-2">Källa</span>
        <span className="w-12 shrink-0 border-r border-grid-line px-2">Kom.</span>
        <span className="w-24 shrink-0 border-r border-grid-line px-2">Status</span>
        <span className="w-24 shrink-0 border-r border-grid-line px-2 text-right">Summa (kr)</span>
        <span className="w-28 shrink-0 px-2">Butik</span>
        <span className="w-3.5 shrink-0" />
      </span>
    </div>
  );
}
