import React, { useState, useEffect, useMemo, useRef } from "react";
import { fetchPurchaseLeadDays, purchaseDateFor } from "@/lib/purchaseLead";
import { createPortal } from "react-dom";

/** På telefon läggs beställningsvyn som egen helskärm ovanpå allt; på dator ligger den kvar i sidan. */
function CreatePanelShell({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  if (!isMobile) return <>{children}</>;
  return createPortal(
    <div className="fixed inset-0 z-[70] flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">{children}</div>,
    document.body,
  );
}
import { displayOrderWeek } from "@/lib/orderWeek";
import { motion } from "framer-motion";
import {
  ShoppingCart, Plus, Search, Clock, CheckCircle2, Truck, XCircle, X, Package,
  Archive, CalendarIcon, Pencil, Send, FileText, Copy, Eye, Users, Lock,
} from "lucide-react";
import { ProductThumb } from "@/components/products/ProductThumb";
import { ProductPhotosGallery } from "@/components/products/ProductPhotos";
import { OrderPhotosButton, ORDER_PHOTO_ENTITY, ORDER_LINE_PHOTO_ENTITY } from "@/components/orders/OrderPhotos";
import { OpenOrderEditor } from "@/components/orders/OpenOrderEditor";

import DeliveryNote from "@/components/DeliveryNote";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { OrderAuditLine } from "@/components/orders/OrderAuditLine";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format, getDay } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import { useStoreTierPrices } from "@/hooks/usePriceTiers";
import { useProducts } from "@/hooks/useProducts";
import { useTransportSchedules } from "@/hooks/useTransportSchedules";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCategoryVisibility } from "@/hooks/useCategoryVisibility";
import { useSite } from "@/contexts/SiteContext";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { useCreateChangeRequest, useOrderChangeRequests, useResolveChangeRequest } from "@/hooks/useOrderChangeRequests";
import { useNotificationFlash } from "@/lib/notificationFlash";
import { thumbUrl, THUMB_CARD } from "@/lib/imageThumb";
import {
  LinePriority,
  PRIORITY_META,
  PRIORITY_ORDER,
  LinePriorityBadge,
  normalizePriority,
} from "@/components/orders/linePriority";
import { useCustomerCommitted } from "@/hooks/useCustomerCommitted";
import { useIsMobile } from "@/hooks/use-mobile";

type OrderLine = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
  category?: string | null;
  image_url?: string | null;
  /** Varför varan behövs: kundbeställt, påfyllning eller kan strykas. */
  priority: LinePriority;
  /** Hur mycket av raden som är låst till kund (endast vid "måste med"). */
  priorityQty: string;
  priorityNote: string;
  /** "customer" = raden kommer ur butikens kundbeställningar, annars butikens egen rad. */
  source?: "customer" | "manual";
  /** Mängd låst till riktig kund (ur kundbeställningarna). */
  customerQty?: number;
  customerNames?: string[];
  /** Butikens egen påfyllning till kyldisken, ovanpå kundmängden. */
  topUpQty?: string;
  /** Sant när någon kundbeställning har en önskad dag före valt leveransdatum. */
  late?: boolean;
};


const statusColor: Record<string, string> = {
  Öppen: "bg-warning/15 text-warning border-warning/30",
  Ny: "",
  Pågående: "bg-warning/15 text-warning border-warning/20",
  Packad: "bg-success/15 text-success border-success/20",
  Skickad: "bg-primary/15 text-primary border-primary/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
  Arkiverad: "bg-muted text-muted-foreground border-border",
};

const statusIcon: Record<string, React.ReactNode> = {
  Öppen: <Users className="h-3 w-3" />,
  Ny: <Clock className="h-3 w-3" />,
  Pågående: <Clock className="h-3 w-3" />,
  Packad: <Package className="h-3 w-3" />,
  Skickad: <Truck className="h-3 w-3" />,
  Levererad: <CheckCircle2 className="h-3 w-3" />,
  Avbruten: <XCircle className="h-3 w-3" />,
  Arkiverad: <Archive className="h-3 w-3" />,
};

const statusSegmentColor: Record<string, string> = {
  "": "transparent",
  "Ny": "transparent",
  "Pågående": "#fef3c7",
  "Beställd": "#e9d5ff",
  "Producerad": "#dbeafe",
  "Packad": "#d1fae5",
  "Skickad": "#bbf7d0",
  "Levererad": "#bbf7d0",
  "Klar / Levererad": "#bbf7d0",
  "Ej tillgänglig": "#fee2e2",
  "Avbruten": "#fee2e2",
};

const rowBgByStatus: Record<string, string> = {
  "": "",
  "Ny": "",
  "Pågående": "bg-amber-50 dark:bg-amber-950/20",
  "Beställd": "bg-purple-50 dark:bg-purple-950/20",
  "Producerad": "bg-blue-50 dark:bg-blue-950/20",
  "Packad": "bg-emerald-50 dark:bg-emerald-950/20",
  "Skickad": "bg-green-50 dark:bg-green-950/20",
  "Levererad": "bg-green-50 dark:bg-green-950/20",
  "Klar / Levererad": "bg-green-50 dark:bg-green-950/20",
  "Ej tillgänglig": "bg-red-50 dark:bg-red-950/20",
  "Avbruten": "bg-red-50 dark:bg-red-950/20",
};

function buildProgressGradient(lines: any[]): string {
  if (!lines || lines.length === 0) return "transparent";
  const total = lines.length;
  const segments: string[] = [];
  let pos = 0;
  for (const line of lines) {
    const color = statusSegmentColor[line.status || ""] || "transparent";
    const start = (pos / total) * 100;
    const end = ((pos + 1) / total) * 100;
    segments.push(`${color} ${start}%`, `${color} ${end}%`);
    pos++;
  }
  return `linear-gradient(to bottom, ${segments.join(", ")})`;
}

const LIVE_STATUSES = ["Öppen", "Ny", "Pågående", "Packad", "Skickad"];
const DONE_STATUSES = ["Levererad", "Klar / Levererad", "Arkiverad", "Avbruten"];

const FOLLJESEDEL_STATUSES = ["Skickad", "Levererad", "Klar / Levererad", "Arkiverad"];

