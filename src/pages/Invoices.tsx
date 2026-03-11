import { useMemo, useState } from "react";
import { FileText, CheckCircle2, Clock, ChevronDown, ChevronRight, Printer } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useShopOrders } from "@/hooks/useShopOrders";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import DeliveryNote from "@/components/DeliveryNote";

const INVOICE_STATUSES = [
  { value: "Väntande", label: "Väntande", icon: Clock, color: "bg-warning/15 text-warning border-warning/20" },
  { value: "Faktura Skapad", label: "Faktura Skapad", icon: CheckCircle2, color: "bg-success/15 text-success border-success/20" },
];

export default function Invoices() {
  const { data: orders = [], isLoading } = useShopOrders();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [printOrder, setPrintOrder] = useState<any>(null);

  const invoiceOrders = useMemo(() => {
    const packedStatuses = ["Packad", "Skickad", "Klar / Levererad"];
    return orders.filter((o: any) => packedStatuses.includes(o.status));
  }, [orders]);

  const handleInvoiceStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingId(orderId);
    const { error } = await supabase
      .from("shop_orders")
      .update({ invoice_status: newStatus } as any)
      .eq("id", orderId);
    if (error) {
      toast({ title: "Fel", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Status uppdaterad", description: `Fakturastatus ändrad till "${newStatus}"` });
      qc.invalidateQueries({ queryKey: ["shop_orders"] });
    }
    setUpdatingId(null);
  };

  const countByStatus = useMemo(() => {
    const waiting = invoiceOrders.filter((o: any) => !o.invoice_status || o.invoice_status === "Väntande").length;
    const done = invoiceOrders.filter((o: any) => o.invoice_status === "Faktura Skapad").length;
    return { waiting, done };
  }, [invoiceOrders]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-heading font-bold text-foreground">Fakturor</h2>
        <p className="text-xs text-muted-foreground">Följesedlar visas automatiskt när ordrar når status "Packad". Markera som "Faktura Skapad" när fakturan är klar.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <p className="text-[10px] text-muted-foreground">Totalt följesedlar</p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">{invoiceOrders.length}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock className="h-3.5 w-3.5 text-warning" />
              <p className="text-[10px] text-muted-foreground">Väntande</p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">{countByStatus.waiting}</p>
          </CardContent>
        </Card>
        <Card className="shadow-card">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              <p className="text-[10px] text-muted-foreground">Faktura Skapad</p>
            </div>
            <p className="text-lg font-heading font-bold text-foreground">{countByStatus.done}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <div>
              <CardTitle className="text-sm font-heading">Följesedlar att fakturera</CardTitle>
              <CardDescription className="text-xs">Ordrar med status Packad, Skickad eller Klar / Levererad</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoiceOrders.length === 0 ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              Inga ordrar har nått "Packad" status ännu.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 w-8"></th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Vecka</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Leveransdatum</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Packare</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Rader</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Tot. packat</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Värde</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Orderstatus</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Fakturastatus</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceOrders.map((order: any) => {
                    const lines = order.shop_order_lines || [];
                    const packedLines = lines.filter((l: any) => Number(l.quantity_delivered || 0) > 0);
                    const totalPacked = lines.reduce((s: number, l: any) => s + Number(l.quantity_delivered || 0), 0);
                    const totalValue = packedLines.reduce((s: number, l: any) => {
                      return s + (Number(l.quantity_delivered || 0) * Number(l.products?.wholesale_price || 0));
                    }, 0);
                    const currentInvoiceStatus = order.invoice_status || "Väntande";
                    const statusDef = INVOICE_STATUSES.find(s => s.value === currentInvoiceStatus) || INVOICE_STATUSES[0];
                    const isExpanded = expandedId === order.id;

                    return (
                      <>
                        <tr
                          key={order.id}
                          className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                        >
                          <td className="py-2 text-center">
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground inline" />
                              : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground inline" />
                            }
                          </td>
                          <td className="py-2 font-medium text-foreground">{order.stores?.name || "–"}</td>
                          <td className="py-2 text-muted-foreground">{order.order_week}</td>
                          <td className="py-2 text-muted-foreground">{order.desired_delivery_date || "–"}</td>
                          <td className="py-2 text-muted-foreground">{order.packer_name || "–"}</td>
                          <td className="py-2 text-right text-foreground">{packedLines.length}</td>
                          <td className="py-2 text-right font-medium text-foreground">{totalPacked.toFixed(1)} kg</td>
                          <td className="py-2 text-right font-medium text-foreground">{totalValue.toFixed(0)} kr</td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
                          </td>
                          <td className="py-2" onClick={e => e.stopPropagation()}>
                            <Select
                              value={currentInvoiceStatus}
                              onValueChange={(val) => handleInvoiceStatusChange(order.id, val)}
                              disabled={updatingId === order.id}
                            >
                              <SelectTrigger className={`h-7 w-[140px] text-[10px] border ${statusDef.color}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {INVOICE_STATUSES.map(s => (
                                  <SelectItem key={s.value} value={s.value} className="text-xs">
                                    {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-2" onClick={e => e.stopPropagation()}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Skriv ut följesedel"
                              onClick={() => setPrintOrder(order)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${order.id}-detail`}>
                            <td colSpan={11} className="p-0">
                              <div className="bg-muted/20 border-y border-border/30 px-6 py-3">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                    Följesedel — {order.stores?.name} — {order.order_week}
                                  </p>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-[10px] gap-1"
                                    onClick={() => setPrintOrder(order)}
                                  >
                                    <Printer className="h-3 w-3" /> Skriv ut
                                  </Button>
                                </div>
                                <div className="grid grid-cols-4 gap-3 mb-3 text-[10px]">
                                  <div><span className="text-muted-foreground">Följesedel-ID:</span> <span className="font-mono font-medium">{order.id?.slice(0, 8).toUpperCase()}</span></div>
                                  <div><span className="text-muted-foreground">Packad av:</span> <span className="font-medium">{order.packer_name || "–"}</span></div>
                                  <div><span className="text-muted-foreground">Leveransdatum:</span> <span className="font-medium">{order.desired_delivery_date || "–"}</span></div>
                                  <div><span className="text-muted-foreground">Orderdatum:</span> <span className="font-medium">{order.created_at ? new Date(order.created_at).toLocaleDateString("sv-SE") : "–"}</span></div>
                                </div>
                                {packedLines.length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic">Inga packade rader ännu.</p>
                                ) : (
                                  <table className="w-full text-[10px]">
                                    <thead>
                                      <tr className="border-b border-border">
                                        <th className="pb-1 text-left font-medium text-muted-foreground">Produkt</th>
                                        <th className="pb-1 text-left font-medium text-muted-foreground">Kategori</th>
                                        <th className="pb-1 text-left font-medium text-muted-foreground">HS-kod</th>
                                        <th className="pb-1 text-right font-medium text-muted-foreground">Beställt</th>
                                        <th className="pb-1 text-right font-medium text-muted-foreground">Packat</th>
                                        <th className="pb-1 text-right font-medium text-muted-foreground">Enhet</th>
                                        <th className="pb-1 text-right font-medium text-muted-foreground">Pris/enhet</th>
                                        <th className="pb-1 text-right font-medium text-muted-foreground">Radvärde</th>
                                        <th className="pb-1 text-left font-medium text-muted-foreground">Avvikelse</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {packedLines.map((line: any) => {
                                        const packed = Number(line.quantity_delivered || 0);
                                        const price = Number(line.products?.wholesale_price || 0);
                                        return (
                                          <tr key={line.id} className="border-b border-border/20 hover:bg-muted/30">
                                            <td className="py-1 font-medium text-foreground">{line.products?.name || "–"}</td>
                                            <td className="py-1 text-muted-foreground">{line.products?.category || "–"}</td>
                                            <td className="py-1 text-muted-foreground font-mono">{line.products?.hs_code || "–"}</td>
                                            <td className="py-1 text-right text-foreground">{line.quantity_ordered}</td>
                                            <td className="py-1 text-right font-semibold text-foreground">{packed}</td>
                                            <td className="py-1 text-right text-muted-foreground">{line.unit || line.products?.unit || "kg"}</td>
                                            <td className="py-1 text-right text-muted-foreground">{price.toFixed(2)}</td>
                                            <td className="py-1 text-right font-semibold text-foreground">{(packed * price).toFixed(2)}</td>
                                            <td className="py-1 text-warning">{line.deviation || "–"}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t border-border">
                                        <td colSpan={7} className="py-1 text-right font-bold text-foreground">Totalt:</td>
                                        <td className="py-1 text-right font-bold text-primary">{totalValue.toFixed(2)} kr</td>
                                        <td></td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Print dialog */}
      <DeliveryNote
        order={printOrder}
        open={!!printOrder}
        onOpenChange={(open) => { if (!open) setPrintOrder(null); }}
      />
    </div>
  );
}
