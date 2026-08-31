import React, { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { displayOrderWeek } from "@/lib/orderWeek";
import { ProductThumb } from "@/components/products/ProductThumb";
import { OrderPhotosButton, ORDER_PHOTO_ENTITY, ORDER_LINE_PHOTO_ENTITY } from "@/components/orders/OrderPhotos";

import { isInfiniteStock } from "@/lib/infiniteStock";
import { motion } from "framer-motion";
import {
  ShoppingCart, Search, Clock, CheckCircle2, Truck, XCircle, Package,
  Eye, ListChecks, ChefHat, AlertTriangle, Archive, Bell, Check, X, Ban, Printer, ArrowRight, Plus, CalendarIcon, ChevronDown, ChevronRight, CheckSquare, Camera,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { useShopOrders } from "@/hooks/useShopOrders";
import { useStores } from "@/hooks/useStores";
import { useCustomers } from "@/hooks/useCustomers";
import { useCurrentStaff, staffFullName } from "@/hooks/useCurrentStaff";
import { useCustomerNeedByProduct, useOrderHistoryStats, useOutstandingOrdered } from "@/hooks/usePurchaseReconciliation";
import { addDays, mondayOf, weekRange } from "@/lib/purchaseReconciliation";
import { useProducts } from "@/hooks/useProducts";
import { useTransportSchedules } from "@/hooks/useTransportSchedules";
import { useStaff } from "@/hooks/useStaff";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAllPendingChangeRequests, useResolveChangeRequest, useCreateChangeRequest } from "@/hooks/useOrderChangeRequests";
import PackingSlip from "@/components/PackingSlip";
import DeliveryNote from "@/components/DeliveryNote";
import { moveStockToTransport } from "@/lib/stockTransfer";
import { useUpdateOrderLineStatus, STATUS_FLOW } from "@/hooks/useUpdateOrderLineStatus";
import { useAllStockByLocation } from "@/hooks/useStorageLocations";
import { useEntityImageCounts } from "@/hooks/useEntityImages";
import { logActivity } from "@/hooks/useActivityLog";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { WholesaleTotalOrderedView } from "@/components/orders/WholesaleTotalOrderedView";

type WholesaleOrderLine = {
  product_id: string;
  product_name: string;
  unit: string;
  quantity: string;
};

function getStoreZoneKey(store: { city: string; name: string }): string {
  const city = (store.city || "").toLowerCase();
  const name = (store.name || "").toLowerCase();
  if (city.includes("göteborg") || city.includes("gothenburg") || name.includes("göteborg") || name.includes("amhult") || name.includes("särö")) return "gothenburg";
  if (city.includes("stockholm") || name.includes("stockholm") || name.includes("kungsholmen") || name.includes("ålsten")) return "stockholm";
  return "international";
}

const orderDate = (order: any) => order.desired_delivery_date || order.shop_order_lines?.find((line: any) => line.delivery_date)?.delivery_date || order.created_at?.slice(0, 10) || "";
const dayLabel = (iso: string) => {
  if (!iso) return "Utan leveransdatum";
  const pretty = new Date(`${iso}T00:00:00`).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
};
function isoWeek(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { week: Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7), year: t.getUTCFullYear() };
}
function groupByWeek(list: any[], direction: "desc" | "asc" = "desc") {
  const dir = direction === "asc" ? 1 : -1;
  const weeks = new Map<string, { week: number; year: number; days: Map<string, any[]> }>();
  [...list].sort((a, b) => dir * orderDate(a).localeCompare(orderDate(b))).forEach((order) => {
    const date = orderDate(order);
    const { week, year } = isoWeek(date || new Date().toISOString().slice(0, 10));
    const key = `${year}-${String(week).padStart(2, "0")}`;
    const entry = weeks.get(key) ?? { week, year, days: new Map<string, any[]>() };
    const dayOrders = entry.days.get(date) ?? [];
    dayOrders.push(order);
    entry.days.set(date, dayOrders);
    weeks.set(key, entry);
  });
  return [...weeks.entries()]
    .sort((a, b) => dir * a[0].localeCompare(b[0]))
    .map(([key, entry]) => ({ key, ...entry, count: [...entry.days.values()].flat().length }));
}


const formatOrderValue = (order: any) => (order.shop_order_lines || []).reduce(
  (sum: number, line: any) => sum + Number(line.quantity_ordered || 0) * Number(line.products?.wholesale_price || 0),
  0,
);

const printWholesalePackLists = (selectedOrders: any[]) => {
  if (selectedOrders.length === 0) return;
  const pages = selectedOrders.map((order) => {
    const rows = (order.shop_order_lines || []).map((line: any) => `<tr><td class="box"></td><td>${line.products?.name || "–"}</td><td>${line.products?.category || "–"}</td><td class="qty">${line.quantity_ordered || 0}</td><td>${line.unit || line.products?.unit || "–"}</td><td class="qty"></td></tr>`).join("");
    return `<section class="page"><header><h1>Grossist — packlista</h1><strong>${order.stores?.name || "Okänd butik"}</strong><span>Order ${displayOrderWeek(order)} · Leverans ${orderDate(order) || "–"}</span></header><table><thead><tr><th></th><th>Produkt</th><th>Kategori</th><th>Beställt</th><th>Enhet</th><th>Packat</th></tr></thead><tbody>${rows}</tbody></table><footer>Anteckning: ${order.notes || ""}</footer></section>`;
  }).join("");
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return;
  printWindow.document.write(`<html><head><title>Grossistens packlistor</title><style>body{font-family:Arial,sans-serif;color:#111}.page{page-break-after:always;padding:12mm}.page:last-child{page-break-after:auto}header{display:grid;gap:4px;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:16px}h1{font-size:24px;margin:0}header strong{font-size:18px}header span{color:#555}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #bbb;padding:8px 6px;text-align:left}th{background:#222;color:#fff;text-transform:uppercase;font-size:11px}.box{width:28px;height:20px}.box:after{content:"";display:block;width:14px;height:14px;border:1px solid #333}.qty{text-align:right;width:70px}footer{margin-top:18px;border-top:1px solid #bbb;padding-top:12px}</style></head><body>${pages}<script>window.onload=function(){window.print();window.close()}<\\/script></body></html>`);
  printWindow.document.close();
};

const statusColor: Record<string, string> = {
  Ny: "",
  Pågående: "bg-warning/15 text-warning border-warning/20",
  Packad: "bg-success/15 text-success border-success/20",
  Skickad: "bg-primary/15 text-primary border-primary/20",
  Levererad: "bg-success/15 text-success border-success/20",
  Avbruten: "bg-destructive/10 text-destructive border-destructive/20",
};

const statusIcon: Record<string, React.ReactNode> = {
  Ny: <Clock className="h-3 w-3" />,
  Pågående: <Clock className="h-3 w-3" />,
  Packad: <Package className="h-3 w-3" />,
  Skickad: <Truck className="h-3 w-3" />,
  Levererad: <CheckCircle2 className="h-3 w-3" />,
  Avbruten: <XCircle className="h-3 w-3" />,
};

const LINE_STATUSES = ["", "Pågående", "Beställd", "Producerad", "Packad", "Skickad", "Ej tillgänglig"];

const FULFILLED_LINE_STATUSES = ["Packad", "Skickad", "Klar / Levererad", "Levererad", "Producerad"];

function getPackedLineValue(line: any) {
  const qtyDelivered = Number(line?.quantity_delivered || 0);
  const qtyOrdered = Number(line?.quantity_ordered || 0);
  const wholesalePrice = Number(line?.products?.wholesale_price || 0);
  const packedQty = qtyDelivered > 0
    ? qtyDelivered
    : FULFILLED_LINE_STATUSES.includes(line?.status)
      ? qtyOrdered
      : 0;

  return packedQty * wholesalePrice;
}

const rangeLabel = (dates: string[]) => {
  const sorted = [...dates].filter(Boolean).sort();
  if (sorted.length === 0) return "";
  const label = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  return sorted.length === 1 ? label(sorted[0]) : `${label(sorted[0])} – ${label(sorted[sorted.length - 1])}`;
};

type WholesaleOrderAccordionRowProps = {
  order: any;
  day: string;
  open: boolean;
  selected: boolean;
   stores: any[];
   photoCount?: number;
   onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: string) => void;
  onPrint: (order: any) => void;
  onArchive: (order: any) => void;
  onClose: (id: string) => void;
};

