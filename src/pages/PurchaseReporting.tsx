import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, Trash2, Plus, Eye } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type ExtractedProduct = {
  product_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
};

type ReportLine = {
  id: string;
  report_id: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  product_id: string | null;
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
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

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

  const { data: selectedLines = [] } = useQuery({
    queryKey: ["purchase-report-lines", selectedReport],
    enabled: !!selectedReport,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_report_lines")
        .select("*")
        .eq("report_id", selectedReport!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as ReportLine[];
    },
  });

  const deleteReport = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("purchase_reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
      if (selectedReport) setSelectedReport(null);
      toast({ title: "Rapport raderad" });
    },
  });

  // Aggregate all lines into a total purchase list
  const aggregatedProducts = (() => {
    const map = new Map<string, { product_name: string; total_qty: number; unit: string; total_cost: number }>();
    allLines.forEach((l) => {
      const key = l.product_name.toLowerCase().trim();
      const existing = map.get(key);
      if (existing) {
        existing.total_qty += l.quantity;
        existing.total_cost += l.line_total ?? 0;
      } else {
        map.set(key, {
          product_name: l.product_name,
          total_qty: l.quantity,
          unit: l.unit ?? "kg",
          total_cost: l.line_total ?? 0,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.product_name.localeCompare(b.product_name, "sv"));
  })();

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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

      const { data: urlData } = supabase.storage
        .from("purchase-documents")
        .getPublicUrl(path);
      const fileUrl = urlData.publicUrl;

      // Create report record
      const { data: report, error: reportError } = await supabase
        .from("purchase_reports")
        .insert({ file_name: file.name, file_url: fileUrl, status: "Bearbetar" })
        .select()
        .single();
      if (reportError) throw reportError;

      queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });

      // Parse with AI
      setParsing(true);
      const { data: fnData, error: fnError } = await supabase.functions.invoke("parse-foljesedel", {
        body: { fileUrl },
      });

      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(fnData.error);

      const products: ExtractedProduct[] = fnData.products || [];

      if (products.length > 0) {
        const lines = products.map((p) => ({
          report_id: report.id,
          product_name: p.product_name,
          quantity: p.quantity ?? 0,
          unit: p.unit ?? "kg",
          unit_price: p.unit_price ?? 0,
          line_total: p.line_total ?? 0,
        }));

        const { error: linesError } = await supabase.from("purchase_report_lines").insert(lines);
        if (linesError) throw linesError;

        const total = products.reduce((s, p) => s + (p.line_total ?? 0), 0);
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
  }, [queryClient]);

  const grandTotal = aggregatedProducts.reduce((s, p) => s + p.total_cost, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inköpsrapportering</h1>
          <p className="text-muted-foreground text-sm">
            Ladda upp följesedlar för att bygga en total inköpslista
          </p>
        </div>
        <label>
          <Input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading || parsing}
          />
          <Button asChild disabled={uploading || parsing}>
            <span className="cursor-pointer">
              {uploading || parsing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {parsing ? "Extraherar produkter..." : uploading ? "Laddar upp..." : "Ladda upp följesedel"}
            </span>
          </Button>
        </label>
      </div>

      {/* Uploaded reports */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Uppladdade följesedlar</CardTitle>
          <CardDescription>{reports.length} följesedlar</CardDescription>
        </CardHeader>
        <CardContent>
          {reportsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              Inga följesedlar uppladdade ännu. Ladda upp en bild eller PDF ovan.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filnamn</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Belopp</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {r.file_name}
                      </div>
                    </TableCell>
                    <TableCell>{new Date(r.created_at).toLocaleDateString("sv-SE")}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "Klar" ? "default" : r.status === "Bearbetar" ? "secondary" : "outline"}>
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{r.total_amount?.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setSelectedReport(r.id)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                            <DialogHeader>
                              <DialogTitle>{r.file_name}</DialogTitle>
                            </DialogHeader>
                            {r.file_url && (
                              <img src={r.file_url} alt={r.file_name} className="w-full rounded-md mb-4 max-h-64 object-contain" />
                            )}
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Produkt</TableHead>
                                  <TableHead className="text-right">Antal</TableHead>
                                  <TableHead>Enhet</TableHead>
                                  <TableHead className="text-right">À-pris</TableHead>
                                  <TableHead className="text-right">Summa</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {selectedLines.map((l) => (
                                  <TableRow key={l.id}>
                                    <TableCell>{l.product_name}</TableCell>
                                    <TableCell className="text-right">{l.quantity}</TableCell>
                                    <TableCell>{l.unit}</TableCell>
                                    <TableCell className="text-right">{l.unit_price?.toLocaleString("sv-SE", { minimumFractionDigits: 2 })}</TableCell>
                                    <TableCell className="text-right">{l.line_total?.toLocaleString("sv-SE", { minimumFractionDigits: 2 })}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteReport.mutate(r.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Aggregated total purchase list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Total inköpslista</CardTitle>
          <CardDescription>
            Sammanställning av alla uppladdade följesedlar — totalt{" "}
            <span className="font-semibold text-foreground">{grandTotal.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {aggregatedProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">Inga produkter ännu.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead className="text-right">Total mängd</TableHead>
                  <TableHead>Enhet</TableHead>
                  <TableHead className="text-right">Total kostnad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aggregatedProducts.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{p.product_name}</TableCell>
                    <TableCell className="text-right">{p.total_qty}</TableCell>
                    <TableCell>{p.unit}</TableCell>
                    <TableCell className="text-right">{p.total_cost.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
