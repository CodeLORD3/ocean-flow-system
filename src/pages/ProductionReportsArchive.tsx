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
  report_name: string;
  display_name: string | null;
  status: string;
  total_quantity: number | null;
};

type ReportLine = {
  id: string;
  report_id: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  operator: string | null;
  status: string;
  production_date: string | null;
};

type LineDraft = {
  product_name: string;
  quantity: string;
  unit: string;
  operator: string;
  production_date: string;
};

const emptyDraft: LineDraft = {
  product_name: "",
  quantity: "0",
  unit: "kg",
  operator: "",
  production_date: "",
};

export default function ProductionReportsArchive() {
  const qc = useQueryClient();
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LineDraft>(emptyDraft);
  const [addingForReport, setAddingForReport] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const { data: archivedReports = [], isLoading } = useQuery({
    queryKey: ["archived-production-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_reports")
        .select("*")
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      return data as ArchivedReport[];
    },
  });

  const { data: allLines = [] } = useQuery({
    queryKey: ["archived-production-report-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_report_lines")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReportLine[];
    },
    enabled: archivedReports.length > 0,
  });

  const recalcReportTotal = async (reportId: string) => {
    const { data: lines } = await supabase
      .from("production_report_lines")
      .select("quantity")
      .eq("report_id", reportId);
    const total = (lines || []).reduce((s, l: any) => s + (Number(l.quantity) || 0), 0);
    await supabase.from("production_reports").update({ total_quantity: total }).eq("id", reportId);
  };

  const updateLineMut = useMutation({
    mutationFn: async (params: { id: string; report_id: string; values: LineDraft }) => {
      const { error } = await supabase
        .from("production_report_lines")
        .update({
          product_name: params.values.product_name,
          quantity: Number(params.values.quantity) || 0,
          unit: params.values.unit || null,
          operator: params.values.operator || null,
          production_date: params.values.production_date || null,
        })
        .eq("id", params.id);
      if (error) throw error;
      await recalcReportTotal(params.report_id);
    },
    onSuccess: () => {
      toast.success("Rad uppdaterad");
      qc.invalidateQueries({ queryKey: ["archived-production-report-lines"] });
      qc.invalidateQueries({ queryKey: ["archived-production-reports"] });
      setEditingLineId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteLineMut = useMutation({
    mutationFn: async (params: { id: string; report_id: string }) => {
      const { error } = await supabase.from("production_report_lines").delete().eq("id", params.id);
      if (error) throw error;
      await recalcReportTotal(params.report_id);
    },
    onSuccess: () => {
      toast.success("Rad borttagen");
      qc.invalidateQueries({ queryKey: ["archived-production-report-lines"] });
      qc.invalidateQueries({ queryKey: ["archived-production-reports"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addLineMut = useMutation({
    mutationFn: async (params: { report_id: string; values: LineDraft }) => {
      const { error } = await supabase.from("production_report_lines").insert({
        report_id: params.report_id,
        product_name: params.values.product_name || "Ny rad",
        quantity: Number(params.values.quantity) || 0,
        unit: params.values.unit || null,
        operator: params.values.operator || null,
        production_date: params.values.production_date || null,
      });
      if (error) throw error;
      await recalcReportTotal(params.report_id);
    },
    onSuccess: () => {
      toast.success("Rad tillagd");
      qc.invalidateQueries({ queryKey: ["archived-production-report-lines"] });
      qc.invalidateQueries({ queryKey: ["archived-production-reports"] });
      setAddingForReport(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateNameMut = useMutation({
    mutationFn: async (params: { id: string; display_name: string }) => {
      const { error } = await supabase
        .from("production_reports")
        .update({ display_name: params.display_name })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rapportnamn uppdaterat");
      qc.invalidateQueries({ queryKey: ["archived-production-reports"] });
      setEditingNameId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteReportMut = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("production_report_lines").delete().eq("report_id", id);
      const { error } = await supabase.from("production_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rapport borttagen");
      qc.invalidateQueries({ queryKey: ["archived-production-reports"] });
      qc.invalidateQueries({ queryKey: ["archived-production-report-lines"] });
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
      operator: l.operator || "",
      production_date: l.production_date || "",
    });
  };

  const startAdd = (reportId: string) => {
    setAddingForReport(reportId);
    setEditingLineId(null);
    setDraft(emptyDraft);
  };

  const reportsByDate = new Map<string, ArchivedReport[]>();
  for (const r of archivedReports) {
    const dateKey = format(new Date(r.created_at), "yyyy-MM-dd");
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
        <p className="text-sm">Inga arkiverade produktionsrapporter ännu</p>
        <p className="text-xs">Rapporter arkiveras automatiskt varje natt kl 00:00</p>
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
        <Input className="h-7 text-xs" value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="date" className="h-7 text-xs" value={draft.production_date} onChange={(e) => setDraft({ ...draft, production_date: e.target.value })} />
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
        <Input className="h-7 text-xs" placeholder="Operatör" value={draft.operator} onChange={(e) => setDraft({ ...draft, operator: e.target.value })} />
      </TableCell>
      <TableCell className="py-1 px-1">
        <Input type="date" className="h-7 text-xs" value={draft.production_date} onChange={(e) => setDraft({ ...draft, production_date: e.target.value })} />
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
        <div>
          <h2 className="text-lg font-semibold">Produktionsrapporter – Arkiv</h2>
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
            const dayTotal = reports.reduce((s, r) => s + (r.total_quantity || 0), 0);
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
                      {dayTotal} st/kg
                    </span>
                    <Badge variant="outline" className="text-[10px]">Arkiverad</Badge>
                  </div>
                </div>

                {isDateExpanded && (
                  <CardContent className="px-4 pb-3 pt-0 space-y-2">
                    {reports.map((report) => {
                      const lines = linesByReport.get(report.id) || [];
                      const isReportExpanded = expandedReport === report.id;
                      const displayName = report.display_name || report.report_name;
                      const reportTotal = report.total_quantity || lines.reduce((s, l) => s + l.quantity, 0);
                      const isEditingName = editingNameId === report.id;

                      return (
                        <div key={report.id} className="border rounded-md overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors">
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
                                {reportTotal} st/kg
                              </span>
                              {report.status === "Bekräftad" ? (
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
                                    <TableHead className="py-0.5 px-1 text-[11px] text-right w-[80px]">Antal</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[60px]">Enhet</TableHead>
                                    <TableHead className="py-0.5 px-1 text-[11px] w-[110px]">Operatör</TableHead>
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
                                        <TableCell className="py-0.5 px-1 text-muted-foreground">{l.operator || "–"}</TableCell>
                                        <TableCell className="py-0.5 px-1 text-muted-foreground">{l.production_date || "–"}</TableCell>
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