function WholesaleOrderAccordionRow({
  order,
  day,
  open,
  selected,
  stores,
  photoCount = 0,
  onToggle,
  onSelect,
  onStatusChange,
  onPrint,
  onArchive,
  onClose,
}: WholesaleOrderAccordionRowProps) {
  const rowTone = order.status === "Avbruten"
    ? { row: "bg-row-off", hover: "hover:bg-row-off-hover", edge: "bg-row-off-edge", chip: "bg-card text-row-off-text border-row-off-edge" }
    : order.status === "Levererad" || order.status === "Klar / Levererad"
      ? { row: "bg-row-done", hover: "hover:bg-row-done-hover", edge: "bg-row-done-edge", chip: "bg-card text-row-done-text border-row-done-edge" }
      : order.status === "Packad"
        ? { row: "bg-row-ok", hover: "hover:bg-row-ok-hover", edge: "bg-row-ok-edge", chip: "bg-card text-row-ok-text border-row-ok-edge" }
        : order.status === "Pågående"
          ? { row: "bg-row-warn", hover: "hover:bg-row-warn-hover", edge: "bg-row-warn-edge", chip: "bg-card text-row-warn-text border-row-warn-edge" }
          : { row: "bg-row-neutral", hover: "hover:bg-row-neutral-hover", edge: "bg-border", chip: "bg-card text-muted-foreground border-grid-line" };
  const orderLines = order.shop_order_lines?.length || 0;
  const statusChip = (
    <span className={`inline-flex flex-nowrap items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-tight ${rowTone.chip}`}>
      {statusIcon[order.status]}
      {order.status}
    </span>
  );

  return (
    <div id={`wholesale-order-${order.id}`} className={`relative overflow-hidden border-x border-b border-grid-line transition-all duration-200 ${rowTone.row} ${open ? "z-10 my-3 rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/[0.07] to-primary/[0.02] pl-2.5 shadow-[0_10px_30px_-18px_hsl(var(--primary)/0.55)]" : ""} ${selected && !open ? "ring-1 ring-inset ring-primary" : ""}`}>
      {open && <span className="pointer-events-none absolute bottom-2 left-1.5 top-2 w-1.5 rounded-full bg-primary/80" aria-hidden />}

      <div className="flex min-w-0 items-stretch">
        {!open && <div className={`w-1 shrink-0 ${rowTone.edge}`} aria-hidden />}
        <div className="hidden w-9 shrink-0 items-center justify-center border-r border-grid-line/70 sm:flex">
          <Checkbox checked={selected} onCheckedChange={() => onSelect(order.id)} aria-label={`Markera order från ${order.stores?.name || "butik"}`} />
        </div>
        <button
          type="button"
          onClick={() => onToggle(order.id)}
          aria-expanded={open}
          className={`min-w-0 flex-1 px-2.5 text-left transition-colors ${open ? "py-2.5" : "py-1.5"} ${rowTone.hover}`}
        >
          <div className="hidden min-h-5 w-full min-w-0 items-center text-xs sm:flex">
            <span className="w-36 shrink-0 border-r border-grid-line/70 pr-3 font-mono text-[11px] font-semibold tabular-nums">{day}<span className="block text-[10px] font-normal text-muted-foreground">{displayOrderWeek(order)}</span></span>
            <span className={`min-w-[11rem] flex-1 truncate border-r border-grid-line/70 px-3 ${open ? "text-[13px] font-bold tracking-tight" : "font-semibold"}`}>{order.stores?.name || "Okänd butik"}<span className="block text-[10px] font-normal text-muted-foreground">{order.created_by || "–"}</span></span>
            <span className="w-16 shrink-0 border-r border-grid-line/70 px-2 text-center font-mono text-[10px] tabular-nums text-muted-foreground">{orderLines} rader</span>
             <span className="flex w-32 shrink-0 items-center overflow-hidden border-r border-grid-line/70 px-2">{statusChip}</span>
             <span className="flex w-12 shrink-0 items-center justify-center border-r border-grid-line/70 px-2">
               {photoCount > 0 && <span className="flex items-center gap-0.5 font-mono text-[10px] tabular-nums text-muted-foreground" title={`${photoCount} interna bilder på beställningen`}><Camera className="h-3.5 w-3.5" aria-label="Bilder finns" />{photoCount}</span>}
             </span>
             <span className="w-24 shrink-0 px-2 text-right font-mono text-[11px] font-semibold tabular-nums">{formatOrderValue(order).toFixed(0)} kr</span>
            <ChevronDown className={`ml-2 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
          </div>
          <div className="w-full space-y-1 sm:hidden">
            <div className="flex items-start justify-between gap-2">
              <span className={`min-w-0 flex-1 break-words leading-snug ${open ? "text-[17px] font-bold" : "text-[15px] font-semibold"}`}>{order.stores?.name || "Okänd butik"}</span>
              <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">{statusChip}<span className="font-mono text-[11px] text-muted-foreground">{day} · {orderLines} rader</span></div>
            <div className="font-mono text-[11px] font-semibold tabular-nums">{formatOrderValue(order).toFixed(0)} kr</div>
          </div>
        </button>

        <div className="flex shrink-0 items-center justify-end gap-1 px-2 sm:w-[196px] sm:border-l sm:border-grid-line/70">
          <Select value={order.status} onValueChange={(value) => onStatusChange(order.id, value)}>
            <SelectTrigger className="hidden h-8 w-[108px] text-xs sm:flex"><SelectValue /></SelectTrigger>
            <SelectContent>{["Ny", "Pågående", "Packad", "Skickad", "Levererad", "Avbruten"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Skriv ut packlista" onClick={() => onPrint(order)}><Printer className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="hidden h-8 w-8 sm:flex" title="Arkivera order" onClick={() => onArchive(order)}><Archive className="h-4 w-4" /></Button>
        </div>
      </div>
      {open && (
        <div className="space-y-3 border-t border-primary/20 px-3 pb-3 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="font-semibold text-foreground">Order {displayOrderWeek(order)} — {order.stores?.name || "Okänd butik"}</span><span>Skapad {new Date(order.created_at).toLocaleString("sv-SE")}</span></div>
            <div className="flex items-center gap-2">
              <Select value={order.status} onValueChange={(value) => onStatusChange(order.id, value)}>
                <SelectTrigger className="h-8 w-[118px] text-xs sm:hidden"><SelectValue /></SelectTrigger>
                <SelectContent>{["Ny", "Pågående", "Packad", "Skickad", "Levererad", "Avbruten"].map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => onClose(order.id)}><X className="mr-1 h-3.5 w-3.5" /> Stäng</Button>
            </div>
          </div>
          <WholesaleOrderDetail order={order} onClose={() => onClose(order.id)} stores={stores} />
        </div>
      )}
    </div>
  );
}

function WholesaleOrderRowHeader({
  allSelected,
  onSelectAll,
}: {
  allSelected: boolean;
  onSelectAll: (next: boolean) => void;
}) {
  return (
    <div className="hidden items-center border border-grid-line bg-grid-head text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:flex">
      <span className="w-1 shrink-0" aria-hidden />
      <span className="flex w-9 shrink-0 items-center justify-center border-r border-grid-line py-1">
        <Checkbox checked={allSelected} onCheckedChange={(value) => onSelectAll(!!value)} aria-label="Markera alla" />
      </span>
      <span className="flex min-w-0 flex-1 items-center px-2.5 py-1">
        <span className="w-36 shrink-0 border-r border-grid-line pr-2">Datum</span>
        <span className="min-w-[11rem] flex-1 border-r border-grid-line px-3">Butik</span>
        
        <span className="w-16 shrink-0 border-r border-grid-line px-2 text-center">Rader</span>
        <span className="w-32 shrink-0 border-r border-grid-line px-2">Status</span>
        <span className="w-24 shrink-0 px-2 text-right">Summa</span>
        <span className="ml-2 w-3.5 shrink-0" />
      </span>
      <span className="w-[196px] shrink-0" aria-hidden />
    </div>
  );
}

export default function WholesaleOrders() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: orders = [], isLoading } = useShopOrders();
  const { data: stores = [] } = useStores();
  const { data: customers = [] } = useCustomers();
  const { data: products = [] } = useProducts();
  const { data: staffList = [] } = useStaff();
  const { data: transportSchedules = [] } = useTransportSchedules();
  const retailStores = stores.filter(s => !s.is_wholesale);
  const { activeUser } = useActiveUser();
  const { data: currentStaff } = useCurrentStaff();
  const loggedInName = staffFullName(currentStaff);

  const [activeTab, setActiveTab] = useState("per-order");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Alla");
  const [storeFilter, setStoreFilter] = useState("alla");
  const [marked, setMarked] = useState<string[]>([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Set<string>>(new Set());
  const toggleExpandOrder = (id: string) => setExpandedOrderIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const collapseOrder = (id: string) => setExpandedOrderIds(prev => {
    const next = new Set(prev);
    next.delete(id);
    return next;
  });
  // Keep selectedOrder for compatibility with other dialogs that reference it
  const selectedOrderId = expandedOrderIds.size > 0 ? Array.from(expandedOrderIds)[0] : null;
  const setSelectedOrderId = (id: string | null) => { if (id) setExpandedOrderIds(new Set([id])); else setExpandedOrderIds(new Set()); };
  const selectedOrder = useMemo(() => selectedOrderId ? orders.find((o: any) => o.id === selectedOrderId) || null : null, [selectedOrderId, orders]);
  const [reportViewOrder, setReportViewOrder] = useState<any>(null);
  const [archiveConfirmOrder, setArchiveConfirmOrder] = useState<any>(null);
  const [packingSlipOrder, setPackingSlipOrder] = useState<any>(null);
  const [deliveryNoteOrder, setDeliveryNoteOrder] = useState<any>(null);
  // Packer name dialog state
  const [packerDialogOpen, setPackerDialogOpen] = useState(false);
  const [packerName, setPackerName] = useState("");
  const [pendingPackerOrderId, setPendingPackerOrderId] = useState<string | null>(null);
  const { data: pendingChanges = [] } = useAllPendingChangeRequests();
  const resolveChange = useResolveChangeRequest();

  // Wholesale order creation state
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [newOrderLines, setNewOrderLines] = useState<WholesaleOrderLine[]>([]);
  const [expandedDecisionLines, setExpandedDecisionLines] = useState<string[]>([]);
  const [newOrderNote, setNewOrderNote] = useState("");
  const [newOrderDeliveryDate, setNewOrderDeliveryDate] = useState<Date | undefined>(undefined);
  const [newProductSearch, setNewProductSearch] = useState("");
  const [newHighlightedIndex, setNewHighlightedIndex] = useState(-1);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);

  // Determine the selected customer's store for zone/date filtering
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
  const selectedStore = selectedCustomer?.store_id ? stores.find(s => s.id === selectedCustomer.store_id) : null;

  const allowedWeekdays = useMemo(() => {
    if (!selectedStore) return null;
    const zoneKey = getStoreZoneKey(selectedStore as any);
    const days = transportSchedules.filter(s => s.zone_key === zoneKey).map(s => s.departure_weekday);
    return days.length > 0 ? new Set(days) : null;
  }, [selectedStore, transportSchedules]);

  const isNewOrderDateDisabled = (date: Date) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) return true;
    if (!allowedWeekdays) return false;
    const jsDay = getDay(date);
    const isoDay = jsDay === 0 ? 7 : jsDay;
    return !allowedWeekdays.has(isoDay);
  };

  const selectedDeliveryRange = useMemo(() => {
    if (!newOrderDeliveryDate) return null;
    const start = mondayOf(newOrderDeliveryDate);
    return weekRange(start);
  }, [newOrderDeliveryDate]);
  const decisionNeeds = useCustomerNeedByProduct(selectedDeliveryRange?.from ?? "", selectedDeliveryRange?.to ?? "", selectedCustomer?.store_id ?? null);
  const outstandingOrdered = useOutstandingOrdered(null);
  const historyStats = useOrderHistoryStats(4);

  const filteredNewProducts = products.filter(p =>
    newProductSearch &&
    (p.name.toLowerCase().includes(newProductSearch.toLowerCase()) ||
     p.sku.toLowerCase().includes(newProductSearch.toLowerCase())) &&
    !newOrderLines.find(l => l.product_id === p.id)
  ).slice(0, 8);

  const addNewProduct = (p: any) => {
    setNewOrderLines(prev => [{
      product_id: p.id, product_name: p.name, unit: p.unit, quantity: "",
    }, ...prev]);
    setNewProductSearch("");
    setNewHighlightedIndex(-1);
  };

  const updateNewLine = (idx: number, qty: string) => {
    setNewOrderLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: qty } : l));
  };

  const removeNewLine = (idx: number) => {
    setNewOrderLines(prev => prev.filter((_, i) => i !== idx));
  };

  const resetCreateForm = () => {
    setSelectedCustomerId("");
    setNewOrderLines([]);
    setNewOrderNote("");
    setNewOrderDeliveryDate(undefined);
    setNewProductSearch("");
    setNewHighlightedIndex(-1);
  };

  const handleCreateWholesaleOrder = async () => {
    const validLines = newOrderLines.filter(l => l.quantity && Number(l.quantity) > 0);
    if (validLines.length === 0 || !selectedCustomer?.store_id || !newOrderDeliveryDate) return;

    const weekNum = `V${Math.ceil((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000))}`;

    const { data: order, error } = await supabase
      .from("shop_orders")
      .insert({
        store_id: selectedCustomer.store_id,
        order_week: weekNum,
        notes: newOrderNote || null,
        status: "Ny",
        created_by: loggedInName ?? "Grossist",
        desired_delivery_date: format(newOrderDeliveryDate, "yyyy-MM-dd"),
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    const deliveryDateStr = format(newOrderDeliveryDate, "yyyy-MM-dd");
    const lines = validLines.map(l => ({
      shop_order_id: order.id,
      product_id: l.product_id,
      quantity_ordered: Number(l.quantity),
      unit: l.unit,
      delivery_date: deliveryDateStr,
    }));

    const { error: lineError } = await supabase.from("shop_order_lines").insert(lines);
    if (lineError) {
      toast({ title: "Fel vid orderrader", description: lineError.message, variant: "destructive" });
      return;
    }

    await logActivity({
      action_type: "create",
      description: `Ny grossistorder skapad av ${loggedInName ?? "Grossist"} för ${selectedCustomer.name} (${validLines.length} rader)`,
      portal: "wholesale",
      store_id: selectedCustomer.store_id,
      entity_type: "shop_order",
      entity_id: order.id,
      performed_by: loggedInName ?? "Grossist",
      details: { line_count: validLines.length, week: weekNum },
    });

    toast({ title: "Order skapad!", description: `${validLines.length} produkter beställda åt ${selectedCustomer.name}` });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    setCreatingOrder(false);
    resetCreateForm();
  };

  // Customers with store_id (linked to a shop)
  const linkedCustomers = customers.filter(c => c.store_id);

  // Fetch all receiving reports
  const { data: allReports = [] } = useQuery({
    queryKey: ["delivery_receiving_reports_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("delivery_receiving_reports")
        .select("*");
      if (error) throw error;
      return data;
    },
  });

  // Group reports by order id
  const reportsByOrder = useMemo(() => {
    const map = new Map<string, any[]>();
    allReports.forEach((r: any) => {
      if (!map.has(r.shop_order_id)) map.set(r.shop_order_id, []);
      map.get(r.shop_order_id)!.push(r);
    });
    return map;
  }, [allReports]);

  // Split active vs archived
  const activeOrders = orders.filter((o: any) => o.status !== "Arkiverad");
  const archivedOrders = orders.filter((o: any) => o.status === "Arkiverad");
  const deliveredOrders = activeOrders.filter((o: any) => o.status === "Levererad" || o.status === "Klar / Levererad");

  // Filter orders (active only), including product names for fast order lookup.
  const filteredOrders = activeOrders.filter((o: any) => {
    const needle = search.trim().toLowerCase();
    const productsText = (o.shop_order_lines || []).map((line: any) => line.products?.name || "").join(" ").toLowerCase();
    const matchSearch = !needle || displayOrderWeek(o).toLowerCase().includes(needle) || (o.stores?.name || "").toLowerCase().includes(needle) || productsText.includes(needle);
    const matchStatus = statusFilter === "Alla" || o.status === statusFilter;
    const matchStore = storeFilter === "alla" || o.store_id === storeFilter;
    return matchSearch && matchStatus && matchStore;
  });

   const todayIso = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
   const currentOrders = useMemo(() => filteredOrders.filter((o: any) => !orderDate(o) || orderDate(o) >= todayIso), [filteredOrders, todayIso]);
   const historicOrders = useMemo(() => filteredOrders.filter((o: any) => orderDate(o) && orderDate(o) < todayIso), [filteredOrders, todayIso]);
   const groupedCurrentOrders = useMemo(() => groupByWeek(currentOrders, "asc"), [currentOrders]);
   const groupedHistoricOrders = useMemo(() => groupByWeek(historicOrders, "desc"), [historicOrders]);
   const { data: photoCounts } = useEntityImageCounts(

     "shop_order",
     useMemo(() => filteredOrders.map((order: any) => order.id), [filteredOrders]),
   );
   const allFilteredMarked = filteredOrders.length > 0 && filteredOrders.every((order: any) => marked.includes(order.id));
   const toggleMarked = (id: string) => setMarked((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
   const markAllFiltered = () => setMarked(allFilteredMarked ? marked.filter((id) => !filteredOrders.some((order: any) => order.id === id)) : [...new Set([...marked, ...filteredOrders.map((order: any) => order.id)])]);

  const totalOrders = activeOrders.length;
  const newOrders = activeOrders.filter((o: any) => o.status === "Ny").length;
  const inProgress = activeOrders.filter((o: any) => o.status === "Pågående").length;

  // Aggregated total view: group all order lines by product
  const aggregated = useMemo(() => {
    const map = new Map<string, {
      product_id: string;
      product_name: string;
      category: string;
      unit: string;
      totalOrdered: number;
      lineIds: string[];
      byStore: Record<string, { qty: number; lineIds: string[] }>;
      currentStatus: string;
    }>();

    for (const order of orders) {
      // Only aggregate active orders (not Arkiverad/Levererad/Avbruten)
      if ((order as any).status === "Avbruten" || (order as any).status === "Levererad" || (order as any).status === "Arkiverad") continue;
      const storeId = (order as any).store_id;
      for (const line of ((order as any).shop_order_lines || [])) {
        const pid = line.product_id;
        const pName = line.products?.name || "Okänd";
        if (!map.has(pid)) {
          map.set(pid, {
            product_id: pid,
            product_name: pName,
            category: line.products?.category || "",
            unit: line.unit || line.products?.unit || "ST",
            totalOrdered: 0,
            lineIds: [],
            byStore: {},
            currentStatus: line.status || "",
          });
        }
        const entry = map.get(pid)!;
        entry.totalOrdered += Number(line.quantity_ordered);
        entry.lineIds.push(line.id);
        if (!entry.byStore[storeId]) {
          entry.byStore[storeId] = { qty: 0, lineIds: [] };
        }
        entry.byStore[storeId].qty += Number(line.quantity_ordered);
        entry.byStore[storeId].lineIds.push(line.id);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.category.localeCompare(b.category) || a.product_name.localeCompare(b.product_name));
  }, [orders]);

  // Update status for a product across ALL order lines
  const handleProductStatusChange = async (product: typeof aggregated[0], newStatus: string) => {
    const { error } = await supabase
      .from("shop_order_lines")
      .update({ status: newStatus })
      .in("id", product.lineIds);

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Status uppdaterad",
      description: `${product.product_name}: ${newStatus} (${product.lineIds.length} orderrader uppdaterade)`,
    });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
  };

  // Update order-level status
  const handleOrderStatusChange = async (orderId: string, newStatus: string) => {
    // When changing to Pågående, show packer name dialog first
    if (newStatus === "Pågående") {
      setPendingPackerOrderId(orderId);
      setPackerName("");
      setPackerDialogOpen(true);
      return;
    }

    await applyOrderStatusChange(orderId, newStatus);
  };

  const applyOrderStatusChange = async (orderId: string, newStatus: string, packer?: string) => {
    const updatePayload: any = { status: newStatus };
    if (packer !== undefined) updatePayload.packer_name = packer;

    const { error } = await supabase
      .from("shop_orders")
      .update(updatePayload)
      .eq("id", orderId);

    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }

    // When changing to Pågående, also update all order lines to Pågående
    if (newStatus === "Pågående") {
      await supabase
        .from("shop_order_lines")
        .update({ status: "Pågående" })
        .eq("shop_order_id", orderId)
        .in("status", ["", "Ny"]);
    }

    // When marking as "Skickad" or "Levererad", move stock from Pre-locations to Transportlager
    if (newStatus === "Skickad" || newStatus === "Levererad") {
      try {
        await moveStockToTransport(orderId);
        // Update all qualifying lines to "Skickad" (or "Klar / Levererad" if Levererad)
        const lineTargetStatus = newStatus === "Levererad" ? "Klar / Levererad" : "Skickad";
        await supabase
          .from("shop_order_lines")
          .update({ status: lineTargetStatus })
          .eq("shop_order_id", orderId)
          .in("status", ["Packad", "Pågående", "Ny", "", "Skickad"]);
      } catch (err) {
        console.error("Stock transfer error:", err);
      }
    }

    const userName = loggedInName ?? undefined;
    await logActivity({
      action_type: "status_change",
      description: `Orderstatus ändrad till "${newStatus}"${packer ? ` (packare: ${packer})` : ""}`,
      entity_type: "shop_order",
      entity_id: orderId,
      performed_by: userName,
      details: { new_status: newStatus, packer },
    });

    toast({ title: "Orderstatus uppdaterad", description: newStatus });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
    qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
  };

  const handlePackerConfirm = async () => {
    if (!pendingPackerOrderId || !packerName.trim()) return;
    setPackerDialogOpen(false);
    await applyOrderStatusChange(pendingPackerOrderId, "Pågående", packerName.trim());
    setPendingPackerOrderId(null);
    setPackerName("");
  };

  const handleArchiveOrder = async (orderId: string) => {
    const { error } = await supabase
      .from("shop_orders")
      .update({ status: "Arkiverad" })
      .eq("id", orderId);
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Order arkiverad" });
    await logActivity({
      action_type: "status_change",
      description: `Order arkiverad`,
      entity_type: "shop_order",
      entity_id: orderId,
      performed_by: loggedInName ?? undefined,
    });
    qc.invalidateQueries({ queryKey: ["shop_orders"] });
    qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
    setArchiveConfirmOrder(null);
    if (selectedOrder?.id === orderId) setSelectedOrderId(null);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            <ShoppingCart className="h-6 w-6 text-primary sm:h-7 sm:w-7" /> Ordrar från butiker
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">Hantera inkomna beställningar från alla butiker. Uppdatera produktstatus i totalvyn.</p>
        </div>
        <Button size="lg" className="h-12 gap-2 px-5 text-base" onClick={() => setCreatingOrder(true)}>
          <Plus className="h-5 w-5" /> Skapa order åt butik
        </Button>
      </div>

      {/* Inline order creation form */}
      {creatingOrder && (
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-heading">Skapa order åt butik</CardTitle>
                <CardDescription className="text-xs">Välj en kund/butik och lägg till produkter. Ordern visas direkt i butikens ordervy.</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setCreatingOrder(false); resetCreateForm(); }}>
                <X className="h-3.5 w-3.5 mr-1" /> Stäng
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Välj kund / butik <span className="text-destructive">*</span></Label>
              <Select value={selectedCustomerId} onValueChange={v => { setSelectedCustomerId(v); setNewOrderDeliveryDate(undefined); }}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Välj kund..." />
                </SelectTrigger>
                <SelectContent>
                  {linkedCustomers.map(c => {
                    const store = stores.find(s => s.id === c.store_id);
                    return (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {store ? `(${store.name})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {linkedCustomers.length === 0 && (
                <p className="text-[10px] text-warning">Inga kunder är kopplade till butiker. Koppla kunder via Kunder-modulen.</p>
              )}
            </div>
            {selectedCustomerId && (
              <>
                <div className="relative">
                  <Label className="text-xs font-medium mb-1.5 block">Lägg till produkter</Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Sök produkt (namn eller SKU)..."
                      value={newProductSearch}
                      onChange={e => { setNewProductSearch(e.target.value); setNewHighlightedIndex(-1); }}
                      onKeyDown={e => {
                        if (filteredNewProducts.length === 0) return;
                        if (e.key === "ArrowDown") { e.preventDefault(); setNewHighlightedIndex(prev => (prev + 1) % filteredNewProducts.length); }
                        else if (e.key === "ArrowUp") { e.preventDefault(); setNewHighlightedIndex(prev => (prev <= 0 ? filteredNewProducts.length - 1 : prev - 1)); }
                        else if (e.key === "Enter" && newHighlightedIndex >= 0 && newHighlightedIndex < filteredNewProducts.length) { e.preventDefault(); addNewProduct(filteredNewProducts[newHighlightedIndex]); }
                      }}
                      className="pl-8 h-8 text-xs"
                    />
                  </div>
                  {filteredNewProducts.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filteredNewProducts.map((p, idx) => (
                        <button key={p.id} className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between ${idx === newHighlightedIndex ? "bg-muted" : "hover:bg-muted/50"}`} onClick={() => addNewProduct(p)} onMouseEnter={() => setNewHighlightedIndex(idx)}>
                          <span className="font-medium text-foreground">{p.name}</span>
                          <span className="text-muted-foreground font-mono text-[10px]">{p.sku} · {p.unit}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {newOrderLines.length > 0 && (
                  <div className="space-y-2">
                    <Separator />
                    <div className="text-xs font-medium text-muted-foreground">{newOrderLines.length} produkt{newOrderLines.length > 1 ? "er" : ""} tillagda</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-border"><th className="pb-2 text-left font-medium text-muted-foreground">Produkt</th><th className="pb-2 text-left font-medium text-muted-foreground">Enhet</th><th className="pb-2 text-right font-medium text-muted-foreground w-32">Antal</th><th className="pb-2 w-8"></th></tr></thead>
                        <tbody>
                          {newOrderLines.map((line, idx) => (
                            <tr key={line.product_id} className="border-b border-border/30">
                              <td className="py-2 font-medium text-foreground">{line.product_name}</td>
                              <td className="py-2 text-muted-foreground">{line.unit}</td>
                              <td className="py-2 text-right"><Input type="number" step="0.1" value={line.quantity} onChange={e => updateNewLine(idx, e.target.value)} className="h-7 text-xs w-24 ml-auto text-right" placeholder="0" autoFocus={idx === 0} /></td>
                              <td className="py-2"><Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeNewLine(idx)}><X className="h-3 w-3" /></Button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label className="text-xs">Önskat avgångsdatum <span className="text-destructive">*</span></Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left text-xs h-8 font-normal", !newOrderDeliveryDate && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                        {newOrderDeliveryDate ? format(newOrderDeliveryDate, "yyyy-MM-dd") : "Välj datum..."}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={newOrderDeliveryDate} onSelect={setNewOrderDeliveryDate} disabled={isNewOrderDateDisabled} initialFocus className={cn("p-3 pointer-events-auto")} modifiers={allowedWeekdays ? { allowed: (date: Date) => !isNewOrderDateDisabled(date) } : {}} modifiersClassNames={allowedWeekdays ? { allowed: "!bg-primary/10 !text-primary font-medium" } : {}} />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Anteckning (valfritt)</Label>
                  <Textarea value={newOrderNote} onChange={e => setNewOrderNote(e.target.value)} placeholder="T.ex. brådskande leverans, specialförpackning..." className="text-xs min-h-[50px]" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setCreatingOrder(false); resetCreateForm(); }}>Avbryt</Button>
                  <Button size="sm" className="gap-1.5" onClick={() => setConfirmCreateOpen(true)} disabled={!selectedCustomerId || newOrderLines.filter(l => l.quantity && Number(l.quantity) > 0).length === 0 || !newOrderDeliveryDate}>
                    <ShoppingCart className="h-3.5 w-3.5" /> Skapa order
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Totalt ordrar</p>
          <p className="text-xl font-heading font-bold text-foreground">{totalOrders}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Nya</p>
          <p className="text-xl font-heading font-bold text-primary">{newOrders}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Under behandling</p>
          <p className="text-xl font-heading font-bold text-warning">{inProgress}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Unika produkter</p>
          <p className="text-xl font-heading font-bold text-foreground">{aggregated.length}</p>
        </CardContent></Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap items-stretch justify-start gap-1 rounded-md border border-grid-line bg-card p-1.5 shadow-sm">
          <TabsTrigger value="per-order" className="flex min-h-12 items-center gap-2 rounded-sm px-5 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
            <Eye className="h-4 w-4" /> Per order
            <span className="rounded-sm bg-muted px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground data-[state=active]:bg-background/20">{activeOrders.length}</span>
          </TabsTrigger>
          <TabsTrigger value="total" className="flex min-h-12 items-center gap-2 rounded-sm px-5 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><ListChecks className="h-4 w-4" /> Totalvy</TabsTrigger>
          <TabsTrigger value="delivered" className="flex min-h-12 items-center gap-2 rounded-sm px-5 py-2.5 text-sm text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><Truck className="h-4 w-4" /> Levererade <span className="rounded-sm bg-muted px-1.5 font-mono text-[11px] tabular-nums">{deliveredOrders.length}</span></TabsTrigger>
          <TabsTrigger value="archived" className="flex min-h-12 items-center gap-2 rounded-sm px-5 py-2.5 text-sm text-muted-foreground transition-all data-[state=active]:bg-primary data-[state=active]:font-semibold data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><Archive className="h-4 w-4" /> Arkiverade <span className="rounded-sm bg-muted px-1.5 font-mono text-[11px] tabular-nums">{archivedOrders.length}</span></TabsTrigger>
          <TabsTrigger value="changes" className="relative flex min-h-12 items-center gap-2 rounded-sm px-5 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><Bell className="h-4 w-4" /> Ändringar <span className={`rounded-sm px-1.5 font-mono text-[11px] tabular-nums ${pendingChanges.filter((cr: any) => cr.requested_by !== "grossist").length > 0 ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}>{pendingChanges.filter((cr: any) => cr.requested_by !== "grossist").length}</span></TabsTrigger>
        </TabsList>

        {/* TOTAL VIEW — samma produktrolldown som Kundbeställningar */}
        <TabsContent value="total">
          <WholesaleTotalOrderedView
            orders={orders}
            onOpenOrder={(orderId, productName) => {
              setActiveTab("per-order");
              setSearch("");
              setStatusFilter("Alla");
              setStoreFilter("alla");
              setExpandedOrderIds(new Set([orderId]));
              setTimeout(() => {
                document.getElementById(`wholesale-order-${orderId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }, 220);
            }}
            onStatusChange={(product, status) => handleProductStatusChange({ product_id: "", product_name: product.product_name, category: "", unit: "", totalOrdered: 0, lineIds: product.lineIds, byStore: {}, currentStatus: "" }, status === "pending" ? "" : status)}
          />
        </TabsContent>

        {/* PER ORDER VIEW — samma dag/vecka-flöde som Kundbeställningar */}
        <TabsContent value="per-order">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Sök order, butik eller produkt" value={search} onChange={(e) => setSearch(e.target.value)} className="h-11 pl-9 text-sm" />
              </div>
              <Select value={storeFilter} onValueChange={setStoreFilter}><SelectTrigger className="h-11 w-full text-sm sm:w-[200px]"><SelectValue placeholder="Alla butiker" /></SelectTrigger><SelectContent><SelectItem value="alla">Alla butiker</SelectItem>{retailStores.map((store: any) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent></Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="h-11 w-full text-sm sm:w-[170px]"><SelectValue /></SelectTrigger><SelectContent>{["Alla", "Ny", "Pågående", "Packad", "Skickad", "Levererad", "Avbruten"].map((status) => <SelectItem key={status} value={status}>{status === "Alla" ? "Alla statusar" : status}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border border-grid-line bg-card px-3 py-2.5 shadow-sm">
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={allFilteredMarked} onCheckedChange={markAllFiltered} aria-label="Markera alla synliga ordrar" /><span>{filteredOrders.length} synliga ordrar</span>{marked.length > 0 && <Badge variant="secondary" className="rounded-sm">{marked.length} markerade</Badge>}</div>
              <div className="flex items-center gap-2">{marked.length > 0 && <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => printWholesalePackLists(orders.filter((order: any) => marked.includes(order.id)))}><Printer className="h-3.5 w-3.5" /> Skriv ut markerade</Button>}<span className="font-mono text-xs tabular-nums text-muted-foreground">Aktivt värde {activeOrders.reduce((sum: number, order: any) => sum + formatOrderValue(order), 0).toFixed(2)} kr</span></div>
            </div>
            <div className="overflow-hidden rounded-md border border-grid-line bg-card shadow-sm">
              <WholesaleOrderRowHeader allSelected={allFilteredMarked} onSelectAll={markAllFiltered} />
              {filteredOrders.length === 0 && <div className="px-3 py-12 text-center text-sm text-muted-foreground">Inga ordrar att visa.</div>}
              {filteredOrders.length > 0 && currentOrders.length === 0 && <div className="px-3 py-8 text-center text-sm text-muted-foreground">Inga aktuella ordrar idag eller framåt.</div>}
              {groupedCurrentOrders.map((week) => <div key={week.key}>
                <div className="flex items-center gap-3 border-b-2 border-primary bg-primary/10 px-3 py-2"><span className="text-[12px] font-bold uppercase tracking-wide text-foreground">Vecka {week.week}</span><span className="truncate text-[11px] text-muted-foreground">{rangeLabel([...week.days.keys()])}</span><span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{week.count} order</span></div>
                {[...week.days.entries()].map(([day, dayOrders]) => <div key={day} className={day === todayIso ? "bg-primary/[0.04]" : undefined}>
                  <div className={`flex items-center gap-2 border-b px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${day === todayIso ? "border-primary/40 bg-primary/15 text-foreground" : "border-grid-line bg-muted text-muted-foreground"}`}><span className="truncate">{dayLabel(day)}</span>{day === todayIso && <Badge className="rounded-sm px-1.5 py-0 text-[10px]">Idag</Badge>}<span className="font-mono normal-case tabular-nums">{dayOrders.length} order</span></div>
                  {dayOrders.map((order: any) => <WholesaleOrderAccordionRow key={order.id} order={order} day={day} open={expandedOrderIds.has(order.id)} selected={marked.includes(order.id)} stores={stores} photoCount={photoCounts?.[order.id] ?? 0} onToggle={toggleExpandOrder} onSelect={toggleMarked} onStatusChange={handleOrderStatusChange} onPrint={setPackingSlipOrder} onArchive={setArchiveConfirmOrder} onClose={collapseOrder} />)}
                </div>)}
              </div>)}
              {historicOrders.length > 0 && <div className="border-t border-grid-line">
                <button type="button" onClick={() => setShowHistory((v) => !v)} className="flex w-full items-center gap-2 bg-muted/60 px-3 py-2.5 text-left text-[12px] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted">
                  <ChevronRight className={`h-4 w-4 transition-transform ${showHistory ? "rotate-90" : ""}`} />
                  <span>Historiska ordrar</span>
                  <span className="ml-auto font-mono text-[11px] normal-case tabular-nums">{historicOrders.length} order</span>
                </button>
                {showHistory && groupedHistoricOrders.map((week) => <div key={week.key}>
                  <div className="flex items-center gap-3 border-b border-grid-line bg-muted/40 px-3 py-2"><span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Vecka {week.week}</span><span className="truncate text-[11px] text-muted-foreground">{rangeLabel([...week.days.keys()])}</span><span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">{week.count} order</span></div>
                  {[...week.days.entries()].map(([day, dayOrders]) => <div key={day}>
                    <div className="flex items-center gap-2 border-b border-grid-line bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><span className="truncate">{dayLabel(day)}</span><span className="font-mono normal-case tabular-nums">{dayOrders.length} order</span></div>
                    {dayOrders.map((order: any) => <WholesaleOrderAccordionRow key={order.id} order={order} day={day} open={expandedOrderIds.has(order.id)} selected={marked.includes(order.id)} stores={stores} photoCount={photoCounts?.[order.id] ?? 0} onToggle={toggleExpandOrder} onSelect={toggleMarked} onStatusChange={handleOrderStatusChange} onPrint={setPackingSlipOrder} onArchive={setArchiveConfirmOrder} onClose={collapseOrder} />)}
                  </div>)}
                </div>)}
              </div>}

            </div>
          </div>
        </TabsContent>

        {/* DELIVERED ORDERS */}
        <TabsContent value="delivered">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Levererade ordrar</CardTitle>
              <CardDescription className="text-xs">Ordrar som levererats till butik. Arkivera för att ta bort från Per order-vyn.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 h-7">
                      <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">V.</th>
                      <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">DATUM</th>
                      <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">BUTIK</th>
                      <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">ÖN.LEV.</th>
                      <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">RAD</th>
                      <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">PRODUKTER</th>
                      <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">VÄRDE</th>
                      <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">PACK.</th>
                      <th className="px-1.5 py-0.5 text-center font-medium text-muted-foreground">ARK.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deliveredOrders.length === 0 && (
                      <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Inga levererade ordrar.</td></tr>
                    )}
                    {deliveredOrders.map((o: any) => (
                      <React.Fragment key={o.id}>
                        <tr className={`border-b border-border/40 h-7 cursor-pointer hover:bg-muted/20 bg-primary/5 ${expandedOrderIds.has(o.id) ? "bg-primary/10 border-l-2 border-l-primary border-b-0" : ""}`} onClick={() => toggleExpandOrder(o.id)}>
                          <td className="px-1.5 py-0.5 font-mono font-medium text-foreground">{displayOrderWeek(o)}</td>
                          <td className="px-1.5 py-0.5 text-muted-foreground whitespace-nowrap">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                          <td className="px-1.5 py-0.5 text-muted-foreground whitespace-nowrap">{o.stores?.name || "–"}</td>
                          <td className="px-1.5 py-0.5 text-muted-foreground whitespace-nowrap">{(o as any).desired_delivery_date || "–"}</td>
                          <td className="px-1.5 py-0.5 text-right text-foreground">{o.shop_order_lines?.length || 0}</td>
                          <td className="px-1.5 py-0.5 text-muted-foreground text-[9px] max-w-32 truncate">
                            {o.shop_order_lines?.map((l: any) => `${l.products?.name} (${l.quantity_ordered}${l.unit || ""})`).join(", ") || "–"}
                          </td>
                          <td className="px-1.5 py-0.5 text-right font-mono text-foreground text-[9px] whitespace-nowrap">
                            {(o.shop_order_lines || []).reduce((sum: number, l: any) => sum + (l.quantity_delivered || l.quantity_ordered || 0) * (l.products?.wholesale_price || 0), 0).toFixed(0)}kr
                          </td>
                          <td className="px-1.5 py-0.5 text-muted-foreground text-[9px] whitespace-nowrap">{o.packer_name || "–"}</td>
                          <td className="px-1.5 py-0.5 text-center" onClick={e => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[9px] px-1 text-muted-foreground hover:text-foreground"
                              onClick={() => setArchiveConfirmOrder(o)}
                            >
                              <Archive className="h-2.5 w-2.5" />
                            </Button>
                          </td>
                        </tr>
                        {expandedOrderIds.has(o.id) && (
                          <tr>
                            <td colSpan={9} className="p-0">
                              <div className="border-l-2 border-l-primary border-b-2 border-b-primary/20 bg-primary/5 px-4 py-3">
                                <div className="flex items-center justify-between mb-3">
                                  <h3 className="font-heading text-sm font-semibold">
                                    Order vecka {displayOrderWeek(o)} — {o.stores?.name || "Okänd butik"}
                                  </h3>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); collapseOrder(o.id); }}>
                                    <X className="h-3 w-3 mr-1" /> Stäng
                                  </Button>
                                </div>
                                <WholesaleOrderDetail order={o} onClose={() => collapseOrder(o.id)} stores={stores} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ARCHIVED ORDERS */}
        <TabsContent value="archived">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Arkiverade ordrar</CardTitle>
              <CardDescription className="text-xs">Ordrar som har slutbehandlats och arkiverats.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                     <tr className="border-b border-border bg-muted/30 h-7">
                       <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">V.</th>
                       <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">DATUM</th>
                       <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">BUTIK</th>
                       <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">ÖN.LEV.</th>
                       <th className="px-1.5 py-0.5 text-right font-medium text-muted-foreground">RAD</th>
                       <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">PRODUKTER</th>
                       <th className="px-1.5 py-0.5 text-left font-medium text-muted-foreground">ANT.</th>
                     </tr>
                  </thead>
                  <tbody>
                    {archivedOrders.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Inga arkiverade ordrar.</td></tr>
                    )}
                    {archivedOrders.map((o: any) => (
                      <React.Fragment key={o.id}>
                        <tr className={`border-b border-border/40 cursor-pointer hover:bg-muted/20 ${expandedOrderIds.has(o.id) ? "bg-primary/10 border-l-2 border-l-primary border-b-0" : ""}`} onClick={() => toggleExpandOrder(o.id)}>
                          <td className="p-3 font-mono font-medium text-foreground">{displayOrderWeek(o)}</td>
                          <td className="p-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                          <td className="p-3 text-muted-foreground">{o.stores?.name || "–"}</td>
                          <td className="p-3 text-muted-foreground">{(o as any).desired_delivery_date || "–"}</td>
                          <td className="p-3 text-right text-foreground">{o.shop_order_lines?.length || 0}</td>
                          <td className="p-3 text-muted-foreground text-[10px] max-w-48 truncate">
                            {o.shop_order_lines?.map((l: any) => `${l.products?.name} (${l.quantity_ordered} ${l.unit || ""})`).join(", ") || "–"}
                          </td>
                          <td className="p-3 text-muted-foreground text-[10px] max-w-32 truncate">{o.notes || "–"}</td>
                        </tr>
                        {expandedOrderIds.has(o.id) && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <div className="border-l-2 border-l-primary border-b-2 border-b-primary/20 bg-primary/5 px-4 py-3">
                                <div className="flex items-center justify-between mb-3">
                                  <h3 className="font-heading text-sm font-semibold">
                                    Order {displayOrderWeek(o)} — {o.stores?.name || "Okänd butik"}
                                  </h3>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]" onClick={(e) => { e.stopPropagation(); collapseOrder(o.id); }}>
                                    <X className="h-3 w-3 mr-1" /> Stäng
                                  </Button>
                                </div>
                                <WholesaleOrderDetail order={o} onClose={() => collapseOrder(o.id)} stores={stores} />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        {/* CHANGE REQUESTS */}
        <TabsContent value="changes">
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Ändringsförfrågningar från butiker</CardTitle>
              <CardDescription className="text-xs">
                Butiker har begärt ändringar på sina ordrar. Godkänn eller neka varje ändring.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const shopInitiated = pendingChanges.filter((cr: any) => cr.requested_by !== "grossist");
                return shopInitiated.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">Inga väntande ändringsförfrågningar.</p>
              ) : (
                <div className="space-y-2">
                  {shopInitiated.map((cr: any) => (
                    <div key={cr.id} className="border border-warning/30 bg-warning/5 rounded-md p-3 text-xs flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-0.5">
                        <div className="font-medium text-foreground">
                          {cr.shop_orders?.stores?.name || "Okänd butik"} · {displayOrderWeek(cr.shop_orders)}
                        </div>
                        <div className="text-muted-foreground">
                          {cr.change_type === "quantity_change" && (
                            <>Ändra antal: <span className="font-mono">{cr.old_value}</span> → <span className="font-mono font-bold text-foreground">{cr.new_value}</span> {cr.unit}</>
                          )}
                          {cr.change_type === "add_line" && (
                            <>Ny produkt: <span className="font-medium text-foreground">{cr.products?.name}</span> — {cr.new_value} {cr.unit}</>
                          )}
                          {cr.change_type === "delivery_date" && (
                            <>Leveransdatum: <span className="font-mono">{cr.old_value}</span> → <span className="font-mono font-bold text-foreground">{cr.new_value}</span></>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground/60">{new Date(cr.created_at).toLocaleString("sv-SE")}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1 text-success border-success/30 hover:bg-success/10"
                          onClick={() => resolveChange.mutate({ id: cr.id, status: "Godkänd" })}
                          disabled={resolveChange.isPending}
                        >
                          <Check className="h-3 w-3" /> Godkänn
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => resolveChange.mutate({ id: cr.id, status: "Nekad" })}
                          disabled={resolveChange.isPending}
                        >
                          <X className="h-3 w-3" /> Neka
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              );
              })()}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>




      <Dialog open={!!reportViewOrder} onOpenChange={open => { if (!open) setReportViewOrder(null); }}>
        <DialogContent className="max-w-lg">
          {reportViewOrder && (() => {
            const reports = reportsByOrder.get(reportViewOrder.id) || [];
            const hasIssues = reports.some((r: any) => r.status === "Rapporterad");
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="font-heading text-sm flex items-center gap-2">
                    Leveransrapport — {displayOrderWeek(reportViewOrder)} · {reportViewOrder.stores?.name}
                    <Badge variant="outline" className={`text-[10px] ml-2 ${hasIssues ? "text-warning border-warning/30" : "text-success border-success/30"}`}>
                      {hasIssues ? "Avvikelse" : "Allt godkänt"}
                    </Badge>
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-2">
                  {(reportViewOrder.shop_order_lines || []).map((line: any) => {
                    const report = reports.find((r: any) => r.order_line_id === line.id);
                    return (
                      <div key={line.id} className={`p-2.5 rounded-md border text-xs ${
                        report?.status === "Rapporterad" ? "border-warning/40 bg-warning/5" : "border-border"
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-foreground">{line.products?.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground">{line.quantity_ordered} {line.unit}</span>
                            <Badge variant="outline" className={`text-[10px] ${
                              report?.status === "Rapporterad" ? "text-warning border-warning/30" : "text-success border-success/30"
                            }`}>
                              {report?.status || "Ej rapporterad"}
                            </Badge>
                          </div>
                        </div>
                        {report?.status === "Rapporterad" && (
                          <div className="mt-1.5 text-[10px] text-muted-foreground space-y-0.5 pl-1 border-l-2 border-warning/30 ml-1">
                            {report.report_type && <p><span className="font-medium text-foreground">Typ:</span> {report.report_type}</p>}
                            {report.quantity_received != null && (
                              <p><span className="font-medium text-foreground">Mottaget:</span> {report.quantity_received} (beställt: {line.quantity_ordered})</p>
                            )}
                            {report.notes && <p><span className="font-medium text-foreground">Anteckning:</span> {report.notes}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <DialogFooter>
                  <Button variant="outline" size="sm" className="text-xs" onClick={() => setReportViewOrder(null)}>Stäng</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Archive confirmation dialog */}
      <Dialog open={!!archiveConfirmOrder} onOpenChange={open => { if (!open) setArchiveConfirmOrder(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">Arkivera order?</DialogTitle>
            <DialogDescription className="text-xs">
              Är du säker på att du vill arkivera order {displayOrderWeek(archiveConfirmOrder)} från {archiveConfirmOrder?.stores?.name}? Ordern flyttas till fliken "Arkiverade".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setArchiveConfirmOrder(null)}>Avbryt</Button>
            <Button size="sm" className="text-xs" onClick={() => handleArchiveOrder(archiveConfirmOrder?.id)}>Bekräfta arkivering</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Packer name dialog */}
      <Dialog open={packerDialogOpen} onOpenChange={(open) => { if (!open) { setPackerDialogOpen(false); setPendingPackerOrderId(null); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading text-sm">Vem packar ordern?</DialogTitle>
            <DialogDescription className="text-xs">
              Välj den anställda som packar denna order.
            </DialogDescription>
          </DialogHeader>
          <Select value={packerName} onValueChange={setPackerName}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Välj packare..." />
            </SelectTrigger>
            <SelectContent>
              {staffList.map((s: any) => (
                <SelectItem key={s.id} value={`${s.first_name} ${s.last_name}`}>
                  {s.first_name} {s.last_name} {s.workplace ? `(${s.workplace})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => { setPackerDialogOpen(false); setPendingPackerOrderId(null); }}>Avbryt</Button>
            <Button size="sm" className="text-xs" disabled={!packerName.trim()} onClick={handlePackerConfirm}>Bekräfta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Packing slip dialog */}
      <PackingSlip order={packingSlipOrder} open={!!packingSlipOrder} onOpenChange={(open) => { if (!open) setPackingSlipOrder(null); }} />
      <DeliveryNote order={deliveryNoteOrder} open={!!deliveryNoteOrder} onOpenChange={(open) => { if (!open) setDeliveryNoteOrder(null); }} />

      {/* Confirmation dialog for creating order */}
      <Dialog open={confirmCreateOpen} onOpenChange={setConfirmCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading">Bekräfta order</DialogTitle>
            <DialogDescription className="text-xs">
              Skapa order med {newOrderLines.filter(l => l.quantity && Number(l.quantity) > 0).length} produkt(er) åt {selectedCustomer?.name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setConfirmCreateOpen(false)}>Avbryt</Button>
            <Button size="sm" className="gap-1.5" onClick={() => { setConfirmCreateOpen(false); handleCreateWholesaleOrder(); }}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Ja, skapa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/* ---- Wholesaler order detail with "Ej tillgänglig" + alternative capability ---- */
function WholesaleOrderDetail({ order, onClose, stores }: { order: any; onClose: () => void; stores: any[] }) {
  const { toast } = useToast();
  const createChange = useCreateChangeRequest();
  const updateLineStatus = useUpdateOrderLineStatus();
  const { data: infiniteStock = true } = useQuery({
    queryKey: ["infinite_stock"],
    queryFn: isInfiniteStock,
    staleTime: 5 * 60 * 1000,
  });

  const savePackedValue = async (el: HTMLInputElement, line: any, qtyOrdered: number, availableStock: number, orderId: string) => {
    const val = Number(el.value);
    if (!val || val <= 0) return;
    if (!infiniteStock && val > availableStock) {
      toast({ title: "Otillräckligt lager", description: `Max tillgängligt: ${Number(availableStock.toFixed(1))}`, variant: "destructive" });
      el.value = String(Number(availableStock.toFixed(1)));
      return;
    }
    const unit = line.unit || line.products?.unit || "kg";
    let deviation: string | null = null;
    if (val !== qtyOrdered) {
      deviation = val > qtyOrdered
        ? `+${(val - qtyOrdered).toFixed(1)} ${unit} mer än beställt`
        : `-${(qtyOrdered - val).toFixed(1)} ${unit} mindre än beställt`;
    }
    await supabase
      .from("shop_order_lines")
      .update({ quantity_delivered: val, deviation })
      .eq("id", line.id);
    updateLineStatus.mutate(
      { lineId: line.id, newStatus: "Packad", orderId },
      { onSuccess: () => toast({ title: `Packad: ${val} ${unit}` }) }
    );
  };
  const { data: allStock = [] } = useAllStockByLocation();
  const { data: allProducts } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, unit").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Tillgängligt vid packning läses ur det aktiva grossistlagret (nivå), aldrig
  // ur den gamla namngivna platsen "Grossist Flytande" som är inaktiverad.
  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of allStock) {
      if (s.storage_locations?.location_type !== "grossistlager") continue;
      const pid = s.product_id;
      map.set(pid, (map.get(pid) || 0) + Number(s.quantity));
    }
    return map;
  }, [allStock]);


  const [altDialogLine, setAltDialogLine] = useState<any>(null);
  const [altProductId, setAltProductId] = useState<string>("");
  const [altSearch, setAltSearch] = useState("");

  const handleMarkUnavailable = async (line: any) => {
    await createChange.mutateAsync({
      shop_order_id: order.id,
      order_line_id: line.id,
      change_type: "product_unavailable",
      product_id: line.product_id,
      old_value: String(line.quantity_ordered),
      new_value: "0",
      unit: line.unit || line.products?.unit || "ST",
      requested_by: "grossist",
    });
    toast({ title: "Förfrågan skickad", description: `"${line.products?.name}" markerad som ej tillgänglig.` });
  };

  const handleSuggestAlternative = async () => {
    if (!altDialogLine || !altProductId) return;
    const altProduct = allProducts?.find((p: any) => p.id === altProductId);
    await createChange.mutateAsync({
      shop_order_id: order.id,
      order_line_id: altDialogLine.id,
      change_type: "product_alternative",
      product_id: altProductId,
      old_value: altDialogLine.product_id,
      new_value: altProduct?.name || altProductId,
      unit: altDialogLine.unit || altDialogLine.products?.unit || "ST",
      requested_by: "grossist",
    });
    toast({ title: "Alternativ föreslagit", description: `Alternativ "${altProduct?.name}" föreslaget för "${altDialogLine.products?.name}".` });
    setAltDialogLine(null);
    setAltProductId("");
    setAltSearch("");
  };

  const filteredProducts = useMemo(() => {
    if (!allProducts) return [];
    const s = altSearch.toLowerCase();
    return allProducts.filter((p: any) =>
      p.id !== altDialogLine?.product_id &&
      (p.name.toLowerCase().includes(s) || !s)
    ).slice(0, 20);
  }, [allProducts, altSearch, altDialogLine]);

  return (
    <>
      <div className="flex items-center gap-2 px-2 pb-1">
        <span className="text-xs text-muted-foreground">Bilder på ordern:</span>
        <OrderPhotosButton
          entityType={ORDER_PHOTO_ENTITY}
          entityId={order.id}
          title={`Order ${order.order_number || ""}`}
        />
      </div>
       <div className="overflow-x-auto">
         <table className="w-full min-w-[1040px] table-fixed text-xs">
           <colgroup>
             <col className="w-[240px]" />
             <col className="w-14" />
             <col className="w-16" />
             <col className="w-16" />
             <col className="w-16" />
             <col className="w-24" />
             <col className="w-32" />
             <col className="w-12" />
             <col className="w-36" />
             <col className="w-20" />
           </colgroup>
           <thead>
             <tr className="border-b border-border bg-muted/30">
               <th className="px-2 py-1 text-left font-medium text-muted-foreground">Produkt</th>
               <th className="px-2 py-1 text-left font-medium text-muted-foreground">Enhet</th>
               <th className="px-2 py-1 text-right font-medium text-muted-foreground">Beställt</th>
               <th className="px-2 py-1 text-right font-medium text-muted-foreground">Lager</th>
               <th className="px-2 py-1 text-right font-medium text-muted-foreground">Packat</th>
               <th className="px-2 py-1 text-left font-medium text-muted-foreground">Avvikelse</th>
               <th className="px-2 py-1 text-left font-medium text-muted-foreground">Status</th>
               <th className="px-2 py-1 text-center font-medium text-muted-foreground">Bild</th>
               <th className="px-2 py-1 text-center font-medium text-muted-foreground">Åtgärd</th>
               <th className="px-2 py-1 text-right font-medium text-muted-foreground">Värde (kr)</th>
             </tr>
           </thead>
          <tbody>
            {(() => {
              const allLines = order.shop_order_lines || [];
              const groups = new Map<string, any[]>();
              for (const l of allLines) {
                const cat = l.products?.category || "Övrigt";
                if (!groups.has(cat)) groups.set(cat, []);
                groups.get(cat)!.push(l);
              }
              const sortedCats = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b, "sv"));
              const ordered: { line: any; catHeader: string | null }[] = [];
              for (const cat of sortedCats) {
                const catLines = groups.get(cat)!.slice().sort((a: any, b: any) =>
                  (a.products?.name || "").localeCompare(b.products?.name || "", "sv"));
                catLines.forEach((line: any, i: number) => ordered.push({ line, catHeader: i === 0 ? cat : null }));
              }
              return ordered.map(({ line, catHeader }: any) => {

              const qtyOrdered = line.quantity_ordered || 0;
              const qtyDelivered = line.quantity_delivered || 0;
              const wholesalePrice = line.products?.wholesale_price || 0;
              const lineValue = (qtyDelivered || qtyOrdered) * wholesalePrice;
              const hasDiff = qtyDelivered > 0 && qtyDelivered !== qtyOrdered;
              const isUnavailable = line.status === "Ej tillgänglig";
              const currentStatus = line.status || "Ny";
              const stockQty = stockByProduct.get(line.product_id) || 0;
              const alreadyPacked = currentStatus === "Packad" ? qtyDelivered : 0;
              const availableStock = stockQty + alreadyPacked;
              const idx = STATUS_FLOW.indexOf(currentStatus as any);
              const prev = idx > 0 ? STATUS_FLOW[idx - 1] : null;
              const next = idx === -1 ? "Pågående" : (idx < STATUS_FLOW.length - 1 ? STATUS_FLOW[idx + 1] : null);

              return (
                <React.Fragment key={line.id}>
                 {catHeader && (
                   <tr className="bg-muted/40">
                     <td colSpan={10} className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                       ▸ {catHeader}
                     </td>
                   </tr>
                 )}
                <tr className={`border-b border-border/30 h-7 transition-colors ${
                  isUnavailable ? "opacity-50 bg-destructive/5" :
                  currentStatus === "Skickad" ? "bg-primary/10" :
                  currentStatus === "Packad" || currentStatus === "Producerad" ? "bg-success/10" :
                  currentStatus === "Beställd" ? "bg-accent/20" :
                  currentStatus === "Pågående" ? "bg-warning/10" :
                  ""
                }`}>
                   <td className="min-w-0 px-2 py-0.5 font-medium text-foreground">
                     <div className="flex min-w-0 items-center gap-2">
                       <ProductThumb src={line.products?.image_url} alt={line.products?.name || "Produkt"} static className="h-5 w-7 shrink-0" />
                       <span className="truncate" title={line.products?.name || undefined}>{line.products?.name || "–"}</span>
                     </div>
                   </td>
                  <td className="px-2 py-0.5 text-muted-foreground">{line.unit || line.products?.unit || "–"}</td>
                  <td className="px-2 py-0.5 text-right font-mono text-foreground">{qtyOrdered}</td>
                  <td className={`px-2 py-0.5 text-right font-mono ${infiniteStock ? "text-success" : availableStock >= qtyOrdered ? "text-success" : availableStock > 0 ? "text-warning" : "text-destructive"}`}>
                    {infiniteStock ? <span title="Obegränsat lager (uppstartsläge)">∞</span> : availableStock > 0 ? Number(availableStock.toFixed(1)) : "0"}
                  </td>
                  <td className="px-2 py-0.5 text-right">
                    {(() => {
                      const isLocked = currentStatus === "Packad" || currentStatus === "Skickad" || currentStatus === "Klar / Levererad" || currentStatus === "Levererad";
                      return isLocked ? (
                        <span className="w-16 inline-block text-right text-xs font-mono text-muted-foreground">{qtyDelivered || "–"}</span>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          max={infiniteStock ? undefined : availableStock}
                          defaultValue={qtyDelivered || ""}
                          placeholder="0"
                          className="w-16 h-6 text-right text-xs font-mono bg-background border border-border rounded px-1 focus:outline-none focus:ring-1 focus:ring-primary"
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const el = e.target as HTMLInputElement;
                              await savePackedValue(el, line, qtyOrdered, availableStock, order.id);
                            }
                          }}
                          onBlur={async (e) => {
                            const el = e.target as HTMLInputElement;
                            await savePackedValue(el, line, qtyOrdered, availableStock, order.id);
                          }}
                        />
                      );
                    })()}
                  </td>
                  <td className="px-2 py-0.5 text-muted-foreground text-[10px]">
                    {line.deviation ? (
                      <span className="text-warning">{line.deviation}</span>
                    ) : hasDiff ? (
                      <span className="text-warning">
                        {qtyDelivered > qtyOrdered
                          ? `+${(qtyDelivered - qtyOrdered).toFixed(1)} ${line.unit || line.products?.unit || "kg"} mer`
                          : `-${(qtyOrdered - qtyDelivered).toFixed(1)} ${line.unit || line.products?.unit || "kg"} mindre`}
                      </span>
                    ) : "–"}
                  </td>
                  <td className="px-2 py-0.5">
                    <Select
                      value={currentStatus}
                      disabled={updateLineStatus.isPending}
                      onValueChange={(val) => {
                        if (val !== currentStatus) {
                          updateLineStatus.mutate(
                            { lineId: line.id, newStatus: val, orderId: order.id },
                            { onSuccess: () => toast({ title: `Status: ${val}` }) }
                          );
                        }
                      }}
                    >
                      <SelectTrigger className={`h-6 text-[10px] w-[110px] px-2 ${
                        currentStatus === "Ej tillgänglig" ? "text-destructive border-destructive/20" :
                        currentStatus === "Packad" || currentStatus === "Producerad" ? "text-success border-success/20" :
                        currentStatus === "Skickad" ? "text-primary border-primary/20" :
                        currentStatus === "Beställd" ? "text-accent-foreground border-accent" :
                        currentStatus === "Pågående" ? "text-warning border-warning/20" :
                        ""
                      }`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[...STATUS_FLOW, "Beställd", "Ej tillgänglig"].map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                   </td>
                   <td className="px-2 py-0.5 text-center">
                     <OrderPhotosButton
                       compact
                       entityType={ORDER_LINE_PHOTO_ENTITY}
                       entityId={line.id}
                       productId={line.product_id}
                       title={line.products?.name || "Orderrad"}
                     />
                   </td>
                   <td className="px-2 py-0.5 text-center">

                    {!isUnavailable && (
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 text-[10px] gap-0.5 text-destructive border-destructive/30 hover:bg-destructive/10 px-1.5"
                          onClick={() => handleMarkUnavailable(line)}
                          disabled={createChange.isPending}
                        >
                          <Ban className="h-2.5 w-2.5" /> Ej tillg.
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-5 text-[10px] gap-0.5 text-primary border-primary/30 hover:bg-primary/10 px-1.5"
                          onClick={() => { setAltDialogLine(line); setAltProductId(""); setAltSearch(""); }}
                          disabled={createChange.isPending}
                        >
                          <Package className="h-2.5 w-2.5" /> Alt.
                        </Button>
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-0.5 text-right font-mono text-foreground">{lineValue.toFixed(2)}</td>
                </tr>
                </React.Fragment>
              );
              });
            })()}

          </tbody>
        </table>
      </div>

      {/* Total order value */}
      {(() => {
        const totalValue = (order.shop_order_lines || []).reduce((sum: number, line: any) => {
          const qty = line.quantity_delivered || line.quantity_ordered || 0;
          const price = line.products?.wholesale_price || 0;
          return sum + qty * price;
        }, 0);
        return (
          <div className="flex justify-end mt-3 px-2">
            <div className="bg-muted/40 rounded-md px-4 py-2 border border-border">
              <span className="text-xs font-medium text-muted-foreground mr-3">Totalt Ordervärde:</span>
              <span className="text-sm font-bold font-mono text-foreground">{totalValue.toFixed(2)} kr</span>
            </div>
          </div>
        );
      })()}

      {/* Alternative product dialog */}
      <Dialog open={!!altDialogLine} onOpenChange={(open) => { if (!open) setAltDialogLine(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Föreslå alternativ produkt</DialogTitle>
            <DialogDescription className="text-xs">
              Ersätt <span className="font-semibold">{altDialogLine?.products?.name}</span> med en alternativ produkt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Sök produkt..."
              value={altSearch}
              onChange={(e) => setAltSearch(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="max-h-48 overflow-y-auto border rounded-md">
              {filteredProducts.map((p: any) => (
                <div
                  key={p.id}
                  className={`px-3 py-2 text-xs cursor-pointer hover:bg-muted/50 flex items-center justify-between ${altProductId === p.id ? "bg-primary/10 font-medium" : ""}`}
                  onClick={() => setAltProductId(p.id)}
                >
                  <span>{p.name}</span>
                  <span className="text-muted-foreground">{p.unit}</span>
                </div>
              ))}
              {filteredProducts.length === 0 && (
                <p className="text-xs text-muted-foreground p-3">Inga produkter hittades.</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAltDialogLine(null)}>Avbryt</Button>
            <Button size="sm" disabled={!altProductId || createChange.isPending} onClick={handleSuggestAlternative}>
              Föreslå alternativ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose}>Stäng</Button>
      </DialogFooter>
    </>
  );
}
