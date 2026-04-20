import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Package,
  Search,
  CheckCircle2,
  Clock,
  Truck,
  AlertTriangle,
  X,
  ThumbsUp,
  Flag,
  Eye,
  Calendar,
  CalendarCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSite } from "@/contexts/SiteContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubmitReceivingReport } from "@/hooks/useDeliveryReceivingReports";
import { moveStockToRawLager } from "@/lib/stockTransfer";
import { format, differenceInDays, parseISO } from "date-fns";
import { sv } from "date-fns/locale";
import { getStoreCurrency, fmtCur } from "@/lib/currency";
import { useCurrencySettings, convertSekToChfCost } from "@/hooks/useCurrencySettings";

const REPORT_TYPES = ["Skadad", "Fel kvantitet", "Dålig kvalitet", "Saknas", "Annat"];

interface LineReport {
  status: "Godkänd" | "Rapporterad";
  report_type?: string;
  notes?: string;
  quantity_received?: string;
  confirmed?: boolean;
  // NEW: freshness fields captured at receiving
  arrival_date?: string;
  expiry_date?: string;
  // NEW: per-unit cost in shop's local currency (CHF for Zollikon)
  unit_cost_local?: string;
}

// Helper: color-code expiry dates entered during receiving
function getExpiryColor(expiryDate: string): string {
  if (!expiryDate) return "";
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0) return "border-destructive/50 bg-destructive/5";
  if (days <= 2) return "border-destructive/30 bg-destructive/5";
  if (days <= 5) return "border-amber-500/30 bg-amber-500/5";
  return "border-emerald-500/30 bg-emerald-500/5";
}

function getExpiryLabel(expiryDate: string): { text: string; class: string } | null {
  if (!expiryDate) return null;
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0) return { text: `Utgången`, class: "text-destructive" };
  if (days <= 2) return { text: `${days}d kvar – kritisk!`, class: "text-destructive" };
  if (days <= 5) return { text: `${days}d kvar – kort hållbarhet`, class: "text-amber-600" };
  return { text: `${days}d kvar`, class: "text-emerald-600" };
}

