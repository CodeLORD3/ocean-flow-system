import { useState, useCallback } from "react";
import { PdfViewer } from "@/components/PdfViewer";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, Trash2, Plus, ZoomIn, ZoomOut, RotateCcw, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";

type ReportLine = {
  id: string;
  report_id: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  product_id: string | null;
  supplier_name: string | null;
  status: string;
  purchase_date: string | null;
};

type Report = {
  id: string;
  created_at: string;
  file_name: string;
  file_url: string;
  status: string;
  notes: string | null;
  total_amount: number;
};

export default function PurchaseReporting() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [newLine, setNewLine] = useState({
    product_name: "",
    unit_price: "",
    supplier_name: "",
    status: "Inköpt" as string,
    purchase_date: format(new Date(), "yyyy-MM-dd"),
    quantity: "1",
    unit: "kg",
  });

  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ["purchase-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Report[];
    },
  });

  const { data: allLines = [] } = useQuery({
    queryKey: ["purchase-report-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_report_lines")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ReportLine[];
    },
  });

  const selectedReport = reports.find((r) => r.id === selectedReportId) ?? null;

  // Lines for currently selected report
  const selectedLines = allLines.filter((l) => l.report_id === selectedReportId);

  const deleteReport = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("purchase_report_lines").delete().eq("report_id", id);
      const { error } = await supabase.from("purchase_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
      if (selectedReportId) setSelectedReportId(null);
      toast({ title: "Rapport raderad" });
    },
  });

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_report_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
    },
  });

  const addLine = useMutation({
    mutationFn: async () => {
      if (!selectedReportId) throw new Error("Välj en rapport först");
      const unitPrice = parseFloat(newLine.unit_price) || 0;
      const qty = parseFloat(newLine.quantity) || 0;
      const { error } = await supabase.from("purchase_report_lines").insert({
        report_id: selectedReportId,
        product_name: newLine.product_name,
        quantity: qty,
        unit: newLine.unit,
        unit_price: unitPrice,
        line_total: unitPrice * qty,
        supplier_name: newLine.supplier_name || null,
        status: newLine.status,
        purchase_date: newLine.purchase_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
      setAddOpen(false);
      setNewLine({
        product_name: "",
        unit_price: "",
        supplier_name: "",
        status: "Inköpt",
        purchase_date: format(new Date(), "yyyy-MM-dd"),
        quantity: "1",
        unit: "kg",
      });
      toast({ title: "Produkt tillagd" });
    },
  });

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isValid = file.type.startsWith("image/") || file.type === "application/pdf";
      if (!isValid) {
        toast({ title: "Ogiltigt format", description: "Ladda upp en bild eller PDF.", variant: "destructive" });
        return;
      }

      setUploading(true);
      try {
        const ext = file.name.split(".").pop();
        const path = `${crypto.randomUUID()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from("purchase-documents")
          .upload(path, file, { contentType: file.type });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from("purchase-documents").getPublicUrl(path);
        const fileUrl = urlData.publicUrl;

        const { data: report, error: reportError } = await supabase
          .from("purchase_reports")
          .insert({ file_name: file.name, file_url: fileUrl, status: "Bearbetar" })
          .select()
          .single();
        if (reportError) throw reportError;

        setSelectedReportId(report.id);
        queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });

        // Parse with AI
        setParsing(true);
        const { data: fnData, error: fnError } = await supabase.functions.invoke("parse-foljesedel", {
          body: { fileUrl },
        });

        if (fnError) throw fnError;
        if (fnData?.error) throw new Error(fnData.error);

        const products = fnData.products || [];

        if (products.length > 0) {
          const lines = products.map((p: any) => ({
            report_id: report.id,
            product_name: p.product_name,
            quantity: p.quantity ?? 0,
            unit: p.unit ?? "kg",
            unit_price: p.unit_price ?? 0,
            line_total: p.line_total ?? 0,
            status: "Inköpt",
            purchase_date: format(new Date(), "yyyy-MM-dd"),
          }));

          const { error: linesError } = await supabase.from("purchase_report_lines").insert(lines);
          if (linesError) throw linesError;

          const total = products.reduce((s: number, p: any) => s + (p.line_total ?? 0), 0);
          await supabase.from("purchase_reports").update({ status: "Klar", total_amount: total }).eq("id", report.id);
        } else {
          await supabase.from("purchase_reports").update({ status: "Inga produkter hittades" }).eq("id", report.id);
        }

        queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });
        queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
        toast({ title: "Följesedel bearbetad", description: `${products.length} produkter extraherade.` });
      } catch (err: any) {
        console.error(err);
        toast({ title: "Fel", description: err.message || "Kunde inte bearbeta filen.", variant: "destructive" });
      } finally {
        setUploading(false);
        setParsing(false);
        e.target.value = "";
      }
    },
    [queryClient]
  );

  // Navigate between reports
  const currentIdx = reports.findIndex((r) => r.id === selectedReportId);
  const goPrev = () => {
    if (currentIdx > 0) setSelectedReportId(reports[currentIdx - 1].id);
  };
  const goNext = () => {
    if (currentIdx < reports.length - 1) setSelectedReportId(reports[currentIdx + 1].id);
  };

  const grandTotal = allLines.reduce((s, l) => s + (l.line_total ?? 0), 0);

  const statusColor = (s: string) => {
    switch (s) {
      case "Beställd": return "secondary";
      case "Inköpt": return "default";
      default: return "outline";
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)]">
      <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg border">
        {/* LEFT: Product list */}
        <ResizablePanel defaultSize={55} minSize={35}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h1 className="text-xl font-bold">Inköpsrapportering</h1>
                <p className="text-muted-foreground text-xs">
                  Totalt: <span className="font-semibold text-foreground">{grandTotal.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr</span>
                  {" · "}{allLines.length} rader
                </p>
              </div>
              <div className="flex gap-2">
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" disabled={!selectedReportId}>
                      <Plus className="h-4 w-4 mr-1" /> Lägg till produkt
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Lägg till produkt</DialogTitle>
                    </DialogHeader>
                    <div className="grid gap-3 py-2">
                      <div>
                        <Label>Produktnamn *</Label>
                        <Input
                          value={newLine.product_name}
                          onChange={(e) => setNewLine((p) => ({ ...p, product_name: e.target.value }))}
                          placeholder="T.ex. Lax färsk"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label>Antal</Label>
                          <Input
                            type="number"
                            value={newLine.quantity}
                            onChange={(e) => setNewLine((p) => ({ ...p, quantity: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label>Enhet</Label>
                          <Select value={newLine.unit} onValueChange={(v) => setNewLine((p) => ({ ...p, unit: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="kg">kg</SelectItem>
                              <SelectItem value="st">st</SelectItem>
                              <SelectItem value="l">l</SelectItem>
                              <SelectItem value="förp">förp</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Inköpspris (kr)</Label>
                          <Input
                            type="number"
                            value={newLine.unit_price}
                            onChange={(e) => setNewLine((p) => ({ ...p, unit_price: e.target.value }))}
                            placeholder="0.00"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Leverantör</Label>
                        <Input
                          value={newLine.supplier_name}
                          onChange={(e) => setNewLine((p) => ({ ...p, supplier_name: e.target.value }))}
                          placeholder="T.ex. Nordic Seafood"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Status</Label>
                          <Select value={newLine.status} onValueChange={(v) => setNewLine((p) => ({ ...p, status: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Beställd">Beställd</SelectItem>
                              <SelectItem value="Inköpt">Inköpt</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>{newLine.status === "Beställd" ? "Leveransdatum" : "Inköpsdatum"}</Label>
                          <Input
                            type="date"
                            value={newLine.purchase_date}
                            onChange={(e) => setNewLine((p) => ({ ...p, purchase_date: e.target.value }))}
                          />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Avbryt</Button>
                      </DialogClose>
                      <Button
                        onClick={() => addLine.mutate()}
                        disabled={!newLine.product_name.trim() || addLine.isPending}
                      >
                        {addLine.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Lägg till
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <ScrollArea className="flex-1">
              {allLines.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-16">
                  Inga produkter ännu. Ladda upp en följesedel till höger eller lägg till manuellt.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-right">Antal</TableHead>
                      <TableHead className="text-right">Pris</TableHead>
                      <TableHead>Leverantör</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allLines.map((l) => (
                      <TableRow key={l.id} className={l.report_id === selectedReportId ? "bg-accent/30" : ""}>
                        <TableCell className="font-medium text-sm">{l.product_name}</TableCell>
                        <TableCell className="text-right text-sm">
                          {l.quantity} {l.unit}
                        </TableCell>
                        <TableCell className="text-right text-sm">
                          {l.unit_price?.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{l.supplier_name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={statusColor(l.status)} className="text-xs">
                            {l.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {l.purchase_date ? new Date(l.purchase_date).toLocaleDateString("sv-SE") : "—"}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => deleteLine.mutate(l.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT: Document viewer */}
        <ResizablePanel defaultSize={45} minSize={25}>
          <div className="flex flex-col h-full">
            {/* Top bar: upload + report selector */}
            <div className="flex items-center justify-between p-3 border-b gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentIdx <= 0}
                  onClick={goPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {selectedReport ? (
                  <span className="text-sm font-medium truncate max-w-[180px]">
                    {selectedReport.file_name}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Ingen följesedel vald</span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={currentIdx >= reports.length - 1 || currentIdx < 0}
                  onClick={goNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center gap-1">
                {selectedReport && (
                  <>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                      <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-xs w-12 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom(1)}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => deleteReport.mutate(selectedReport.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
                <label>
                  <Input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading || parsing}
                  />
                  <Button asChild size="sm" variant="outline" disabled={uploading || parsing}>
                    <span className="cursor-pointer">
                      {uploading || parsing ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4 mr-1" />
                      )}
                      {parsing ? "Extraherar..." : "Ladda upp"}
                    </span>
                  </Button>
                </label>
              </div>
            </div>

            {/* Report list (compact) when no report selected */}
            {!selectedReport ? (
              <ScrollArea className="flex-1">
                {reportsLoading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : reports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
                    <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground text-sm">
                      Ladda upp en bild eller PDF av en följesedel för att komma igång
                    </p>
                  </div>
                ) : (
                  <div className="p-3 space-y-2">
                    {reports.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => { setSelectedReportId(r.id); setZoom(1); }}
                        className="w-full text-left p-3 rounded-md border hover:bg-accent/50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm truncate">{r.file_name}</span>
                          <Badge variant={r.status === "Klar" ? "default" : "secondary"} className="text-xs ml-2">
                            {r.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(r.created_at).toLocaleDateString("sv-SE")} · {r.total_amount?.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            ) : (
              /* Document viewer with zoom */
              <ScrollArea className="flex-1">
              <div className="p-4">
                  {selectedReport.file_name.toLowerCase().endsWith(".pdf") ? (
                    <PdfViewer url={selectedReport.file_url} zoom={zoom} />
                  ) : (
                    <div className="flex justify-center">
                      <img
                        src={selectedReport.file_url}
                        alt={selectedReport.file_name}
                        className="rounded-md shadow-sm max-w-full"
                        style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                        draggable={false}
                      />
                    </div>
                  )}
                </div>
              </ScrollArea>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
