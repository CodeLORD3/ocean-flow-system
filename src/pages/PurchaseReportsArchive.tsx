import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronDown, ChevronUp, FileText, Archive, Pencil, Trash2, Plus, Check, X } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { toast } from "sonner";

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

type LineDraft = {
  product_name: string;
  quantity: string;
  unit: string;
  unit_price: string;
  supplier_name: string;
  purchase_date: string;
};

const emptyDraft: LineDraft = {
  product_name: "",
  quantity: "0",
  unit: "kg",
  unit_price: "0",
  supplier_name: "",
  purchase_date: "",
};

export default function PurchaseReportsArchive() {
  const qc = useQueryClient();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LineDraft>(emptyDraft);
  const [addingForReport, setAddingForReport] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

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
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      return data as ReportLine[];
    },
    enabled: archivedReports.length > 0,
  });

  const recalcReportTotal = async (reportId: string) => {
    const { data: lines } = await supabase
      .from("purchase_report_lines")
      .select("line_total")
      .eq("report_id", reportId);
    const total = (lines || []).reduce((s, l: any) => s + (Number(l.line_total) || 0), 0);
    await supabase.from("purchase_reports").update({ total_amount: total }).eq("id", reportId);
  };

  const updateLineMut = useMutation({
    mutationFn: async (params: { id: string; report_id: string; values: LineDraft }) => {
      const qty = Number(params.values.quantity) || 0;
      const price = Number(params.values.unit_price) || 0;
      const { error } = await supabase
        .from("purchase_report_lines")
        .update({
          product_name: params.values.product_name,
          quantity: qty,
          unit: params.values.unit || null,
          unit_price: price,
          line_total: qty * price,
          supplier_name: params.values.supplier_name || null,
          purchase_date: params.values.purchase_date || null,
        })
        .eq("id", params.id);
      if (error) throw error;
      await recalcReportTotal(params.report_id);
    },
    onSuccess: () => {
      toast.success("Rad uppdaterad");
      qc.invalidateQueries({ queryKey: ["archived-purchase-report-lines"] });
      qc.invalidateQueries({ queryKey: ["archived-purchase-reports"] });
      setEditingLineId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLineMut = useMutation({
    mutationFn: async (params: { id: string; report_id: string }) => {
      const { error } = await supabase.from("purchase_report_lines").delete().eq("id", params.id);
      if (error) throw error;
      await recalcReportTotal(params.report_id);
    },
    onSuccess: () => {
      toast.success("Rad borttagen");
      qc.invalidateQueries({ queryKey: ["archived-purchase-report-lines"] });
      qc.invalidateQueries({ queryKey: ["archived-purchase-reports"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addLineMut = useMutation({
    mutationFn: async (params: { report_id: string; values: LineDraft }) => {
      const qty = Number(params.values.quantity) || 0;
      const price = Number(params.values.unit_price) || 0;
      const { error } = await supabase.from("purchase_report_lines").insert({
        report_id: params.report_id,
        product_name: params.values.product_name || "Ny rad",
        quantity: qty,
        unit: params.values.unit || null,
        unit_price: price,
        line_total: qty * price,
        supplier_name: params.values.supplier_name || null,
        purchase_date: params.values.purchase_date || null,
      });
      if (error) throw error;
      await recalcReportTotal(params.report_id);
    },
    onSuccess: () => {
      toast.success("Rad tillagd");
      qc.invalidateQueries({ queryKey: ["archived-purchase-report-lines"] });
      qc.invalidateQueries({ queryKey: ["archived-purchase-reports"] });
      setAddingForReport(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateNameMut = useMutation({
    mutationFn: async (params: { id: string; display_name: string }) => {
      const { error } = await supabase
        .from("purchase_reports")
        .update({ display_name: params.display_name })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rapportnamn uppdaterat");
      qc.invalidateQueries({ queryKey: ["archived-purchase-reports"] });
      setEditingNameId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteReportMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("purchase_report_lines").delete().eq("report_id", id);
      const { error } = await supabase.from("purchase_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rapport borttagen");
      qc.invalidateQueries({ queryKey: ["archived-purchase-reports"] });
      qc.invalidateQueries({ queryKey: ["archived-purchase-report-lines"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const startEditLine = (l: ReportLine) => {
    setEditingLineId(l.id);
    setAddingForReport(null);
    setDraft({
      product_name: l.product_name,
      quantity: String(l.quantity ?? 0),
      unit: l.unit || "kg",
      unit_price: String(l.unit_price ?? 0),
      supplier_name: l.supplier_name || "",
      purchase_date: l.purchase_date || "",
    });
  };

  const startAdd = (reportId: string) => {
    setAddingForReport(reportId);
    setEditingLineId(null);
    setDraft(emptyDraft);
  };

  // Group reports by created date
  const reportsByDate = new Map<string, ArchivedReport[]>();
  for (const r of archivedReports) {
    // Group by the report's business date (set by user) — falls back to created_at for legacy rows
    const dateKey = (r as any).report_date || format(new Date(r.created_at), "yyyy-MM-dd");
    const existing = reportsByDate.get(dateKey) || [];
    existing.push(r);
    reportsByDate.set(dateKey, existing);
  }
  const sortedDates = [...reportsByDate.keys()].sort((a, b) => b.localeCompare(a));

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

  const renderEditableRow = (l: ReportLine) => (
    <TableRow key={l.id} className="h-9 text-xs bg-muted/30">
      <TableCell className="py-1 px-2">
        <Input className="h-7 text-xs" value={draft.product_name} onChange={(e) => setDraft({ ...draft, product_name: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="number" className="h-7 text-xs text-right" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input className="h-7 text-xs" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="number" className="h-7 text-xs text-right" value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1 text-right tabular-nums text-muted-foreground">
        {((Number(draft.quantity) || 0) * (Number(draft.unit_price) || 0)).toLocaleString("sv-SE", { minimumFractionDigits: 2 })}
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input className="h-7 text-xs" value={draft.supplier_name} onChange={(e) => setDraft({ ...draft, supplier_name: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="date" className="h-7 text-xs" value={draft.purchase_date} onChange={(e) => setDraft({ ...draft, purchase_date: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateLineMut.mutate({ id: l.id, report_id: l.report_id, values: draft })}>
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingLineId(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderAddRow = (reportId: string) => (
    <TableRow className="h-9 text-xs bg-primary/5">
      <TableCell className="py-1 px-2">
        <Input className="h-7 text-xs" placeholder="Produkt" value={draft.product_name} onChange={(e) => setDraft({ ...draft, product_name: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="number" className="h-7 text-xs text-right" value={draft.quantity} onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input className="h-7 text-xs" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="number" className="h-7 text-xs text-right" value={draft.unit_price} onChange={(e) => setDraft({ ...draft, unit_price: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1 text-right tabular-nums text-muted-foreground">
        {((Number(draft.quantity) || 0) * (Number(draft.unit_price) || 0)).toLocaleString("sv-SE", { minimumFractionDigits: 2 })}
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input className="h-7 text-xs" placeholder="Leverantör" value={draft.supplier_name} onChange={(e) => setDraft({ ...draft, supplier_name: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="date" className="h-7 text-xs" value={draft.purchase_date} onChange={(e) => setDraft({ ...draft, purchase_date: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => addLineMut.mutate({ report_id: reportId, values: draft })}>
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAddingForReport(null)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Rapporter arkiveras automatiskt varje natt. Totalt {archivedReports.length} rapporter.
        </p>
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
                      const isEditingName = editingNameId === report.id;

                      return (
                        <div key={report.id} className="border rounded-md overflow-hidden">
                          <div
                            className="flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <button onClick={() => setExpandedReport(isReportExpanded ? null : report.id)}>
                                {isReportExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                )}
                              </button>
                              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                              {isEditingName ? (
                                <div className="flex items-center gap-1 flex-1">
                                  <Input
                                    className="h-7 text-xs"
                                    value={nameDraft}
                                    onChange={(e) => setNameDraft(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => updateNameMut.mutate({ id: report.id, display_name: nameDraft })}>
                                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditingNameId(null)}>
                                    <X className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <span
                                    className="text-xs font-medium cursor-pointer hover:underline"
                                    onClick={() => setExpandedReport(isReportExpanded ? null : report.id)}
                                  >
                                    {displayName}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {lines.length} rader
                                  </span>
                                </>
                              )}
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
                              {!isEditingName && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6"
                                  title="Byt namn"
                                  onClick={() => { setEditingNameId(report.id); setNameDraft(displayName); }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Ta bort rapport">
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Ta bort rapport?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Hela rapporten "{displayName}" och alla {lines.length} rader tas bort permanent.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => deleteReportMut.mutate(report.id)}>
                                      Ta bort
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>

                          {isReportExpanded && (
                            <div className="border-t">
                              <Table>
                                <TableHeader>
                                  <TableRow className="h-7">
                                    <TableHead className="py-0.5 px-2 text-[11px]">Produkt</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] text-right w-[70px]">Antal</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[55px]">Enhet</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] text-right w-[80px]">Pris</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] text-right w-[90px]">Summa</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[110px]">Leverantör</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[110px]">Datum</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[70px]"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {lines.map((l) =>
                                    editingLineId === l.id ? renderEditableRow(l) : (
                                      <TableRow key={l.id} className="h-7 text-xs">
                                        <TableCell className="py-0.5 px-2">{l.product_name}</TableCell>
                                        <TableCell className="py-0.5 px-1 text-right tabular-nums">{l.quantity}</TableCell>
                                        <TableCell className="py-0.5 px-1 text-muted-foreground">{l.unit || "kg"}</TableCell>
                                        <TableCell className="py-0.5 px-1 text-right tabular-nums">
                                          {(l.unit_price || 0).toLocaleString("sv-SE", { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="py-0.5 px-1 text-right tabular-nums font-medium">
                                          {(l.line_total || 0).toLocaleString("sv-SE", { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="py-0.5 px-1 text-muted-foreground">{l.supplier_name || "–"}</TableCell>
                                        <TableCell className="py-0.5 px-1 text-muted-foreground">{l.purchase_date || "–"}</TableCell>
                                        <TableCell className="py-0.5 px-1">
                                          <div className="flex gap-0.5">
                                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => startEditLine(l)}>
                                              <Pencil className="h-3 w-3" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteLineMut.mutate({ id: l.id, report_id: l.report_id })}>
                                              <Trash2 className="h-3 w-3 text-destructive" />
                                            </Button>
                                          </div>
                                        </TableCell>
                                      </TableRow>
                                    )
                                  )}
                                  {addingForReport === report.id && renderAddRow(report.id)}
                                </TableBody>
                              </Table>
                              {addingForReport !== report.id && (
                                <div className="px-2 py-1.5 border-t">
                                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => startAdd(report.id)}>
                                    <Plus className="h-3 w-3 mr-1" /> Lägg till rad
                                  </Button>
                                </div>
                              )}
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
