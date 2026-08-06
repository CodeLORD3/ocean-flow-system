import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Printer, ChevronRight, ChevronDown, FileText, Loader2 } from "lucide-react";
import { generateInventoryReportPdf } from "@/lib/inventoryReportPdf";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId?: string | null;
  storeName?: string | null;
}

const nf = (v: number, dec = 1) =>
  Number(v || 0).toLocaleString("sv-SE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

export default function InventoryReportsDialog({ open, onOpenChange, storeId, storeName }: Props) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [printing, setPrinting] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["inventory-reports", storeId],
    enabled: open,
    queryFn: async () => {
      let q = supabase
        .from("inventory_reports")
        .select("*")
        .order("reported_at", { ascending: false })
        .limit(100);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: lines = [] } = useQuery({
    queryKey: ["inventory-report-lines", expanded],
    enabled: !!expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_report_lines")
        .select("*")
        .eq("report_id", expanded!);
      if (error) throw error;
      return data || [];
    },
  });

  const grouped = useMemo(() => {
    const groups: Record<string, any[]> = {};
    reports.forEach((r: any) => {
      const key = new Date(r.reported_at).toLocaleDateString("sv-SE", {
        year: "numeric",
        month: "long",
      });
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.entries(groups);
  }, [reports]);

  const printReport = async (report: any) => {
    setPrinting(report.id);
    try {
      const { data, error } = await supabase
        .from("inventory_report_lines")
        .select("*")
        .eq("report_id", report.id);
      if (error) throw error;
      generateInventoryReportPdf({
        storeName: storeName || null,
        locationName: report.location_name,
        reportedAt: report.reported_at,
        reportedBy: report.reported_by,
        notes: report.notes,
        lineCount: report.line_count,
        totalValue: Number(report.total_value) || 0,
        lines: (data || []).map((l: any) => ({
          product_name: l.product_name,
          category: l.category,
          unit: l.unit,
          quantity: Number(l.quantity) || 0,
          cost_price: Number(l.cost_price) || 0,
          line_value: Number(l.line_value) || 0,
        })),
      });
    } catch (err: any) {
      toast({ title: "Kunde inte skapa PDF", description: err.message, variant: "destructive" });
    }
    setPrinting(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" /> Lagerrapporter
            {storeName ? <span className="text-muted-foreground font-normal">— {storeName}</span> : null}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-2 px-2">
          {isLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Laddar…</div>
          ) : reports.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Inga lagerrapporter har skapats än.
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {grouped.map(([month, items]) => (
                <div key={month}>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    {month}
                  </div>
                  <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                    {items.map((r: any) => {
                      const isOpen = expanded === r.id;
                      return (
                        <div key={r.id}>
                          <div className="flex items-center gap-2 px-2 py-2 hover:bg-muted/50">
                            <button
                              className="flex-1 flex items-center gap-2 text-left min-w-0"
                              onClick={() => setExpanded(isOpen ? null : r.id)}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                              )}
                              <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">
                                  {r.location_name || "Okänd lagerplats"}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {new Date(r.reported_at).toLocaleString("sv-SE", {
                                    dateStyle: "short",
                                    timeStyle: "short",
                                  })}
                                </div>
                              </div>
                            </button>
                            <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                              {r.line_count} rader
                            </Badge>
                            <span className="text-sm font-semibold font-mono tabular-nums shrink-0">
                              {nf(Number(r.total_value), 0)} kr
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 gap-1 text-[10px] shrink-0"
                              onClick={() => printReport(r)}
                              disabled={printing === r.id}
                            >
                              {printing === r.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Printer className="h-3 w-3" />
                              )}
                              PDF
                            </Button>
                          </div>

                          {isOpen && (
                            <div className="bg-muted/30 px-3 py-2">
                              {lines.length === 0 ? (
                                <div className="text-xs text-muted-foreground py-2">Laddar rader…</div>
                              ) : (
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-muted-foreground">
                                      <th className="text-left font-medium py-1">Produkt</th>
                                      <th className="text-left font-medium py-1">Kategori</th>
                                      <th className="text-right font-medium py-1">Antal</th>
                                      <th className="text-right font-medium py-1">Värde</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {lines
                                      .slice()
                                      .sort((a: any, b: any) =>
                                        (a.product_name || "").localeCompare(b.product_name || "", "sv"),
                                      )
                                      .map((l: any) => (
                                        <tr key={l.id} className="border-t border-border/50">
                                          <td className="py-1 pr-2">{l.product_name}</td>
                                          <td className="py-1 pr-2 text-muted-foreground">
                                            {l.category || "Övrigt"}
                                          </td>
                                          <td className="py-1 text-right font-mono tabular-nums">
                                            {nf(Number(l.quantity))} {l.unit || "kg"}
                                          </td>
                                          <td className="py-1 text-right font-mono tabular-nums">
                                            {nf(Number(l.line_value), 0)} kr
                                          </td>
                                        </tr>
                                      ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