export default function Receiving() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeStoreId } = useSite();
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const submitReport = useSubmitReceivingReport();
  const [lineReports, setLineReports] = useState<Record<string, LineReport>>({});
  const { data: currencySettings } = useCurrencySettings();

  // Fetch active store row to derive local currency (CHF for Zollikon, SEK otherwise)
  const { data: activeStore } = useQuery({
    queryKey: ["store_row", activeStoreId],
    enabled: !!activeStoreId,
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, city").eq("id", activeStoreId!).maybeSingle();
      return data;
    },
  });
  const localCurrency = getStoreCurrency(activeStore as any);
  const isChfStore = localCurrency === "CHF";

  // Only fetch orders with status "Skickad"
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["pending-deliveries", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return [];
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, stores(name), shop_order_lines(*, products(name, unit, category, cost_price))")
        .eq("store_id", activeStoreId)
        .eq("status", "Skickad")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: existingReports = [] } = useQuery({
    queryKey: ["delivery_receiving_reports", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return [];
      const { data, error } = await supabase
        .from("delivery_receiving_reports")
        .select("*")
        .eq("store_id", activeStoreId);
      if (error) throw error;
      return data;
    },
  });

  const { data: completedOrders = [] } = useQuery({
    queryKey: ["completed-deliveries", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return [];
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, stores(name), shop_order_lines(*, products(name, unit, category))")
        .eq("store_id", activeStoreId)
        .eq("status", "Levererad")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const reportedOrderLineIds = useMemo(() => {
    return new Set(existingReports.map((r: any) => r.order_line_id));
  }, [existingReports]);

  const reportedOrderIds = useMemo(() => {
    const ids = new Set<string>();
    existingReports.forEach((r: any) => ids.add(r.shop_order_id));
    return ids;
  }, [existingReports]);

  const unreportedOrders = pendingOrders.filter((o: any) => !reportedOrderIds.has(o.id));
  const reportedPendingOrders = pendingOrders.filter((o: any) => reportedOrderIds.has(o.id));

  // Auto-calculate expiry date from arrival date + product shelf_life_days
  const calcExpiry = (arrivalDate: string, shelfLifeDays: number | null): string => {
    if (!arrivalDate || !shelfLifeDays) return "";
    const d = new Date(arrivalDate);
    d.setDate(d.getDate() + shelfLifeDays);
    return d.toISOString().slice(0, 10);
  };

  // Compute auto CHF cost for a line based on product cost (SEK) + transport
  const autoChfCost = (line: any): string => {
    if (!isChfStore || !currencySettings) return "";
    const sek = Number(line?.products?.cost_price) || 0;
    if (sek <= 0) return "";
    return String(convertSekToChfCost(sek, currencySettings));
  };

  const openOrder = (order: any) => {
    setSelectedOrder(order);
    const today = new Date().toISOString().slice(0, 10);
    const initial: Record<string, LineReport> = {};
    (order.shop_order_lines || []).forEach((line: any) => {
      const shelfLife = line.products?.shelf_life_days || null;
      initial[line.id] = {
        status: "Godkänd",
        quantity_received: String(line.quantity_delivered || line.quantity_ordered),
        confirmed: false,
        arrival_date: today,
        // Auto-fill expiry if product has shelf_life_days set
        expiry_date: calcExpiry(today, shelfLife),
        unit_cost_local: autoChfCost(line),
      };
    });
    setLineReports(initial);
  };

  const updateLineReport = (lineId: string, field: string, value: string) => {
    setLineReports((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!selectedOrder || !activeStoreId) return;

    // Warn if any line has a very short expiry
    const criticalLines = Object.entries(lineReports).filter(([, r]) => {
      if (!r.expiry_date) return false;
      return differenceInDays(parseISO(r.expiry_date), new Date()) <= 2;
    });
    if (criticalLines.length > 0) {
      const confirmed = window.confirm(
        `⚠️ ${criticalLines.length} produkt(er) har kritiskt kort hållbarhet (≤2 dagar). Vill du ändå godkänna leveransen?`,
      );
      if (!confirmed) return;
    }

    const reports = Object.entries(lineReports).map(([lineId, report]) => ({
      shop_order_id: selectedOrder.id,
      order_line_id: lineId,
      store_id: activeStoreId,
      status: report.status,
      report_type: report.status === "Rapporterad" ? report.report_type : null,
      notes: report.notes || null,
      quantity_received: report.quantity_received ? Number(report.quantity_received) : null,
      reported_by: "Butik",
    }));

    try {
      await submitReport.mutateAsync(reports);

      await supabase.from("shop_orders").update({ status: "Levererad" }).eq("id", selectedOrder.id);

      for (const [lineId, report] of Object.entries(lineReports)) {
        await supabase
          .from("shop_order_lines")
          .update({
            quantity_delivered: report.quantity_received ? Number(report.quantity_received) : 0,
            status: "Klar / Levererad",
            deviation: report.status === "Rapporterad" ? report.report_type || "Rapporterad" : null,
          })
          .eq("id", lineId);
      }

      // Move stock from Transportlager to shop's Raw-lager (with optional CHF unit costs for Zollikon)
      try {
        const unitCostMap: Record<string, number> = {};
        if (isChfStore) {
          for (const [lineId, report] of Object.entries(lineReports)) {
            const line = (selectedOrder.shop_order_lines || []).find((l: any) => l.id === lineId);
            const cost = Number(report.unit_cost_local);
            if (line && Number.isFinite(cost) && cost > 0) {
              unitCostMap[line.product_id] = cost;
            }
          }
        }
        await moveStockToRawLager(selectedOrder.id, activeStoreId, isChfStore ? unitCostMap : undefined);
      } catch (err) {
        console.error("Stock transfer to Raw-lager error:", err);
      }

      // NEW: Update stock with expiry + arrival dates for each line
      for (const [lineId, report] of Object.entries(lineReports)) {
        if (!report.arrival_date && !report.expiry_date) continue;
        // Find the product_id for this line
        const line = (selectedOrder.shop_order_lines || []).find((l: any) => l.id === lineId);
        if (!line) continue;

        // Find the raw-lager location for this store
        const { data: rawLocation } = await supabase
          .from("storage_locations")
          .select("id")
          .eq("store_id", activeStoreId)
          .ilike("name", "Raw-%")
          .maybeSingle();

        if (rawLocation) {
          await supabase
            .from("product_stock_locations")
            .update({
              arrival_date: report.arrival_date || null,
              expiry_date: report.expiry_date || null,
            } as any)
            .eq("product_id", line.product_id)
            .eq("location_id", rawLocation.id);
        }
      }

      const hasIssues = Object.values(lineReports).some((r) => r.status === "Rapporterad");
      toast({
        title: hasIssues ? "Inleverans rapporterad med avvikelser" : "Inleverans godkänd",
        description: `Order ${selectedOrder.order_week} har ${hasIssues ? "rapporterats" : "godkänts"}.`,
      });

      qc.invalidateQueries({ queryKey: ["pending-deliveries"] });
      qc.invalidateQueries({ queryKey: ["completed-deliveries"] });
      qc.invalidateQueries({ queryKey: ["delivery_receiving_reports"] });
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      setSelectedOrder(null);
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
  };

  const approveAll = () => {
    if (!selectedOrder) return;
    const today = new Date().toISOString().slice(0, 10);
    const updated: Record<string, LineReport> = {};
    (selectedOrder.shop_order_lines || []).forEach((line: any) => {
      const shelfLife = line.products?.shelf_life_days || null;
      updated[line.id] = {
        status: "Godkänd",
        quantity_received: String(line.quantity_ordered),
        confirmed: true,
        arrival_date: today,
        expiry_date: lineReports[line.id]?.expiry_date || calcExpiry(today, shelfLife),
        unit_cost_local: lineReports[line.id]?.unit_cost_local ?? autoChfCost(line),
      };
    });
    setLineReports(updated);
    toast({
      title: "Alla produkter godkända",
      description: "Kontrollera bäst-före-datumen och klicka 'Godkänn leverans'.",
    });
  };

  // Set same expiry date for all lines at once
  const setAllExpiryDates = (date: string) => {
    setLineReports((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        next[id] = { ...next[id], expiry_date: date };
      });
      return next;
    });
  };

  const [viewReportOrder, setViewReportOrder] = useState<any>(null);
  const viewReportLines = useMemo(() => {
    if (!viewReportOrder) return [];
    return existingReports.filter((r: any) => r.shop_order_id === viewReportOrder.id);
  }, [viewReportOrder, existingReports]);

  const hasIssuesInReport = Object.values(lineReports).some((r) => r.status === "Rapporterad");
  const missingExpiryCount = Object.values(lineReports).filter((r) => !r.expiry_date).length;

  const filteredUnreported = unreportedOrders.filter(
    (o: any) => !search || o.order_week?.toLowerCase().includes(search.toLowerCase()),
  );

  const allHistoryOrders = [...reportedPendingOrders, ...completedOrders];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" /> Inleveranser
        </h2>
        <p className="text-xs text-muted-foreground">
          Leveranser som har skickats från grossist. Godkänn hela leveransen eller rapportera avvikelser per produkt.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Väntande leveranser</p>
            <p className="text-xl font-heading font-bold text-warning">{unreportedOrders.length}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Rapporterade</p>
            <p className="text-xl font-heading font-bold text-foreground">{reportedOrderIds.size}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-warning" />
              Med avvikelser
            </p>
            <p className="text-xl font-heading font-bold text-warning">
              {existingReports.filter((r: any) => r.status === "Rapporterad").length > 0
                ? new Set(
                    existingReports.filter((r: any) => r.status === "Rapporterad").map((r: any) => r.shop_order_id),
                  ).size
                : 0}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <p className="text-[10px] text-muted-foreground">Totalt godkända</p>
            <p className="text-xl font-heading font-bold text-success">{completedOrders.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Sök vecka..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-xs"
        />
      </div>

      {/* Pending deliveries */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" /> Väntande leveranser
          </CardTitle>
          <CardDescription className="text-xs">
            Leveranser som har skickats från grossist. Klicka för att ta emot och godkänna.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUnreported.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Inga skickade leveranser att ta emot just nu.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredUnreported.map((order: any) => {
                const lines = order.shop_order_lines || [];
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => openOrder(order)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center bg-primary/15 text-primary">
                        <Truck className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          Order {order.order_week} — {order.stores?.name || "Okänd"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {lines.length} produkt{lines.length !== 1 ? "er" : ""} ·{" "}
                          {new Date(order.created_at).toLocaleDateString("sv-SE")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                        Skickad — redo att ta emot
                      </Badge>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Ta emot
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {allHistoryOrders.length > 0 && (
        <Card className="shadow-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-heading">Inleveranshistorik</CardTitle>
            <CardDescription className="text-xs">Tidigare rapporterade leveranser</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 text-left font-medium text-muted-foreground">VECKA</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">DATUM</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">RADER</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">STATUS</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {allHistoryOrders.map((o: any) => {
                    const orderReports = existingReports.filter((r: any) => r.shop_order_id === o.id);
                    const hasIssues = orderReports.some((r: any) => r.status === "Rapporterad");
                    return (
                      <tr key={o.id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-2 font-mono font-medium text-foreground">{o.order_week}</td>
                        <td className="py-2 text-muted-foreground">
                          {new Date(o.created_at).toLocaleDateString("sv-SE")}
                        </td>
                        <td className="py-2 text-right text-foreground">{o.shop_order_lines?.length || 0}</td>
                        <td className="py-2 text-right">
                          <Badge
                            variant="outline"
                            className={`text-[10px] gap-1 ${hasIssues ? "bg-warning/10 text-warning border-warning/20" : "bg-success/10 text-success border-success/20"}`}
                          >
                            {hasIssues && <AlertTriangle className="h-2.5 w-2.5" />}
                            {hasIssues ? "Avvikelse" : "Godkänd"}
                          </Badge>
                        </td>
                        <td className="py-2 text-right">
                          {orderReports.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[10px] gap-1"
                              onClick={() => setViewReportOrder(o)}
                            >
                              <Eye className="h-3 w-3" /> Visa
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Receiving dialog — now with expiry + arrival date ── */}
      <Dialog
        open={!!selectedOrder}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading flex items-center gap-2">
                  <Truck className="h-5 w-5 text-primary" />
                  Ta emot leverans — {selectedOrder.order_week}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Godkänn varje produkt, ange mottagen kvantitet och fyll i bäst-före-datum för spårbarhet.
                </DialogDescription>
              </DialogHeader>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2 mb-1">
                <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={approveAll}>
                  <ThumbsUp className="h-3 w-3" /> Godkänn alla
                </Button>
                {/* Set same expiry for all */}
                <div className="flex items-center gap-1.5">
                  <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Samma bäst-före för alla:</span>
                  <Input
                    type="date"
                    className="h-7 text-[10px] w-36"
                    onChange={(e) => setAllExpiryDates(e.target.value)}
                  />
                </div>
              </div>

              {/* Warning if expiry dates are missing */}
              {missingExpiryCount > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {missingExpiryCount} produkt(er) saknar bäst-före-datum — rekommenderas för fiskspårbarhet.
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {(selectedOrder.shop_order_lines || []).map((line: any) => {
                  const report = lineReports[line.id] || { status: "Godkänd" };
                  const isReported = report.status === "Rapporterad";
                  const isConfirmed = report.confirmed && !isReported;
                  const expiryLabel = report.expiry_date ? getExpiryLabel(report.expiry_date) : null;

                  return (
                    <div
                      key={line.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        isReported
                          ? "border-warning/40 bg-warning/5"
                          : isConfirmed
                            ? "border-success/40 bg-success/5"
                            : "border-border bg-card"
                      }`}
                    >
                      {/* Product header row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isConfirmed && <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />}
                          <span className="text-xs font-medium text-foreground">{line.products?.name || "Okänd"}</span>
                          <Badge variant="secondary" className="text-[9px] h-4">
                            {line.products?.category}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {line.quantity_ordered} {line.unit || line.products?.unit || ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={isConfirmed ? "default" : "outline"}
                            className={`h-6 text-[10px] gap-1 px-2 ${isConfirmed ? "bg-success hover:bg-success/90 text-white" : ""}`}
                            onClick={() =>
                              setLineReports((prev) => ({
                                ...prev,
                                [line.id]: {
                                  ...prev[line.id],
                                  status: "Godkänd",
                                  confirmed: true,
                                  quantity_received: String(line.quantity_delivered || line.quantity_ordered),
                                },
                              }))
                            }
                          >
                            {isConfirmed ? (
                              <CheckCircle2 className="h-2.5 w-2.5" />
                            ) : (
                              <ThumbsUp className="h-2.5 w-2.5" />
                            )}
                            {isConfirmed ? "Godkänd ✓" : "OK"}
                          </Button>
                          <Button
                            size="sm"
                            variant={isReported ? "destructive" : "outline"}
                            className="h-6 text-[10px] gap-1 px-2"
                            onClick={() =>
                              setLineReports((prev) => ({
                                ...prev,
                                [line.id]: { ...prev[line.id], status: "Rapporterad", confirmed: false },
                              }))
                            }
                          >
                            <Flag className="h-2.5 w-2.5" /> Rapportera
                          </Button>
                        </div>
                      </div>

                      {/* ── NEW: Freshness fields (always visible) ── */}
                      <div
                        className={`grid grid-cols-3 gap-2 p-2 rounded-md border mt-1 ${report.expiry_date ? getExpiryColor(report.expiry_date) : "border-border/30 bg-muted/10"}`}
                      >
                        <div className="space-y-0.5">
                          <Label className="text-[9px] text-muted-foreground uppercase tracking-wide">
                            Mottagen mängd
                          </Label>
                          <Input
                            type="number"
                            step="0.1"
                            value={report.quantity_received || ""}
                            onChange={(e) => updateLineReport(line.id, "quantity_received", e.target.value)}
                            className="h-6 text-[10px] bg-background"
                            placeholder={String(line.quantity_ordered)}
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-0.5">
                            <Calendar className="h-2.5 w-2.5" /> Ankomst
                          </Label>
                          <Input
                            type="date"
                            value={report.arrival_date || ""}
                            onChange={(e) => {
                              const newArrival = e.target.value;
                              const shelfLife = line.products?.shelf_life_days || null;
                              setLineReports((prev) => ({
                                ...prev,
                                [line.id]: {
                                  ...prev[line.id],
                                  arrival_date: newArrival,
                                  expiry_date: prev[line.id]?.expiry_date || calcExpiry(newArrival, shelfLife),
                                },
                              }));
                            }}
                            className="h-6 text-[10px] bg-background"
                          />
                        </div>
                        <div className="space-y-0.5">
                          <Label className="text-[9px] text-muted-foreground uppercase tracking-wide flex items-center gap-0.5">
                            <CalendarCheck className="h-2.5 w-2.5" /> Bäst före *
                          </Label>
                          <Input
                            type="date"
                            value={report.expiry_date || ""}
                            onChange={(e) => updateLineReport(line.id, "expiry_date", e.target.value)}
                            className="h-6 text-[10px] bg-background"
                          />
                        </div>
                        {expiryLabel && (
                          <div className="col-span-3">
                            <p className={`text-[9px] font-medium ${expiryLabel.class}`}>{expiryLabel.text}</p>
                          </div>
                        )}
                      </div>

                      {/* Deviation fields */}
                      {isReported && (
                        <div className="space-y-2 mt-2 pt-2 border-t border-warning/20">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px]">Typ av problem</Label>
                              <Select
                                value={report.report_type || ""}
                                onValueChange={(v) => updateLineReport(line.id, "report_type", v)}
                              >
                                <SelectTrigger className="h-7 text-[10px]">
                                  <SelectValue placeholder="Välj..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {REPORT_TYPES.map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">
                                      {t}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Anteckning</Label>
                            <Textarea
                              value={report.notes || ""}
                              onChange={(e) => updateLineReport(line.id, "notes", e.target.value)}
                              placeholder="Beskriv problemet..."
                              className="text-[10px] min-h-[40px]"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {hasIssuesInReport && (
                <div className="flex items-center gap-2 p-2 rounded-md bg-warning/10 border border-warning/20 text-xs text-warning">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Avvikelser har rapporterats — grossist kommer att se detta.</span>
                </div>
              )}

              <DialogFooter className="gap-2">
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setSelectedOrder(null)}>
                  Avbryt
                </Button>
                <Button size="sm" className="text-xs gap-1.5" onClick={handleSubmit} disabled={submitReport.isPending}>
                  <CheckCircle2 className="h-3 w-3" />
                  {hasIssuesInReport ? "Skicka rapport" : "Godkänn leverans"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* View report detail dialog */}
      <Dialog
        open={!!viewReportOrder}
        onOpenChange={(open) => {
          if (!open) setViewReportOrder(null);
        }}
      >
        <DialogContent className="max-w-lg">
          {viewReportOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-sm">Rapport — {viewReportOrder.order_week}</DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {(viewReportOrder.shop_order_lines || []).map((line: any) => {
                  const report = viewReportLines.find((r: any) => r.order_line_id === line.id);
                  return (
                    <div
                      key={line.id}
                      className={`p-2 rounded-md border text-xs ${
                        report?.status === "Rapporterad" ? "border-warning/40 bg-warning/5" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{line.products?.name}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            report?.status === "Rapporterad"
                              ? "text-warning border-warning/30"
                              : "text-success border-success/30"
                          }`}
                        >
                          {report?.status || "–"}
                        </Badge>
                      </div>
                      {report?.status === "Rapporterad" && (
                        <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
                          {report.report_type && (
                            <p>
                              <span className="font-medium text-foreground">Typ:</span> {report.report_type}
                            </p>
                          )}
                          {report.quantity_received != null && (
                            <p>
                              <span className="font-medium text-foreground">Mottaget:</span> {report.quantity_received}{" "}
                              (beställt: {line.quantity_ordered})
                            </p>
                          )}
                          {report.notes && (
                            <p>
                              <span className="font-medium text-foreground">Not:</span> {report.notes}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setViewReportOrder(null)}>
                  Stäng
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
