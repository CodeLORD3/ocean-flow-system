import { useMemo, useState } from "react";
import { FileText, CheckCircle2, Clock, Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useShopOrders } from "@/hooks/useShopOrders";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

const INVOICE_STATUSES = [
  { value: "Väntande", label: "Väntande", icon: Clock, color: "bg-warning/15 text-warning border-warning/20" },
  { value: "Faktura Skapad", label: "Faktura Skapad", icon: CheckCircle2, color: "bg-success/15 text-success border-success/20" },
];

export default function Invoices() {
  const { data: orders = [], isLoading } = useShopOrders();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Filter orders that have reached "Packad" status or beyond
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
                    <th className="pb-2 text-left font-medium text-muted-foreground">Butik</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Vecka</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Leveransdatum</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Packare</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Rader</th>
                    <th className="pb-2 text-right font-medium text-muted-foreground">Tot. packat</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Orderstatus</th>
                    <th className="pb-2 text-left font-medium text-muted-foreground">Fakturastatus</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceOrders.map((order: any) => {
                    const lines = order.shop_order_lines || [];
                    const totalPacked = lines.reduce((s: number, l: any) => s + Number(l.quantity_delivered || 0), 0);
                    const currentInvoiceStatus = order.invoice_status || "Väntande";
                    const statusDef = INVOICE_STATUSES.find(s => s.value === currentInvoiceStatus) || INVOICE_STATUSES[0];

                    return (
                      <tr key={order.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2 font-medium text-foreground">{order.stores?.name || "–"}</td>
                        <td className="py-2 text-muted-foreground">{order.order_week}</td>
                        <td className="py-2 text-muted-foreground">{order.desired_delivery_date || "–"}</td>
                        <td className="py-2 text-muted-foreground">{order.packer_name || "–"}</td>
                        <td className="py-2 text-right text-foreground">{lines.length}</td>
                        <td className="py-2 text-right font-medium text-foreground">{totalPacked.toFixed(1)} kg</td>
                        <td className="py-2">
                          <Badge variant="outline" className="text-[10px]">{order.status}</Badge>
                        </td>
                        <td className="py-2">
                          <Select
                            value={currentInvoiceStatus}
                            onValueChange={(val) => handleInvoiceStatusChange(order.id, val)}
                            disabled={updatingId === order.id}
                          >
                            <SelectTrigger className={`h-7 w-[150px] text-[10px] border ${statusDef.color}`}>
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
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