function OrderTable({ orders, emptyMsg, products, toast, allowedWeekdays, isDateDisabled }: {
  orders: any[];
  emptyMsg: string;
  products: any[];
  toast: any;
  allowedWeekdays: Set<number> | null;
  isDateDisabled: (date: Date) => boolean;
}) {
  const { flashClass } = useNotificationFlash("shop_order");
  const [FolljesedelOrder, setFolljesedelOrder] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <>
      {/* Mobil — ett kort per beställning, inga tabeller */}
      <div className="sm:hidden space-y-3">
        {orders.length === 0 && (
          <Card className="shadow-card">
            <CardContent className="p-6 text-center text-[16px] text-muted-foreground">{emptyMsg}</CardContent>
          </Card>
        )}
        {orders.map((o: any) => {
          const lines = o.shop_order_lines || [];
          const hasFolljesedel = FOLLJESEDEL_STATUSES.includes(o.status);
          const isExpanded = expandedId === o.id;
          return (
            <Card key={o.id} className={`shadow-card overflow-hidden ${rowBgByStatus[o.status] || ""} ${flashClass(o.id)}`}>
              <button
                type="button"
                onClick={() => toggleExpand(o.id)}
                className="w-full px-4 py-3 text-left active:bg-muted/50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[20px] font-semibold leading-tight text-foreground">
                      {o.stores?.name || "Butik"}
                    </p>
                    <p className="mt-0.5 text-[15px] text-muted-foreground">
                      {displayOrderWeek(o)} · lagd {new Date(o.created_at).toLocaleDateString("sv-SE")}
                    </p>
                  </div>
                  {o.status === "Öppen" && o.open_locked_at ? (
                    <Badge variant="outline" className="shrink-0 gap-1 border-success/30 bg-success/15 text-success text-[13px]">
                      <Lock className="h-3.5 w-3.5" /> Låst
                    </Badge>
                  ) : (
                    <Badge variant="outline" className={`shrink-0 gap-1 text-[13px] ${statusColor[o.status] || ""}`}>
                      {statusIcon[o.status]}
                      {o.status}
                    </Badge>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-[12px] uppercase tracking-wide text-muted-foreground">Önskad leverans</dt>
                    <dd className="text-[17px] font-medium text-foreground">{o.desired_delivery_date || "–"}</dd>
                  </div>
                  <div>
                    <dt className="text-[12px] uppercase tracking-wide text-muted-foreground">Rader</dt>
                    <dd className="text-[17px] font-medium text-foreground">{lines.length}</dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <p className="text-[12px] uppercase tracking-wide text-muted-foreground">Produkter</p>
                  {lines.length === 0 ? (
                    <p className="text-[16px] text-warning">Ofullständig — rader saknas</p>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {lines.slice(0, isExpanded ? lines.length : 4).map((l: any) => (
                        <li key={l.id ?? l.products?.name} className="text-[16px] leading-snug text-foreground">
                          {l.products?.name} <span className="text-muted-foreground">({l.quantity_ordered} {l.unit || ""})</span>
                        </li>
                      ))}
                      {!isExpanded && lines.length > 4 && (
                        <li className="text-[15px] text-muted-foreground">+ {lines.length - 4} fler</li>
                      )}
                    </ul>
                  )}
                </div>

                {o.notes ? (
                  <p className="mt-3 rounded-md bg-muted/60 px-3 py-2 text-[15px] leading-snug">{o.notes}</p>
                ) : null}

                <p className="mt-3 text-[15px] font-medium text-primary">
                  {isExpanded ? "Stäng beställningen" : "Tryck för att öppna"}
                </p>
              </button>

              {hasFolljesedel && (
                <div className="border-t border-border px-4 py-3">
                  <Button
                    variant="outline"
                    className="h-14 w-full gap-2 text-[17px]"
                    onClick={(e) => { e.stopPropagation(); setFolljesedelOrder(o); }}
                  >
                    <FileText className="h-5 w-5" /> Skriv ut följesedel
                  </Button>
                </div>
              )}

              {isExpanded && (
                <div className="border-t border-border bg-card px-3 py-3">
                  {o.status === "Öppen" ? (
                    <OpenOrderEditor
                      order={o}
                      products={products}
                      toast={toast}
                      allowedWeekdays={allowedWeekdays}
                      isDateDisabled={isDateDisabled}
                      onClose={() => setExpandedId(null)}
                    />
                  ) : (
                    <OrderDetailWithEdit
                      order={o}
                      products={products}
                      onClose={() => setExpandedId(null)}
                      toast={toast}
                      allowedWeekdays={allowedWeekdays}
                      isDateDisabled={isDateDisabled}
                      inline
                    />
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Dator — tabellen oförändrad */}
      <Card className="hidden shadow-card sm:block">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">VECKA</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">DATUM</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">BUTIK</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">ÖNSKAD LEV.</th>
                  <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">RADER</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">PRODUKTER</th>
                  <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">ANTECKNING</th>
                  <th className="px-1.5 py-0.5 text-center font-medium text-muted-foreground">FÖLJESEDEL</th>
                  <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{emptyMsg}</td></tr>
                )}
                {orders.map((o: any) => {
                  const lines = o.shop_order_lines || [];
                  const hasFolljesedel = FOLLJESEDEL_STATUSES.includes(o.status);
                  const isExpanded = expandedId === o.id;
                  return (
                    <React.Fragment key={o.id}>
                      <tr
                        className={`border-b border-border/40 h-7 transition-colors cursor-pointer hover:bg-muted/30 ${isExpanded ? "bg-primary/10 border-l-2 border-l-primary border-b-0" : ""} ${flashClass(o.id)}`}
                        style={{ background: isExpanded ? undefined : buildProgressGradient(lines) }}
                        onClick={() => toggleExpand(o.id)}
                      >
                        <td className="px-1.5 py-0.5 font-mono font-medium text-foreground">{displayOrderWeek(o)}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">{o.stores?.name || "–"}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">{o.desired_delivery_date || "–"}</td>
                        <td className="px-1.5 py-0.5 text-right text-foreground">{lines.length}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground text-[10px] max-w-48 truncate">
                          {lines.length === 0 ? (
                            <span className="text-warning" title="Orderraderna finns inte kvar i systemet — ordern är historiskt ofullständig.">Ofullständig — rader saknas</span>
                          ) : (
                            lines.map((l: any) => `${l.products?.name} (${l.quantity_ordered} ${l.unit || ""})`).join(", ")
                          )}
                        </td>

                        <td className="px-1.5 py-0.5 text-muted-foreground text-[10px] max-w-32 truncate">{o.notes || "–"}</td>
                        <td className="px-1.5 py-0.5 text-center">
                          {hasFolljesedel ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-5 text-[9px] gap-1 px-1.5"
                              onClick={(e) => { e.stopPropagation(); setFolljesedelOrder(o); }}
                            >
                              <FileText className="h-2.5 w-2.5" /> Skriv ut
                            </Button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-1.5 py-0.5 text-right">
                          {o.status === "Öppen" && o.open_locked_at ? (
                            <Badge variant="outline" className="border-success/30 bg-success/15 text-success text-[10px] gap-1">
                              <Lock className="h-3 w-3" /> Låst
                            </Badge>
                          ) : (
                            <Badge variant="outline" className={`${statusColor[o.status] || ""} text-[10px] gap-1`}>
                              {statusIcon[o.status]}
                              {o.status}
                            </Badge>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <div className="border-l-2 border-l-primary bg-card px-3 py-2 space-y-2">
                              {o.status === "Öppen" ? (
                                <OpenOrderEditor
                                  order={o}
                                  products={products}
                                  toast={toast}
                                  allowedWeekdays={allowedWeekdays}
                                  isDateDisabled={isDateDisabled}
                                  onClose={() => setExpandedId(null)}
                                />
                              ) : (
                              <OrderDetailWithEdit
                                order={o}
                                products={products}
                                onClose={() => setExpandedId(null)}
                                toast={toast}
                                allowedWeekdays={allowedWeekdays}
                                isDateDisabled={isDateDisabled}
                                inline
                              />
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      <DeliveryNote order={FolljesedelOrder} open={!!FolljesedelOrder} onOpenChange={(open) => { if (!open) setFolljesedelOrder(null); }} />
    </>
  );
}

export default function ShopOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeStoreId } = useSite();
  const { activeUser } = useActiveUser();
  const { data: currentStaff } = useCurrentStaff();
  const loggedInName = staffFullName(currentStaff);
  const { data: products = [] } = useProducts();
  /** Butikens gällande inköpspriser: låsta priser eller cirkapriser från tidigare inleveranser. */
  const { data: tierPrices } = useStoreTierPrices(activeStoreId);

  const { isCategoryVisible } = useCategoryVisibility(activeStoreId);
  const { data: transportSchedules = [] } = useTransportSchedules();
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [confirmSendOpen, setConfirmSendOpen] = useState(false);
  const [mobileCalendarOpen, setMobileCalendarOpen] = useState(false);
  const [search, setSearch] = useState("");
  
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [focusProductId, setFocusProductId] = useState<string | null>(null);
  const [previewProduct, setPreviewProduct] = useState<any | null>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const startNewOrder = () => {
    setCreatingOrder(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  };


  // Fetch active store details to determine zone
  const { data: activeStore } = useQuery({
    queryKey: ["store-detail", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return null;
      const { data } = await supabase.from("stores").select("*").eq("id", activeStoreId).single();
      return data;
    },
    enabled: !!activeStoreId,
  });

  // Determine allowed departure weekdays for this store's zone
  const allowedWeekdays = useMemo(() => {
    if (!activeStore) return null; // null = no restriction yet
    const city = (activeStore.city || "").toLowerCase();
    const name = (activeStore.name || "").toLowerCase();
    let zoneKey = "international";
    if (city.includes("göteborg") || city.includes("gothenburg") || name.includes("göteborg") || name.includes("amhult") || name.includes("särö")) zoneKey = "gothenburg";
    else if (city.includes("stockholm") || name.includes("stockholm") || name.includes("kungsholmen") || name.includes("ålsten")) zoneKey = "stockholm";
    
    // Svenska butiker (Göteborg/Stockholm) får välja alla dagar i veckan
    if (zoneKey !== "international") return null;

    const days = transportSchedules.filter(s => s.zone_key === zoneKey).map(s => s.departure_weekday);
    return days.length > 0 ? new Set(days) : null;
  }, [activeStore, transportSchedules]);

  // Disable dates that are not valid departure weekdays AND past dates
  const isDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;
    if (!allowedWeekdays) return false;
    const jsDay = getDay(date); // 0=Sun
    const isoDay = jsDay === 0 ? 7 : jsDay;
    return !allowedWeekdays.has(isoDay);
  };

  // Order form
  const [orderNote, setOrderNote] = useState("");
  // Datumfönstret stängs så snart ett datum valts (klick eller Enter) och
  // fokus flyttas vidare till nästa fråga — anteckningsfältet.
  const [dateOpen, setDateOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const pickDate = (d?: Date) => {
    setDesiredDeliveryDate(d);
    if (!d) return;
    setDateOpen(false);
    setTimeout(() => noteRef.current?.focus(), 60);
  };
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const isMobile = useIsMobile();
  /** Kundbeställda mängder i butiken — underlag för "måste med"-förslag. */
  const { data: customerCommitted = new Map() } = useCustomerCommitted(activeStoreId);
  const [productSearch, setProductSearch] = useState("");
  const [desiredDeliveryDate, setDesiredDeliveryDate] = useState<Date | undefined>(undefined);

  // Fetch shop orders with lines
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["shop-orders-shop", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return [];
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, stores(name, address, phone, city), shop_order_lines(*, products(name, unit, category, image_url, hs_code, weight_per_piece, wholesale_price))")
        .eq("store_id", activeStoreId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Realtime subscription for live status updates
  useEffect(() => {
    if (!activeStoreId) return;
    const channel = supabase
      .channel(`shop-order-lines-${activeStoreId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_order_lines" },
        () => {
          qc.invalidateQueries({ queryKey: ["shop-orders-shop", activeStoreId] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_orders", filter: `store_id=eq.${activeStoreId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["shop-orders-shop", activeStoreId] });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeStoreId, qc]);


  // Split orders
  const liveOrders = useMemo(() => orders.filter((o: any) => LIVE_STATUSES.includes(o.status)), [orders]);
  const doneOrders = useMemo(() => orders.filter((o: any) => DONE_STATUSES.includes(o.status)), [orders]);

  const filteredProducts = products.filter(p =>
    isCategoryVisible(p.category) &&
    productSearch &&
    (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
     p.sku.toLowerCase().includes(productSearch.toLowerCase())) &&
    !orderLines.find(l => l.product_id === p.id)
  )
    .slice()
    .sort((a: any, b: any) =>
      (a.category || "Övrigt").localeCompare(b.category || "Övrigt", "sv") ||
      (a.name || "").localeCompare(b.name || "", "sv")
    )
    .slice(0, 12);

  // Sökresultat grupperade per kategori
  const groupedSearchResults = useMemo(() => {
    const groups = new Map<string, any[]>();
    filteredProducts.forEach(p => {
      const cat = p.category || "Övrigt";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(p);
    });
    return Array.from(groups.entries());
  }, [filteredProducts]);

  // Tillagda rader grupperade per kategori (behåller index mot orderLines)
  const groupedOrderLines = useMemo(() => {
    const groups = new Map<string, { line: OrderLine; idx: number }[]>();
    orderLines.forEach((line, idx) => {
      const cat = line.category || "Övrigt";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push({ line, idx });
    });
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0], "sv"))
      .map(([cat, items]) => [
        cat,
        items.slice().sort((a, b) => a.line.product_name.localeCompare(b.line.product_name, "sv")),
      ] as [string, { line: OrderLine; idx: number }[]]);
  }, [orderLines]);

  const addProduct = (p: any) => {
    setOrderLines(prev => [{
      product_id: p.id, product_name: p.name, unit: p.unit, quantity: "", category: p.category || null, image_url: (p as any).image_url ?? null,
      priority: "nice" as LinePriority, priorityQty: "", priorityNote: "",
    }, ...prev]);
    setProductSearch("");
    setHighlightedIndex(-1);
    setFocusProductId(p.id);
  };

  // Efter att en produkt lagts till: hoppa direkt till antal-fältet
  useEffect(() => {
    if (!focusProductId) return;
    const el = qtyRefs.current[focusProductId];
    if (el) {
      el.focus();
      el.select?.();
      setFocusProductId(null);
    }
  }, [focusProductId, groupedOrderLines]);



  const updateLine = (idx: number, qty: string) => {
    setOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: qty } : l));
  };

  /**
   * Butikens egen påfyllning på en kundrad. Radens totala mängd är alltid
   * kundbeställd mängd + påfyllning, så kundens del kan aldrig skrivas bort.
   */
  const setTopUp = (idx: number, value: string) => {
    setOrderLines(prev =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const top = Number(String(value).replace(",", ".")) || 0;
        const total = (l.customerQty ?? 0) + Math.max(0, top);
        return { ...l, topUpQty: value, quantity: total > 0 ? String(Number(total.toFixed(1))) : "" };
      }),
    );
  };

  /** Sätter prioritet på en rad. "Måste med" förifylls med hela raden som kritisk mängd. */
  const setLinePriority = (idx: number, priority: LinePriority) => {
    setOrderLines(prev =>
      prev.map((l, i) =>
        i === idx
          ? {
              ...l,
              priority,
              priorityQty:
                priority === "must"
                  ? l.priorityQty ||
                    String(customerCommitted.get(l.product_id)?.quantity ?? l.quantity ?? "")
                  : "",
              priorityNote: priority === "must" ? l.priorityNote : "",
            }
          : l,
      ),
    );
  };

  const setLineField = (idx: number, field: "priorityQty" | "priorityNote", value: string) => {
    setOrderLines(prev => prev.map((l, i) => (i === idx ? { ...l, [field]: value } : l)));
  };

  const removeLine = (idx: number) => {
    setOrderLines(prev => prev.filter((_, i) => i !== idx));
  };

  /** asOpen = spara som öppen beställning som stannar hos butiken. */
  const handleCreateOrder = async (asOpen = false) => {
    const validLines = orderLines.filter(l => l.quantity && Number(l.quantity) > 0);
    if (validLines.length === 0) return;
    if (!desiredDeliveryDate && !asOpen) {
      toast({ title: "Välj avgångsdatum", description: "Du måste välja ett avgångsdatum innan du kan skicka beställningen.", variant: "destructive" });
      return;
    }


    if (!activeStoreId) {
      toast({ title: "Ingen butik vald", variant: "destructive" });
      return;
    }

    const weekNum = `V${Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`;

    const { data: order, error } = await supabase
      .from("shop_orders")
      .insert({
        store_id: activeStoreId,
        order_week: weekNum,
        notes: orderNote || null,
        status: asOpen ? "Öppen" : "Ny",
        created_by: loggedInName,
        desired_delivery_date: desiredDeliveryDate ? format(desiredDeliveryDate, "yyyy-MM-dd") : null,
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    const deliveryDateStr = desiredDeliveryDate ? format(desiredDeliveryDate, "yyyy-MM-dd") : null;
    // Varje rad blir ett inköpsbehov: kokas/filéas varan köps den dagen innan leverans.
    const leadMap = await fetchPurchaseLeadDays(validLines.map(l => l.product_id));
    const lines = validLines.map(l => ({
      shop_order_id: order.id,
      product_id: l.product_id,
      quantity_ordered: Number(l.quantity),
      unit: l.unit,
      delivery_date: deliveryDateStr,
      order_date: purchaseDateFor(deliveryDateStr, leadMap.get(l.product_id) ?? 0),
      priority: l.priority,
      // Kritisk mängd får aldrig överstiga det som faktiskt beställts.
      priority_qty:
        l.priority === "must"
          ? Math.min(Number(l.priorityQty) || Number(l.quantity), Number(l.quantity))
          : null,
      priority_note: l.priority === "must" ? l.priorityNote?.trim() || null : null,
      priority_set_by: l.priority === "must" ? loggedInName || null : null,
      priority_set_at: l.priority === "must" ? new Date().toISOString() : null,
    }));

    const { error: lineError } = await supabase.from("shop_order_lines").insert(lines);
    if (lineError) {
      toast({ title: "Fel vid orderrader", description: lineError.message, variant: "destructive" });
      return;
    }

    const userName = loggedInName ?? undefined;
    await logActivity({
      action_type: "create",
      description: `${asOpen ? "Öppen beställning startad" : "Ny butiksorder skapad"} av ${userName || "okänd"} (${weekNum}, ${validLines.length} rader)`,
      portal: "shop",
      store_id: activeStoreId,
      entity_type: "shop_order",
      entity_id: order.id,
      performed_by: userName,
    });

    toast(
      asOpen
        ? { title: "Öppen beställning skapad", description: "Alla i butiken kan fylla på den tills du skickar den." }
        : { title: "Beställning skickad!", description: `${validLines.length} produkter beställda` },
    );
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    setCreatingOrder(false);
    setOrderLines([]);
    setOrderNote("");
    setDesiredDeliveryDate(undefined);
  };


  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Beställningar
          </h1>
          <p className="text-[15px] sm:text-xs text-muted-foreground mt-0.5">Beställ produkter från grossist/produktion och följ leveransstatus.</p>
        </div>
        <Button
          size="sm"
          className="h-14 w-full gap-2 text-[17px] sm:h-8 sm:w-auto sm:gap-1.5 sm:text-xs"
          onClick={startNewOrder}
        >
          <Plus className="h-5 w-5 sm:h-3.5 sm:w-3.5" /> Ny beställning
        </Button>
      </div>

      {/* Aktiva beställningar — tidigare ordrar visas inte i butiksportalen */}
      {!creatingOrder && (
        <OrderTable
          orders={liveOrders}
          products={products}
          toast={toast}
          allowedWeekdays={allowedWeekdays}
          isDateDisabled={isDateDisabled}
          emptyMsg="Inga aktiva beställningar just nu. Klicka &quot;Ny beställning&quot; för att börja."
        />
      )}


      {/* Inline order creation view */}
      {creatingOrder && (
        <CreatePanelShell>
        <Card className="flex min-h-0 flex-1 flex-col rounded-none border-0 shadow-none sm:block sm:rounded-lg sm:border sm:shadow-card">
          <CardHeader className="shrink-0 border-b border-border pb-3 sm:border-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="font-heading text-lg sm:text-base">Ny beställning till grossist</CardTitle>
                <CardDescription className="hidden sm:block sm:text-xs">
                  Sök produkt, skriv antal — och fortsätt söka nästa produkt. Allt du lägger till hamnar i
                  <strong className="text-foreground"> samma beställning</strong>. Skicka först när allt är med.
                </CardDescription>
                <CardDescription className="text-[15px] sm:hidden">
                  Sök en produkt, skriv antal, sök nästa. Allt hamnar i samma beställning.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-12 w-12 shrink-0 sm:h-7 sm:w-7"
                aria-label="Stäng"
                onClick={() => setCreatingOrder(false)}
              >
                <X className="h-6 w-6 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-2 sm:overflow-visible">
            {/* Copy last order + Product search */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sticky top-0 z-20 bg-card pb-2 sm:static sm:bg-transparent sm:pb-0">
              <div className="relative flex-1">
                <Label className="text-sm font-semibold mb-1.5 block sm:text-xs sm:font-medium">
                  1. Lägg till produkter <span className="font-normal text-muted-foreground">(en åt gången — de samlas i samma beställning)</span>
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Sök produkt (namn eller SKU)..."
                    value={productSearch}
                    enterKeyHint="done"
                    onChange={e => { setProductSearch(e.target.value); setHighlightedIndex(-1); }}
                    onKeyDown={e => {
                      if (filteredProducts.length === 0) return;
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHighlightedIndex(prev => (prev + 1) % filteredProducts.length);
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHighlightedIndex(prev => (prev <= 0 ? filteredProducts.length - 1 : prev - 1));
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const pick = highlightedIndex >= 0 ? filteredProducts[highlightedIndex] : filteredProducts[0];
                        if (pick) addProduct(pick);
                      }
                    }}
                    className="pl-9 h-12 text-base sm:pl-8 sm:h-8 sm:text-xs"
                  />
                </div>
                {filteredProducts.length > 0 && (
                  <div className="relative z-30 mt-1 w-full max-h-[38dvh] overflow-y-auto rounded-md border border-border bg-popover shadow-lg sm:absolute sm:max-h-60">
                    {groupedSearchResults.map(([cat, prods]) => (
                      <div key={cat}>
                        <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground bg-muted/50 sticky top-0">
                          ▸ {cat}
                        </div>
                        {prods.map((p: any) => {
                          const idx = filteredProducts.indexOf(p);
                          return (
                            <div
                              key={p.id}
                              role="button"
                              tabIndex={-1}
                              className={`w-full min-h-14 text-left px-3 py-3 text-[16px] flex items-center gap-2 cursor-pointer sm:min-h-0 sm:py-2 sm:text-xs ${idx === highlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`}
                              onClick={() => addProduct(p)}
                              onMouseEnter={() => setHighlightedIndex(idx)}
                            >
                              <ProductThumb src={(p as any).image_url} alt={p.name} static className="w-7 h-5" />
                              <span className="font-medium text-foreground flex-1 truncate">{p.name}</span>
                              <span className="text-muted-foreground font-mono text-[10px]">{p.sku} · {p.unit}</span>
                              <button
                                type="button"
                                title="Visa produkt"
                                aria-label={`Visa ${p.name}`}
                                className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground"
                                onClick={(e) => { e.stopPropagation(); setPreviewProduct(p); }}
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}


              </div>
              <Select
                value=""
                onValueChange={(orderId) => {
                  const picked = orders.find((o: any) => o.id === orderId);
                  if (!picked?.shop_order_lines?.length) {
                    toast({ title: "Ingen rader att kopiera", variant: "destructive" });
                    return;
                  }
                  const copied: OrderLine[] = picked.shop_order_lines.map((l: any) => ({
                    product_id: l.product_id,
                    product_name: l.products?.name || "–",
                    unit: l.unit || l.products?.unit || "ST",
                    quantity: String(l.quantity_ordered || ""),
                    category: l.products?.category || null,
                    image_url: l.products?.image_url ?? null,
                    priority: normalizePriority(l.priority),
                    priorityQty: l.priority_qty != null ? String(l.priority_qty) : "",
                    priorityNote: l.priority_note || "",
                  }));

                  setOrderLines(copied);
                  toast({ title: "Order kopierad", description: `${copied.length} produkter tillagda från vecka ${displayOrderWeek(picked)}` });
                }}
              >
                <SelectTrigger className="h-8 text-xs w-auto gap-1.5 whitespace-nowrap" disabled={orders.length === 0}>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Kopiera tidigare order</span>
                </SelectTrigger>
                <SelectContent>
                  {orders.map((o: any) => (
                    <SelectItem key={o.id} value={o.id} className="text-xs">
                      {displayOrderWeek(o)} — {o.stores?.name} ({new Date(o.created_at).toLocaleDateString("sv-SE")})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Order lines */}
            {orderLines.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-foreground sm:text-xs sm:font-medium sm:text-muted-foreground">
                    2. I beställningen: {orderLines.length} produkt{orderLines.length > 1 ? "er" : ""}
                  </div>
                  <Button
                    variant="outline"
                    className="h-10 gap-1.5 text-sm sm:hidden"
                    onClick={() => {
                      searchInputRef.current?.focus();
                      searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                  >
                    <Plus className="h-4 w-4" /> Fler produkter
                  </Button>
                </div>
                {isMobile ? (
                  <div className="space-y-3">
                    {groupedOrderLines.map(([cat, items]) => (
                      <div key={cat} className="space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{cat}</div>
                        {items.map(({ line, idx }) => {
                          const tp = tierPrices?.get(line.product_id);
                          const unitPrice = tp ? Number(tp.price) : 0;
                          const cur = tp?.currency || activeStore?.currency || "SEK";
                          const qty = Number(String(line.quantity).replace(",", ".")) || 0;
                          const committed = customerCommitted.get(line.product_id);
                          const isCustomerLine = line.source === "customer";
                          const custQty = line.customerQty ?? 0;
                          const topUp = Number(String(line.topUpQty ?? "").replace(",", ".")) || 0;
                          const setQty = (v: number) =>
                            isCustomerLine
                              ? setTopUp(idx, v - custQty <= 0 ? "" : String(Number((v - custQty).toFixed(1))))
                              : updateLine(idx, v <= 0 ? "" : String(Number(v.toFixed(1))));
                          return (
                            <div key={line.product_id} className="rounded-xl border border-border bg-background p-3 space-y-3">
                              <div className="flex items-start gap-2">
                                <ProductThumb src={line.image_url} alt={line.product_name} static className="w-14 h-10" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-base font-semibold leading-snug text-foreground break-words">{line.product_name}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {line.unit}
                                    {unitPrice > 0 && ` · ${unitPrice.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`}
                                  </p>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-10 w-10 text-destructive"
                                  aria-label={`Ta bort ${line.product_name}`}
                                  onClick={() => removeLine(idx)}
                                >
                                  <X className="h-5 w-5" />
                                </Button>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-muted-foreground w-14">Antal</span>
                                <Button
                                  variant="outline"
                                  className="h-12 w-12 text-xl font-bold shrink-0"
                                  aria-label="Minska antal"
                                  onClick={() => setQty(qty - 1)}
                                >
                                  –
                                </Button>
                                <Input
                                  ref={el => { qtyRefs.current[line.product_id] = el; }}
                                  type="number"
                                  inputMode="decimal"
                                  enterKeyHint="next"
                                  step="0.1"
                                  value={line.quantity}
                                  onChange={e => updateLine(idx, e.target.value)}
                                  onFocus={e => e.currentTarget.select()}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      searchInputRef.current?.focus();
                                    }
                                  }}
                                  className="h-12 flex-1 text-center text-lg font-semibold"
                                  placeholder="0"
                                />
                                <Button
                                  variant="outline"
                                  className="h-12 w-12 text-xl font-bold shrink-0"
                                  aria-label="Öka antal"
                                  onClick={() => setQty(qty + 1)}
                                >
                                  +
                                </Button>
                                <span className="text-sm text-muted-foreground w-8">{line.unit}</span>
                              </div>
                              {unitPrice > 0 && qty > 0 && (
                                <p className="text-right text-xs font-mono tabular-nums text-muted-foreground">
                                  {(unitPrice * qty).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} {cur}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-1.5">
                                {PRIORITY_ORDER.map((p) => {
                                  const meta = PRIORITY_META[p];
                                  const Icon = meta.icon;
                                  const active = line.priority === p;
                                  return (
                                    <button
                                      key={p}
                                      type="button"
                                      onClick={() => setLinePriority(idx, p)}
                                      aria-pressed={active}
                                      className={cn(
                                        "flex h-10 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold",
                                        active ? meta.chip : "border-border/60 text-muted-foreground",
                                      )}
                                    >
                                      <Icon className="h-4 w-4" />
                                      {meta.label}
                                    </button>
                                  );
                                })}
                              </div>
                              {line.priority === "must" && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <Input
                                    type="number"
                                    inputMode="decimal"
                                    step="0.1"
                                    value={line.priorityQty}
                                    onChange={(e) => setLineField(idx, "priorityQty", e.target.value)}
                                    onFocus={(e) => e.currentTarget.select()}
                                    className="h-11 w-24 text-right text-base"
                                    placeholder={line.unit}
                                  />
                                  <span className="text-xs text-muted-foreground">{line.unit} till kund</span>
                                  <Input
                                    value={line.priorityNote}
                                    onChange={(e) => setLineField(idx, "priorityNote", e.target.value)}
                                    className="h-11 w-full text-base"
                                    placeholder="Kund / hämtdag"
                                  />
                                </div>
                              )}
                              {isCustomerLine && (
                                <div className="rounded-lg border border-success/40 bg-success/10 px-2.5 py-2 text-xs text-foreground space-y-1">
                                  <p className="font-semibold text-success">
                                    Kundbeställt {custQty.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {line.unit}
                                    {line.customerNames && line.customerNames.length > 0 && ` – ${line.customerNames.slice(0, 3).join(", ")}`}
                                  </p>
                                  <p className="text-muted-foreground">
                                    Påfyllning till kyldisken: {topUp.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {line.unit}
                                    {line.late && " · försenad kundbeställning"}
                                  </p>
                                </div>
                              )}
                              {!isCustomerLine && committed && committed.quantity > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLinePriority(idx, "must");
                                    setLineField(idx, "priorityQty", String(committed.quantity));
                                  }}
                                  className="text-left text-xs text-destructive underline-offset-2 hover:underline"
                                >
                                  {committed.quantity.toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {committed.unit} kundbeställt
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Enhet</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground w-32">Antal</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Pris</th>
                        <th className="pb-2 text-right font-medium text-muted-foreground">Radvärde</th>
                        <th className="pb-2 text-left font-medium text-muted-foreground">Varför</th>
                        <th className="pb-2 w-8"></th>
                      </tr>

                    </thead>
                    <tbody>
                      {groupedOrderLines.map(([cat, items]) => (
                        <React.Fragment key={cat}>
                          <tr className="bg-muted/40">
                            <td colSpan={7} className="py-1 px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                              ▸ {cat} ({items.length})
                            </td>
                          </tr>
                          {items.map(({ line, idx }) => (
                            <tr key={line.product_id} className="border-b border-border/30">
                              <td className="py-2 font-medium text-foreground">
                                <div className="flex items-center gap-2">
                                  <ProductThumb src={line.image_url} alt={line.product_name} static className="w-7 h-5" />
                                  <span className="truncate">{line.product_name}</span>
                                </div>
                              </td>
                              <td className="py-2 text-muted-foreground">{line.unit}</td>
                              <td className="py-2 text-right">
                                {line.source === "customer" ? (
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="font-mono tabular-nums text-sm font-semibold text-foreground">
                                      {(Number(line.quantity) || 0).toLocaleString("sv-SE", { maximumFractionDigits: 1 })} {line.unit}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] text-muted-foreground">Påfyllning</span>
                                      <Input
                                        ref={el => { qtyRefs.current[line.product_id] = el; }}
                                        type="number"
                                        inputMode="decimal"
                                        step="0.1"
                                        value={line.topUpQty ?? ""}
                                        onChange={e => setTopUp(idx, e.target.value)}
                                        onFocus={e => e.currentTarget.select()}
                                        className="h-8 w-16 text-right text-xs"
                                        placeholder="0"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                <Input
                                  ref={el => { qtyRefs.current[line.product_id] = el; }}
                                  type="number"
                                  inputMode="decimal"
                                  enterKeyHint="next"
                                  step="0.1"
                                  value={line.quantity}
                                  onChange={e => updateLine(idx, e.target.value)}
                                  onFocus={e => e.currentTarget.select()}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") {
                                      e.preventDefault();
                                      searchInputRef.current?.focus();
                                    }
                                  }}
                                  className="h-9 text-sm w-24 ml-auto text-right"
                                  placeholder="0"
                                />
                                )}
                              </td>
                              {(() => {
                                const tp = tierPrices?.get(line.product_id);
                                const unitPrice = tp ? Number(tp.price) : 0;
                                const cur = tp?.currency || activeStore?.currency || "SEK";
                                const locked = tp?.lock_mode === "locked";
                                const qty = Number(String(line.quantity).replace(",", ".")) || 0;
                                return (
                                  <>
                                    <td className="py-2 text-right">
                                      {unitPrice > 0 ? (
                                        <div className="space-y-0.5">
                                          <div className="font-mono tabular-nums text-foreground">
                                            {unitPrice.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cur}
                                          </div>
                                          <Badge
                                            variant="outline"
                                            className={cn("text-[9px]", locked ? "border-success/40 text-success" : "text-muted-foreground")}
                                          >
                                            {locked ? "Fast pris" : "Cirkapris"}
                                          </Badge>
                                        </div>
                                      ) : (
                                        <span className="text-muted-foreground">–</span>
                                      )}
                                    </td>
                                    <td className="py-2 text-right font-mono tabular-nums text-foreground">
                                      {unitPrice > 0 && qty > 0
                                        ? `${(unitPrice * qty).toLocaleString("sv-SE", { maximumFractionDigits: 0 })} ${cur}`
                                        : "–"}
                                    </td>
                                  </>
                                );
                              })()}

                              <td className="py-2">
                                {(() => {
                                  const committed = customerCommitted.get(line.product_id);
                                  return (
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-1">
                                        {PRIORITY_ORDER.map((p) => {
                                          const meta = PRIORITY_META[p];
                                          const Icon = meta.icon;
                                          const active = line.priority === p;
                                          return (
                                            <button
                                              key={p}
                                              type="button"
                                              onClick={() => setLinePriority(idx, p)}
                                              title={`${meta.label} – ${meta.hint}`}
                                              aria-label={meta.label}
                                              aria-pressed={active}
                                              className={cn(
                                                "flex h-8 min-w-8 items-center gap-1 rounded-md border px-1.5 text-[10px] font-semibold transition-colors",
                                                active
                                                  ? meta.chip
                                                  : "border-border/60 text-muted-foreground/70 hover:bg-muted",
                                              )}
                                            >
                                              <Icon className="h-3.5 w-3.5" />
                                              {active && <span className="hidden sm:inline uppercase tracking-wider">{meta.label}</span>}
                                            </button>
                                          );
                                        })}
                                      </div>
                                      {line.priority === "must" && (
                                        <div className="flex flex-wrap items-center gap-1">
                                          <Input
                                            type="number"
                                            inputMode="decimal"
                                            step="0.1"
                                            value={line.priorityQty}
                                            onChange={(e) => setLineField(idx, "priorityQty", e.target.value)}
                                            onFocus={(e) => e.currentTarget.select()}
                                            className="h-8 w-20 text-right text-xs"
                                            placeholder="kg"
                                            title="Hur mycket är kundbeställt"
                                          />
                                          <span className="text-[10px] text-muted-foreground">{line.unit} till kund</span>
                                          <Input
                                            value={line.priorityNote}
                                            onChange={(e) => setLineField(idx, "priorityNote", e.target.value)}
                                            className="h-8 w-full text-xs sm:w-40"
                                            placeholder="Kund / hämtdag"
                                          />
                                        </div>
                                      )}
                                      {committed && committed.quantity > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setLinePriority(idx, "must");
                                            setLineField(idx, "priorityQty", String(committed.quantity));
                                          }}
                                          className="text-left text-[10px] text-destructive underline-offset-2 hover:underline"
                                          title="Hämtat från butikens kundbeställningar"
                                        >
                                          {committed.quantity.toLocaleString("sv-SE", { maximumFractionDigits: 1 })}{" "}
                                          {committed.unit} kundbeställt
                                          {committed.customers.length > 0 && ` · ${committed.customers.slice(0, 2).join(", ")}`}
                                        </button>
                                      )}
                                    </div>
                                  );
                                })()}
                              </td>
                              <td className="py-2">
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-primary sm:hidden"
                                    title="Nästa produkt"
                                    aria-label="Nästa produkt"
                                    onClick={() => searchInputRef.current?.focus()}
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(idx)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>

                            </tr>
                          ))}
                        </React.Fragment>
                      ))}
                    </tbody>

                  </table>
                </div>
                )}
              </div>
            )}

            <div className="hidden space-y-1.5 sm:block">
              <Label className="text-xs">Önskat avgångsdatum <span className="text-destructive">*</span></Label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left text-xs h-8 font-normal",
                      !desiredDeliveryDate && "text-muted-foreground"
                    )}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !dateOpen) {
                        e.preventDefault();
                        setDateOpen(true);
                      }
                    }}
                  >
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {desiredDeliveryDate ? format(desiredDeliveryDate, "yyyy-MM-dd") : "Välj datum..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0"
                  align="start"
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const el = e.target as HTMLElement;
                    // Är en dagknapp fokuserad? Låt kalendern välja den dagen (default Enter -> click)
                    if (el.closest("button[name='day'], .rdp-day, [role='gridcell'] button")) return;
                    e.preventDefault();
                    pickDate(desiredDeliveryDate);
                  }}

                >
                  <Calendar
                    mode="single"
                    selected={desiredDeliveryDate}
                    onSelect={pickDate}
                    disabled={isDateDisabled}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                    modifiers={allowedWeekdays ? { allowed: (date: Date) => !isDateDisabled(date) } : {}}
                    modifiersClassNames={allowedWeekdays ? { allowed: "!bg-primary/10 !text-primary font-medium" } : {}}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="hidden space-y-1.5 sm:block">
              <Label className="text-xs">Anteckning (valfritt)</Label>
              <Textarea
                ref={noteRef}
                value={orderNote}
                onChange={e => setOrderNote(e.target.value)}
                placeholder="T.ex. brådskande leverans, specialförpackning..."
                className="text-xs min-h-[50px]"
              />
            </div>

            <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card px-4 py-3 space-y-2 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:pt-2">
              <p className="text-xs text-muted-foreground sm:hidden">
                {orderLines.filter(l => l.quantity && Number(l.quantity) > 0).length} produkter klara — lägg till fler innan du skickar.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                <Button
                  className="h-14 w-full gap-2 text-[17px] sm:hidden"
                  onClick={() => setConfirmSendOpen(true)}
                  disabled={orderLines.filter(l => l.quantity && Number(l.quantity) > 0).length === 0}
                >
                  <ShoppingCart className="h-5 w-5" /> Skicka beställning
                </Button>
                <Button variant="outline" className="h-11 sm:h-8 sm:text-xs" onClick={() => setCreatingOrder(false)}>Avbryt</Button>
                <Button
                  variant="outline"
                  className="h-11 gap-1.5 border-warning/40 text-warning hover:bg-warning/10 sm:h-8 sm:text-xs"
                  title="Spara som öppen beställning — stannar hos butiken tills ni skickar den"
                  onClick={() => handleCreateOrder(true)}
                  disabled={orderLines.filter(l => l.quantity && Number(l.quantity) > 0).length === 0}
                >
                  <Users className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> Öppen order
                </Button>
                <Button
                  size="sm"
                  className="hidden gap-1.5 sm:inline-flex"
                  onClick={() => setConfirmSendOpen(true)}
                  disabled={orderLines.filter(l => l.quantity && Number(l.quantity) > 0).length === 0 || !desiredDeliveryDate}
                >
                  <ShoppingCart className="h-3.5 w-3.5" /> Skicka beställning
                </Button>
              </div>
            </div>

            {/* Confirmation dialog */}
            <Dialog open={confirmSendOpen} onOpenChange={setConfirmSendOpen}>
              <DialogContent className="max-h-[92vh] max-w-sm overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-heading">Kontrollera beställningen</DialogTitle>
                  <DialogDescription className="text-xs">
                    {orderLines.filter(l => l.quantity && Number(l.quantity) > 0).length} produkter, leverans{" "}
                    {desiredDeliveryDate ? format(desiredDeliveryDate, "yyyy-MM-dd") : "–"}. Ordern kan inte ändras efter att den skickats.
                  </DialogDescription>
                </DialogHeader>

                {/* Mobil: datum och anteckning fylls i här, inte längre ner på sidan */}
                <div className="space-y-3 sm:hidden">
                  <div className="space-y-1.5">
                    <Label className="text-[15px]">När ska den levereras? <span className="text-destructive">*</span></Label>
                    <Button
                      variant="outline"
                      className={cn(
                        "h-14 w-full justify-start gap-2 text-[17px] font-normal",
                        !desiredDeliveryDate && "text-muted-foreground",
                      )}
                      onClick={() => setMobileCalendarOpen((v) => !v)}
                    >
                      <CalendarIcon className="h-5 w-5" />
                      {desiredDeliveryDate ? format(desiredDeliveryDate, "yyyy-MM-dd") : "Välj datum…"}
                    </Button>
                    {mobileCalendarOpen && (
                      <div className="rounded-md border border-border">
                        <Calendar
                          mode="single"
                          selected={desiredDeliveryDate}
                          onSelect={(d) => { setDesiredDeliveryDate(d); setMobileCalendarOpen(false); }}
                          disabled={isDateDisabled}
                          initialFocus
                          className={cn("p-3 pointer-events-auto")}
                          modifiers={allowedWeekdays ? { allowed: (date: Date) => !isDateDisabled(date) } : {}}
                          modifiersClassNames={allowedWeekdays ? { allowed: "!bg-primary/10 !text-primary font-medium" } : {}}
                        />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[15px]">Anteckning (valfritt)</Label>
                    <Textarea
                      value={orderNote}
                      onChange={(e) => setOrderNote(e.target.value)}
                      placeholder="T.ex. brådskande leverans"
                      className="min-h-[64px] text-[16px]"
                    />
                  </div>
                </div>

                <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border/60">
                  {orderLines
                    .filter(l => l.quantity && Number(l.quantity) > 0)
                    .map(l => (
                      <div key={l.product_id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="text-sm text-foreground break-words">{l.product_name}</span>
                        <span className="text-sm font-mono tabular-nums font-semibold text-foreground whitespace-nowrap">
                          {l.quantity} {l.unit}
                        </span>
                      </div>
                    ))}
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  <Button variant="outline" className="h-11 w-full sm:h-8 sm:w-auto sm:text-xs" onClick={() => setConfirmSendOpen(false)}>
                    Nej, lägg till mer
                  </Button>
                  <Button
                    className="h-14 w-full gap-1.5 text-[17px] sm:h-8 sm:w-auto sm:text-xs"
                    disabled={!desiredDeliveryDate}
                    onClick={() => { setConfirmSendOpen(false); handleCreateOrder(); }}
                  >
                    <CheckCircle2 className="h-5 w-5 sm:h-3.5 sm:w-3.5" /> Ja, skicka
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
        </CreatePanelShell>
      )}

      {/* Produktkort */}
      <Dialog open={!!previewProduct} onOpenChange={(o) => !o && setPreviewProduct(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-base">{previewProduct?.name}</DialogTitle>
            <DialogDescription className="text-xs font-mono">
              {previewProduct?.sku} · {previewProduct?.unit}
            </DialogDescription>
          </DialogHeader>
          {previewProduct?.image_url ? (
            <img
              src={thumbUrl(previewProduct.image_url, THUMB_CARD)}
              alt={previewProduct.name}
              className="w-full h-48 object-cover rounded-md border border-border"
             loading="lazy" decoding="async" />
          ) : (
            <div className="w-full h-48 rounded-md border border-border bg-muted flex items-center justify-center text-xs text-muted-foreground">
              Ingen bild uppladdad
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">Kategori</div>
              <div className="font-medium text-foreground">{previewProduct?.category || "–"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Enhet</div>
              <div className="font-medium text-foreground">{previewProduct?.unit || "–"}</div>
            </div>
            {previewProduct?.species && (
              <div>
                <div className="text-muted-foreground">Art</div>
                <div className="font-medium text-foreground">{previewProduct.species}</div>
              </div>
            )}
            {previewProduct?.origin && (
              <div>
                <div className="text-muted-foreground">Ursprung</div>
                <div className="font-medium text-foreground">{previewProduct.origin}</div>
              </div>
            )}
          </div>
          {previewProduct?.description && (
            <p className="text-xs text-muted-foreground">{previewProduct.description}</p>
          )}
          <ProductPhotosGallery productId={previewProduct?.id} productName={previewProduct?.name} />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setPreviewProduct(null)}>Stäng</Button>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => { const p = previewProduct; setPreviewProduct(null); if (p) addProduct(p); }}
            >
              <Plus className="h-3.5 w-3.5" /> Lägg till
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}


/* ---- Inline edit component for order detail ---- */
function OrderDetailWithEdit({ order, products, onClose, toast, allowedWeekdays, isDateDisabled, inline }: {
  order: any;
  products: any[];
  onClose: () => void;
  toast: any;
  allowedWeekdays: Set<number> | null;
  isDateDisabled: (date: Date) => boolean;
  inline?: boolean;
}) {
  const createChange = useCreateChangeRequest();
  const resolveChange = useResolveChangeRequest();
  const { data: pendingChanges = [] } = useOrderChangeRequests(order.id);
  const isEditable = LIVE_STATUSES.includes(order.status);

  const [editMode, setEditMode] = useState(false);
  const [editLines, setEditLines] = useState<{ line_id: string; product_name: string; unit: string; old_qty: number; new_qty: string }[]>([]);
  const [newProducts, setNewProducts] = useState<{ product_id: string; product_name: string; unit: string; quantity: string }[]>([]);
  const [editProductSearch, setEditProductSearch] = useState("");
  const [editHighlightedIndex, setEditHighlightedIndex] = useState(-1);
  const editQtyRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const focusExistingLine = (productId: string) => {
    const line = (order.shop_order_lines || []).find((l: any) => l.product_id === productId);
    if (!line) return;
    const el = editQtyRefs.current[line.id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
      el.select();
    }
    setEditProductSearch("");
    setEditHighlightedIndex(-1);
  };
  const [editDeliveryDate, setEditDeliveryDate] = useState<Date | undefined>(
    order.desired_delivery_date ? new Date(order.desired_delivery_date + "T00:00:00") : undefined
  );
  const [origDeliveryDate] = useState(order.desired_delivery_date || null);
  const [editDateOpen, setEditDateOpen] = useState(false);

  const startEdit = () => {
    setEditMode(true);
    setEditLines(
      (order.shop_order_lines || []).map((l: any) => ({
        line_id: l.id,
        product_name: l.products?.name || "–",
        unit: l.unit || l.products?.unit || "ST",
        old_qty: l.quantity_ordered,
        new_qty: String(l.quantity_ordered),
      }))
    );
    setNewProducts([]);
  };

  const existingProductIds = new Set([
    ...(order.shop_order_lines || []).map((l: any) => l.product_id),
    ...newProducts.map(p => p.product_id),
  ]);

  const filteredEditProducts = products
    .filter(p =>
      editProductSearch &&
      (p.name.toLowerCase().includes(editProductSearch.toLowerCase()) ||
        p.sku.toLowerCase().includes(editProductSearch.toLowerCase()))
    )
    .map(p => ({ ...p, _alreadyOnOrder: existingProductIds.has(p.id) }))
    .sort((a: any, b: any) => Number(a._alreadyOnOrder) - Number(b._alreadyOnOrder))
    .slice(0, 8);

  const addNewProduct = (p: any) => {
    setNewProducts(prev => [{ product_id: p.id, product_name: p.name, unit: p.unit, quantity: "" }, ...prev]);
    setEditProductSearch("");
    setEditHighlightedIndex(-1);
  };

  const handleSubmitChanges = async () => {
    let changeCount = 0;

    // Quantity changes
    for (const line of editLines) {
      const newQty = Number(line.new_qty);
      if (newQty !== line.old_qty && newQty > 0) {
        await createChange.mutateAsync({
          shop_order_id: order.id,
          order_line_id: line.line_id,
          change_type: "quantity_change",
          old_value: String(line.old_qty),
          new_value: String(newQty),
          unit: line.unit,
        });
        changeCount++;
      }
    }

    // New product lines
    for (const np of newProducts) {
      const qty = Number(np.quantity);
      if (qty > 0) {
        await createChange.mutateAsync({
          shop_order_id: order.id,
          change_type: "add_line",
          product_id: np.product_id,
          new_value: String(qty),
          unit: np.unit,
        });
        changeCount++;
      }
    }

    // Delivery date change
    const newDateStr = editDeliveryDate ? format(editDeliveryDate, "yyyy-MM-dd") : null;
    if (newDateStr !== origDeliveryDate) {
      await createChange.mutateAsync({
        shop_order_id: order.id,
        change_type: "delivery_date",
        old_value: origDeliveryDate || "–",
        new_value: newDateStr || "–",
      });
      changeCount++;
    }

    if (changeCount > 0) {
      toast({ title: "Ändringsförfrågan skickad", description: `${changeCount} ändring(ar) skickade till grossist för godkännande.` });
    } else {
      toast({ title: "Inga ändringar", description: "Du har inte gjort några ändringar.", variant: "destructive" });
    }
    setEditMode(false);
  };

  const pendingForOrder = pendingChanges.filter((c: any) => c.status === "Väntande" && (c as any).requested_by !== "grossist");
  const wholesalerRequests = pendingChanges.filter((c: any) => c.status === "Väntande" && (c as any).requested_by === "grossist");

  return (
    <>
      <div className={inline ? "flex items-center gap-2 flex-wrap" : ""}>
        {inline ? (
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <h3 className="font-heading font-semibold text-sm">Order {displayOrderWeek(order)}</h3>
            <Badge variant="outline" className={`${statusColor[order.status] || ""} text-[10px] gap-1`}>
              {statusIcon[order.status]}
              {order.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Skapad {new Date(order.created_at).toLocaleDateString("sv-SE")} · {order.stores?.name || "–"}
              {order.desired_delivery_date && <> · Önskat lev: <span className="font-medium text-foreground">{order.desired_delivery_date}</span></>}
            </span>
            {isEditable && !editMode && (
              <Button variant="outline" size="sm" className="ml-auto h-7 text-[10px] gap-1" onClick={startEdit}>
                <Pencil className="h-3 w-3" /> Redigera
              </Button>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-[10px] gap-1" onClick={onClose}>
              <X className="h-3 w-3" /> Stäng
            </Button>
          </div>
        ) : (
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              Order {displayOrderWeek(order)}
              <Badge variant="outline" className={`${statusColor[order.status] || ""} text-[10px] gap-1 ml-2`}>
                {statusIcon[order.status]}
                {order.status}
              </Badge>
              {isEditable && !editMode && (
                <Button variant="outline" size="sm" className="ml-auto h-7 text-[10px] gap-1" onClick={startEdit}>
                  <Pencil className="h-3 w-3" /> Redigera
                </Button>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Skapad {new Date(order.created_at).toLocaleDateString("sv-SE")} · {order.stores?.name || "–"}
              {order.desired_delivery_date && (
                <> · Önskat leveransdatum: <span className="font-medium text-foreground">{order.desired_delivery_date}</span></>
              )}
            </DialogDescription>
          </DialogHeader>
        )}
        <OrderAuditLine
          stacked
          createdBy={(order as any).created_by_user}
          createdAt={order.created_at}
          updatedBy={(order as any).updated_by}
          updatedAt={(order as any).updated_at}
          className="mt-1"
        />
      </div>


      {order.notes && (
        <div className="bg-muted/30 rounded-md p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Anteckning:</span> {order.notes}
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Bilder på ordern:</span>
        <OrderPhotosButton
          entityType={ORDER_PHOTO_ENTITY}
          entityId={order.id}
          title={`Order ${order.order_number || ""}`}
        />
      </div>


      {/* Pending changes banner */}
      {pendingForOrder.length > 0 && !editMode && (
        <div className="bg-warning/10 border border-warning/30 rounded-md p-3 text-xs text-warning">
          <span className="font-medium">⏳ {pendingForOrder.length} ändringsförfrågan(or) väntar på godkännande från grossist.</span>
          <ul className="mt-1.5 space-y-0.5 text-[10px] text-muted-foreground">
            {pendingForOrder.map((c: any) => (
              <li key={c.id}>
                {c.change_type === "quantity_change" && `Antal: ${c.old_value} → ${c.new_value}`}
                {c.change_type === "add_line" && `Ny produkt: ${c.products?.name || "–"} (${c.new_value} ${c.unit || ""})`}
                {c.change_type === "delivery_date" && `Leveransdatum: ${c.old_value} → ${c.new_value}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Wholesaler-initiated change requests */}
      {wholesalerRequests.length > 0 && !editMode && (
        <div className="bg-destructive/5 border border-destructive/30 rounded-md p-3 text-xs space-y-2">
          <span className="font-medium text-destructive">⚠️ Grossisten har {wholesalerRequests.length} ändringsförfrågan/-or:</span>
          {wholesalerRequests.map((cr: any) => (
            <div key={cr.id} className="flex items-center justify-between gap-3 bg-background/50 rounded p-2">
              <div className="flex-1">
                {cr.change_type === "product_alternative" ? (
                  <>
                    <span className="font-medium text-foreground">{cr.products?.name || "Okänd produkt"}</span>
                    <span className="text-primary ml-1">→ föreslår alternativ: <span className="font-semibold">{cr.new_value}</span></span>
                    <span className="text-muted-foreground ml-1">({cr.unit})</span>
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{cr.products?.name || "Okänd produkt"}</span>
                    <span className="text-destructive ml-1">ej tillgänglig</span>
                    <span className="text-muted-foreground ml-1">({cr.old_value} {cr.unit})</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                  onClick={() => resolveChange.mutate({ id: cr.id, status: "Godkänd" })}
                  disabled={resolveChange.isPending}
                >
                  <CheckCircle2 className="h-3 w-3" /> Acceptera
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                  onClick={() => resolveChange.mutate({ id: cr.id, status: "Nekad" })}
                  disabled={resolveChange.isPending}
                >
                  <XCircle className="h-3 w-3" /> Neka
                </Button>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground">
            Ej tillgänglig: Acceptera = markeras som ej tillgänglig. Neka = produkten tas bort.<br />
            Alternativ: Acceptera = produkten byts ut. Neka = produkten tas bort.
          </p>
        </div>
      )}

      {/* View mode */}
      {!editMode && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Produkt</th>
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Kategori</th>
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Enhet</th>
                <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">Beställt</th>
                <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">Packat</th>
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Avvikelse</th>
                <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const all = order.shop_order_lines || [];
                const groups = new Map<string, any[]>();
                for (const l of all) {
                  const cat = l.products?.category || "Övrigt";
                  if (!groups.has(cat)) groups.set(cat, []);
                  groups.get(cat)!.push(l);
                }
                const sortedCats = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, "sv"));
                return sortedCats.map((cat) => {
                  const catLines = groups.get(cat)!.slice().sort((a: any, b: any) => (a.products?.name || "").localeCompare(b.products?.name || "", "sv"));
                  return (
                    <React.Fragment key={cat}>
                      <tr className="bg-muted/40">
                        <td colSpan={7} className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          ▸ {cat}
                        </td>
                      </tr>
                      {catLines.map((line: any) => {
                        const qtyOrdered = line.quantity_ordered || 0;
                        const qtyDelivered = line.quantity_delivered || 0;
                        const hasDiff = qtyDelivered > 0 && qtyDelivered !== qtyOrdered;
                        return (
                          <tr key={line.id} className={`border-b border-border/30 h-6 transition-colors ${rowBgByStatus[line.status || ""] || ""}`}>
                            <td className="px-1.5 py-0.5 font-medium text-foreground">
                              <div className="flex items-center gap-1">
                                <ProductThumb src={line.products?.image_url} alt={line.products?.name || "Produkt"} static className="w-7 h-5" />
                                <span>{line.products?.name || "–"}</span>
                                <LinePriorityBadge
                                  priority={line.priority}
                                  qty={line.priority_qty}
                                  unit={line.unit || line.products?.unit}
                                  note={line.priority_note}
                                  showLabel={false}
                                />
                                <OrderPhotosButton
                                  compact
                                  entityType={ORDER_LINE_PHOTO_ENTITY}
                                  entityId={line.id}
                                  productId={line.product_id}
                                  title={line.products?.name || "Orderrad"}
                                />
                              </div>
                            </td>

                            <td className="px-1.5 py-0.5 text-muted-foreground">{line.products?.category || "–"}</td>
                            <td className="px-1.5 py-0.5 text-muted-foreground">{line.unit || line.products?.unit || "–"}</td>
                            <td className="px-1.5 py-0.5 text-right font-mono text-foreground">{qtyOrdered}</td>
                            <td className={`px-1.5 py-0.5 text-right font-mono ${hasDiff ? "text-warning font-bold" : "text-muted-foreground"}`}>
                              {qtyDelivered > 0 ? qtyDelivered : "–"}
                            </td>
                            <td className="px-1.5 py-0.5 text-muted-foreground">{line.deviation || "–"}</td>
                            <td className="px-1.5 py-0.5">
                              {line.status ? (
                                <Badge variant="outline" className={`${statusColor[line.status] || ""} text-[10px] gap-1`}>
                                  {statusIcon[line.status]}
                                  {line.status}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className={`${statusColor["Ny"]} text-[10px] gap-1`}>
                                  {statusIcon["Ny"]}
                                  Ny
                                </Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit mode */}
      {editMode && (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">Ändra antal på befintliga produkter:</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th>
                  <th className="pb-2 text-left font-medium text-muted-foreground">Enhet</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground">Nuvarande</th>
                  <th className="pb-2 text-right font-medium text-muted-foreground w-28">Nytt antal</th>
                </tr>
              </thead>
              <tbody>
                {editLines.map((line, idx) => (
                  <tr key={line.line_id} className="border-b border-border/30">
                    <td className="py-2 font-medium text-foreground">{line.product_name}</td>
                    <td className="py-2 text-muted-foreground">{line.unit}</td>
                    <td className="py-2 text-right font-mono text-muted-foreground">{line.old_qty}</td>
                    <td className="py-2 text-right">
                      <Input
                        ref={el => { editQtyRefs.current[line.line_id] = el; }}
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={line.new_qty}
                        onChange={e => setEditLines(prev => prev.map((l, i) => i === idx ? { ...l, new_qty: e.target.value } : l))}
                        className={cn("h-7 text-xs w-24 ml-auto text-right", Number(line.new_qty) !== line.old_qty && "border-warning ring-1 ring-warning/30")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Separator />

          {/* Add new products */}
          <div className="relative">
            <Label className="text-xs font-medium mb-1.5 block">Lägg till nya produkter</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Sök produkt..."
                value={editProductSearch}
                onChange={e => { setEditProductSearch(e.target.value); setEditHighlightedIndex(-1); }}
                onKeyDown={e => {
                  if (filteredEditProducts.length === 0) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setEditHighlightedIndex(prev => (prev + 1) % filteredEditProducts.length); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setEditHighlightedIndex(prev => (prev <= 0 ? filteredEditProducts.length - 1 : prev - 1)); }
                  else if (e.key === "Enter" && editHighlightedIndex >= 0) {
                    e.preventDefault();
                    const sel: any = filteredEditProducts[editHighlightedIndex];
                    if (!sel) return;
                    if (sel._alreadyOnOrder) focusExistingLine(sel.id);
                    else addNewProduct(sel);
                  }
                }}
                className="pl-8 h-8 text-xs"
              />
            </div>
            {filteredEditProducts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                {filteredEditProducts.map((p: any, idx) => (
                  <button
                    key={p.id}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between ${idx === editHighlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`}
                    onClick={() => p._alreadyOnOrder ? focusExistingLine(p.id) : addNewProduct(p)}
                    onMouseEnter={() => setEditHighlightedIndex(idx)}
                  >
                    <span className="font-medium text-foreground">{p.name}</span>
                    <span className={`font-mono text-[10px] ${p._alreadyOnOrder ? "text-primary" : "text-muted-foreground"}`}>
                      {p._alreadyOnOrder ? "ändra antal ↑" : `${p.sku} · ${p.unit}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {newProducts.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <tbody>
                  {newProducts.map((np, idx) => (
                    <tr key={np.product_id} className="border-b border-border/30 bg-primary/5">
                      <td className="py-2 font-medium text-foreground">{np.product_name} <Badge className="text-[8px] ml-1" variant="outline">NY</Badge></td>
                      <td className="py-2 text-muted-foreground">{np.unit}</td>
                      <td className="py-2 text-right">
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.1"
                          value={np.quantity}
                          onChange={e => setNewProducts(prev => prev.map((p, i) => i === idx ? { ...p, quantity: e.target.value } : p))}
                          className="h-7 text-xs w-24 ml-auto text-right"
                          placeholder="0"
                          autoFocus={idx === newProducts.length - 1}
                        />
                      </td>
                      <td className="py-2">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setNewProducts(prev => prev.filter((_, i) => i !== idx))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Separator />

          {/* Delivery date change */}
          <div className="space-y-1.5">
            <Label className="text-xs">Önskat leveransdatum</Label>
            <Popover open={editDateOpen} onOpenChange={setEditDateOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start text-left text-xs h-8 font-normal", !editDeliveryDate && "text-muted-foreground")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !editDateOpen) {
                      e.preventDefault();
                      setEditDateOpen(true);
                    }
                  }}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {editDeliveryDate ? format(editDeliveryDate, "yyyy-MM-dd") : "Välj datum..."}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0"
                align="start"
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  const el = e.target as HTMLElement;
                  if (el.closest("button[name='day'], .rdp-day, [role='gridcell'] button")) return;
                  e.preventDefault();
                  if (editDeliveryDate) setEditDateOpen(false);
                }}

              >
                <Calendar
                  mode="single"
                  selected={editDeliveryDate}
                  onSelect={(d) => {
                    setEditDeliveryDate(d);
                    if (d) setEditDateOpen(false);
                  }}
                  disabled={isDateDisabled}
                  initialFocus
                  className="p-3 pointer-events-auto"
                  modifiers={allowedWeekdays ? { allowed: (date: Date) => !isDateDisabled(date) } : {}}
                  modifiersClassNames={allowedWeekdays ? { allowed: "!bg-primary/10 !text-primary font-medium" } : {}}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}

      {!inline && (
        <DialogFooter className="gap-2">
          {editMode ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Avbryt</Button>
              <Button size="sm" className="gap-1.5" onClick={handleSubmitChanges} disabled={createChange.isPending}>
                <Send className="h-3.5 w-3.5" /> Skicka ändringsförfrågan
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={onClose}>Stäng</Button>
          )}
        </DialogFooter>
      )}
      {inline && editMode && (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>Avbryt</Button>
          <Button size="sm" className="gap-1.5" onClick={handleSubmitChanges} disabled={createChange.isPending}>
            <Send className="h-3.5 w-3.5" /> Skicka ändringsförfrågan
          </Button>
        </div>
      )}
    </>
  );
}
