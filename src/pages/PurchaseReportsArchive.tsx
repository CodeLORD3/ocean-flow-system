import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, ChevronUp, FileText, Package, Archive } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

type ArchivedReport = {
  id: string;
  created_at: string;
  archived_at: string;
  file_name: string;
  display_name: string | null;
  status: string;
  total_amount: number;
};

type ReportLine = {
  id: string;
  report_id: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  supplier_name: string | null;
  status: string;
  purchase_date: string | null;
};

export default function PurchaseReportsArchive() {
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);

  const { data: archivedReports = [], isLoading } = useQuery({
    queryKey: ["archived-purchase-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_reports")
        .select("*")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return data as ArchivedReport[];
    },
  });

  const { data: allLines = [] } = useQuery({
    queryKey: ["archived-purchase-report-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_report_lines")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReportLine[];
    },
    enabled: archivedReports.length > 0,
  });

  // Group reports by the date they were created (i.e. the day the report was made, not the archive midnight timestamp)
  const reportsByDate = new Map<string, ArchivedReport[]>();
  for (const r of archivedReports) {
    const dateKey = format(new Date(r.created_at), "yyyy-MM-dd");
    const existing = reportsByDate.get(dateKey) || [];
    existing.push(r);
    reportsByDate.set(dateKey, existing);
  }

  const sortedDates = [...reportsByDate.keys()].sort((a, b) => b.localeCompare(a));

  // Lines lookup
  const linesByReport = new Map<string, ReportLine[]>();
  for (const l of allLines) {
    const existing = linesByReport.get(l.report_id) || [];
    existing.push(l);
    linesByReport.set(l.report_id, existing);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Laddar arkiverade rapporter...
      </div>
    );
  }

  if (sortedDates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Archive className="h-12 w-12 opacity-30" />
        <p className="text-sm">Inga arkiverade inköpsrapporter ännu</p>
        <p className="text-xs">Rapporter arkiveras automatiskt varje natt kl 00:01</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Inköpsrapporter – Arkiv</h2>
          <p className="text-xs text-muted-foreground">
            Rapporter arkiveras automatiskt varje natt. Totalt {archivedReports.length} rapporter.
          </p>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-220px)]">
        <div className="space-y-3">
          {sortedDates.map((dateKey) => {
            const reports = reportsByDate.get(dateKey)!;
            const isDateExpanded = expandedDate === dateKey;
            const dayTotal = reports.reduce((s, r) => s + (r.total_amount || 0), 0);
            const totalLines = reports.reduce((s, r) => s + (linesByReport.get(r.id)?.length || 0), 0);
            const displayDate = format(new Date(dateKey), "EEEE d MMMM yyyy", { locale: sv });

            return (
              <Card key={dateKey} className="overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedDate(isDateExpanded ? null : dateKey)}
                >
                  <div className="flex items-center gap-3">
                    {isDateExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div>
                      <p className="text-sm font-medium capitalize">{displayDate}</p>
                      <p className="text-xs text-muted-foreground">
                        {reports.length} rapport{reports.length !== 1 ? "er" : ""} · {totalLines} rader
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums">
                      {dayTotal.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr
                    </span>
                    <Badge variant="outline" className="text-[10px]">Arkiverad</Badge>
                  </div>
                </div>

                {isDateExpanded && (
                  <CardContent className="px-4 pb-3 pt-0 space-y-2">
                    {reports.map((report) => {
                      const lines = linesByReport.get(report.id) || [];
                      const isReportExpanded = expandedReport === report.id;
                      const displayName = report.display_name || report.file_name;
                      const reportTotal = lines.reduce((s, l) => s + (l.line_total || 0), 0);

                      return (
                        <div key={report.id} className="border rounded-md overflow-hidden">
                          <div
                            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/20 transition-colors"
                            onClick={() => setExpandedReport(isReportExpanded ? null : report.id)}
                          >
                            <div className="flex items-center gap-2">
                              {isReportExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                              )}
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium">{displayName}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {lines.length} rader
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium tabular-nums">
                                {reportTotal.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr
                              </span>
                              {report.status === "Godkänd" ? (
                                <Badge className="text-[9px] h-4 bg-primary/10 text-primary border-primary/20" variant="outline">
                                  Bekräftad
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[9px] h-4">
                                  {report.status}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {isReportExpanded && lines.length > 0 && (
                            <div className="border-t">
                              <Table>
                                <TableHeader>
                                  <TableRow className="h-7">
                                    <TableHead className="py-0.5 px-2 text-[11px]">Produkt</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] text-right w-[60px]">Antal</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[45px]">Enhet</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] text-right w-[70px]">Pris</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] text-right w-[80px]">Summa</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[100px]">Leverantör</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[85px]">Datum</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {lines.map((l) => (
                                    <TableRow key={l.id} className="h-7 text-xs">
                                      <TableCell className="py-0.5 px-2">{l.product_name}</TableCell>
                                      <TableCell className="py-0.5 px-1 text-right tabular-nums">
                                        {l.quantity}
                                      </TableCell>
                                      <TableCell className="py-0.5 px-1 text-muted-foreground">
                                        {l.unit || "kg"}
                                      </TableCell>
                                      <TableCell className="py-0.5 px-1 text-right tabular-nums">
                                        {(l.unit_price || 0).toLocaleString("sv-SE", { minimumFractionDigits: 2 })}
                                      </TableCell>
                                      <TableCell className="py-0.5 px-1 text-right tabular-nums font-medium">
                                        {(l.line_total || 0).toLocaleString("sv-SE", { minimumFractionDigits: 2 })}
                                      </TableCell>
                                      <TableCell className="py-0.5 px-1 text-muted-foreground">
                                        {l.supplier_name || "–"}
                                      </TableCell>
                                      <TableCell className="py-0.5 px-1 text-muted-foreground">
                                        {l.purchase_date || "–"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
