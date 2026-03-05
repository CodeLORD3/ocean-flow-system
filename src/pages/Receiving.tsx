import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Package, Search, CheckCircle2, Clock, Truck, AlertTriangle, X,
  ThumbsUp, Flag, Eye,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useSite } from "@/contexts/SiteContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubmitReceivingReport } from "@/hooks/useDeliveryReceivingReports";

const REPORT_TYPES = ["Skadad", "Fel kvantitet", "Dålig kvalitet", "Saknas", "Annat"];

export default function Receiving() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeStoreId } = useSite();
  const [search, setSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const submitReport = useSubmitReceivingReport();

  // Line-level report state: { [lineId]: { status, report_type, notes, quantity_received } }
  const [lineReports, setLineReports] = useState<Record<string, {
    status: "Godkänd" | "Rapporterad";
    report_type?: string;
    notes?: string;
    quantity_received?: string;
  }>>({});

  // Fetch orders that are "Packad" or "Skickad" for this store — these are pending deliveries
  const { data: pendingOrders = [] } = useQuery({
    queryKey: ["pending-deliveries", activeStoreId],
    queryFn: async () => {
      if (!activeStoreId) return [];
      const { data, error } = await supabase
        .from("shop_orders")
        .select("*, stores(name), shop_order_lines(*, products(name, unit, category))")
        .eq("store_id", activeStoreId)
        .in("status", ["Packad", "Skickad", "Ny", "Behandlas"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch existing reports for this store
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

  // Fetch completed reports (orders that have been fully reported on)
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

  // Check which orders already have reports
  const reportedOrderLineIds = useMemo(() => {
    return new Set(existingReports.map((r: any) => r.order_line_id));
  }, [existingReports]);

  const reportedOrderIds = useMemo(() => {
    const ids = new Set<string>();
    existingReports.forEach((r: any) => ids.add(r.shop_order_id));
    return ids;
  }, [existingReports]);

  // Orders that haven't been reported on yet
  const unreportedOrders = pendingOrders.filter((o: any) => !reportedOrderIds.has(o.id));
  const reportedPendingOrders = pendingOrders.filter((o: any) => reportedOrderIds.has(o.id));

  const openOrder = (order: any) => {
    setSelectedOrder(order);
    // Pre-fill all lines as "Godkänd"
    const initial: typeof lineReports = {};
    (order.shop_order_lines || []).forEach((line: any) => {
      initial[line.id] = { status: "Godkänd", quantity_received: String(line.quantity_ordered) };
    });
    setLineReports(initial);
  };

  const updateLineReport = (lineId: string, field: string, value: string) => {
    setLineReports(prev => ({
      ...prev,
      [lineId]: { ...prev[lineId], [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!selectedOrder || !activeStoreId) return;

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

      // Update order status to Levererad
      await supabase
        .from("shop_orders")
        .update({ status: "Levererad" })
        .eq("id", selectedOrder.id);

      // Update each line status
      for (const [lineId, report] of Object.entries(lineReports)) {
        await supabase
          .from("shop_order_lines")
          .update({
            quantity_delivered: report.quantity_received ? Number(report.quantity_received) : 0,
            status: "Klar / Levererad",
            deviation: report.status === "Rapporterad" ? (report.report_type || "Rapporterad") : null,
          })
          .eq("id", lineId);
      }

      const hasIssues = Object.values(lineReports).some(r => r.status === "Rapporterad");
      toast({
        title: hasIssues ? "Inleverans rapporterad med avvikelser" : "Inleverans godkänd",
        description: `Order ${selectedOrder.order_week} har ${hasIssues ? "rapporterats" : "godkänts"}.`,
      });

      qc.invalidateQueries({ queryKey: ["pending-deliveries"] });
      qc.invalidateQueries({ queryKey: ["completed-deliveries"] });
      qc.invalidateQueries({ queryKey: ["delivery_receiving_reports"] });
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
      qc.invalidateQueries({ queryKey: ["shop-orders-shop"] });
      setSelectedOrder(null);
    } catch (err: any) {
      toast({ title: "Fel", description: err.message, variant: "destructive" });
    }
  };

  const approveAll = () => {
    if (!selectedOrder) return;
    const updated: typeof lineReports = {};
    (selectedOrder.shop_order_lines || []).forEach((line: any) => {
      updated[line.id] = { status: "Godkänd", quantity_received: String(line.quantity_ordered) };
    });
    setLineReports(updated);
  };

  // Reporting detail dialog for already-reported orders
  const [viewReportOrder, setViewReportOrder] = useState<any>(null);
  const viewReportLines = useMemo(() => {
    if (!viewReportOrder) return [];
    return existingReports.filter((r: any) => r.shop_order_id === viewReportOrder.id);
  }, [viewReportOrder, existingReports]);

  const hasIssuesInReport = Object.values(lineReports).some(r => r.status === "Rapporterad");

  const filteredUnreported = unreportedOrders.filter((o: any) =>
    !search || o.order_week?.toLowerCase().includes(search.toLowerCase())
  );

  const allHistoryOrders = [...reportedPendingOrders, ...completedOrders];

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5 text-primary" /> Inleveranser
        </h2>
        <p className="text-xs text-muted-foreground">
          Väntande leveranser från grossist. Godkänn hela leveransen eller rapportera avvikelser per produkt.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Väntande leveranser</p>
          <p className="text-xl font-heading font-bold text-warning">{unreportedOrders.length}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Rapporterade</p>
          <p className="text-xl font-heading font-bold text-foreground">{reportedOrderIds.size}</p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-warning" />Med avvikelser</p>
          <p className="text-xl font-heading font-bold text-warning">
            {existingReports.filter((r: any) => r.status === "Rapporterad").length > 0
              ? new Set(existingReports.filter((r: any) => r.status === "Rapporterad").map((r: any) => r.shop_order_id)).size
              : 0}
          </p>
        </CardContent></Card>
        <Card className="shadow-card"><CardContent className="p-3">
          <p className="text-[10px] text-muted-foreground">Totalt godkända</p>
          <p className="text-xl font-heading font-bold text-success">{completedOrders.length}</p>
        </CardContent></Card>
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input placeholder="Sök vecka..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
      </div>

      {/* Pending deliveries */}
      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Clock className="h-4 w-4 text-warning" /> Väntande leveranser
          </CardTitle>
          <CardDescription className="text-xs">
            Beställningar som är på väg eller redo att tas emot. Klicka för att rapportera.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredUnreported.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              Inga väntande leveranser just nu.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredUnreported.map((order: any) => {
                const lines = order.shop_order_lines || [];
                const allPacked = lines.every((l: any) => l.status === "Packad" || l.status === "Skickad" || l.status === "Klar / Levererad");
                return (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => openOrder(order)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center ${allPacked ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                        {allPacked ? <Package className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">
                          Order {order.order_week} — {order.stores?.name || "Okänd"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {lines.length} produkt{lines.length !== 1 ? "er" : ""} · {new Date(order.created_at).toLocaleDateString("sv-SE")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-[10px] ${allPacked ? "bg-success/10 text-success border-success/20" : "bg-warning/10 text-warning border-warning/20"}`}>
                        {allPacked ? "Redo att ta emot" : order.status}
                      </Badge>
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Rapportera
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
                        <td className="py-2 text-muted-foreground">{new Date(o.created_at).toLocaleDateString("sv-SE")}</td>
                        <td className="py-2 text-right text-foreground">{o.shop_order_lines?.length || 0}</td>
                        <td className="py-2 text-right">
                          <Badge variant="outline" className={`text-[10px] gap-1 ${hasIssues ? "bg-warning/10 text-warning border-warning/20" : "bg-success/10 text-success border-success/20"}`}>
                            {hasIssues && <AlertTriangle className="h-2.5 w-2.5" />}
                            {hasIssues ? "Avvikelse" : "Godkänd"}
                          </Badge>
                        </td>
                        <td className="py-2 text-right">
                          {orderReports.length > 0 && (
                            <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => setViewReportOrder(o)}>
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

      {/* Report dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={open => { if (!open) setSelectedOrder(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading">
                  Ta emot leverans — {selectedOrder.order_week}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Godkänn varje produkt eller rapportera avvikelser. Du kan godkänna alla direkt.
                </DialogDescription>
              </DialogHeader>

              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" className="text-xs gap-1 h-7" onClick={approveAll}>
                  <ThumbsUp className="h-3 w-3" /> Godkänn alla
                </Button>
              </div>

              <div className="space-y-2">
                {(selectedOrder.shop_order_lines || []).map((line: any) => {
                  const report = lineReports[line.id] || { status: "Godkänd" };
                  const isReported = report.status === "Rapporterad";
                  return (
                    <div
                      key={line.id}
                      className={`p-3 rounded-lg border transition-colors ${
                        isReported ? "border-warning/40 bg-warning/5" : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-xs font-medium text-foreground">{line.products?.name || "Okänd"}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">
                            {line.quantity_ordered} {line.unit || line.products?.unit || ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={!isReported ? "default" : "outline"}
                            className="h-6 text-[10px] gap-1 px-2"
                            onClick={() => updateLineReport(line.id, "status", "Godkänd")}
                          >
                            <ThumbsUp className="h-2.5 w-2.5" /> OK
                          </Button>
                          <Button
                            size="sm"
                            variant={isReported ? "destructive" : "outline"}
                            className="h-6 text-[10px] gap-1 px-2"
                            onClick={() => updateLineReport(line.id, "status", "Rapporterad")}
                          >
                            <Flag className="h-2.5 w-2.5" /> Rapportera
                          </Button>
                        </div>
                      </div>

                      {isReported && (
                        <div className="space-y-2 mt-2 pt-2 border-t border-warning/20">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-[10px]">Typ av problem</Label>
                              <Select
                                value={report.report_type || ""}
                                onValueChange={v => updateLineReport(line.id, "report_type", v)}
                              >
                                <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Välj..." /></SelectTrigger>
                                <SelectContent>
                                  {REPORT_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px]">Mottagen kvantitet</Label>
                              <Input
                                type="number"
                                step="0.1"
                                value={report.quantity_received || ""}
                                onChange={e => updateLineReport(line.id, "quantity_received", e.target.value)}
                                className="h-7 text-[10px]"
                                placeholder={String(line.quantity_ordered)}
                              />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px]">Anteckning</Label>
                            <Textarea
                              value={report.notes || ""}
                              onChange={e => updateLineReport(line.id, "notes", e.target.value)}
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
                <Button
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={handleSubmit}
                  disabled={submitReport.isPending}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {hasIssuesInReport ? "Skicka rapport" : "Godkänn leverans"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* View report detail dialog */}
      <Dialog open={!!viewReportOrder} onOpenChange={open => { if (!open) setViewReportOrder(null); }}>
        <DialogContent className="max-w-lg">
          {viewReportOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="font-heading text-sm">
                  Rapport — {viewReportOrder.order_week}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-2">
                {(viewReportOrder.shop_order_lines || []).map((line: any) => {
                  const report = viewReportLines.find((r: any) => r.order_line_id === line.id);
                  return (
                    <div key={line.id} className={`p-2 rounded-md border text-xs ${
                      report?.status === "Rapporterad" ? "border-warning/40 bg-warning/5" : "border-border"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{line.products?.name}</span>
                        <Badge variant="outline" className={`text-[10px] ${
                          report?.status === "Rapporterad" ? "text-warning border-warning/30" : "text-success border-success/30"
                        }`}>
                          {report?.status || "–"}
                        </Badge>
                      </div>
                      {report?.status === "Rapporterad" && (
                        <div className="mt-1 text-[10px] text-muted-foreground space-y-0.5">
                          {report.report_type && <p><span className="font-medium text-foreground">Typ:</span> {report.report_type}</p>}
                          {report.quantity_received != null && (
                            <p><span className="font-medium text-foreground">Mottaget:</span> {report.quantity_received} (beställt: {line.quantity_ordered})</p>
                          )}
                          {report.notes && <p><span className="font-medium text-foreground">Not:</span> {report.notes}</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <DialogFooter>
                <Button variant="outline" size="sm" className="text-xs" onClick={() => setViewReportOrder(null)}>Stäng</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
