import { useState, useCallback, useRef, useEffect } from "react";
import { PdfViewer } from "@/components/PdfViewer";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Upload, Loader2, Trash2, Plus, ZoomIn, ZoomOut, RotateCcw, FileText, ChevronLeft, ChevronRight, Search, Pencil, Check, X, PackagePlus } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProducts } from "@/hooks/useProducts";
import { useSuppliers } from "@/hooks/useSuppliers";

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

// Inline editable row
function EditableRow({
  line,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  products,
  suppliers,
}: {
  line: ReportLine;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (updated: Partial<ReportLine>) => void;
  onDelete: () => void;
  products: any[];
  suppliers: any[];
}) {
  const [draft, setDraft] = useState({
    product_name: line.product_name,
    quantity: String(line.quantity),
    unit: line.unit || "kg",
    unit_price: String(line.unit_price ?? 0),
    supplier_name: line.supplier_name || "",
    status: line.status,
    purchase_date: line.purchase_date || "",
    product_id: line.product_id || "",
  });
  const [productSearch, setProductSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);

  useEffect(() => {
    if (isEditing) {
      setDraft({
        product_name: line.product_name,
        quantity: String(line.quantity),
        unit: line.unit || "kg",
        unit_price: String(line.unit_price ?? 0),
        supplier_name: line.supplier_name || "",
        status: line.status,
        purchase_date: line.purchase_date || "",
        product_id: line.product_id || "",
      });
    }
  }, [isEditing, line]);

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  const handleSave = () => {
    const qty = parseFloat(draft.quantity) || 0;
    const price = parseFloat(draft.unit_price) || 0;
    onSave({
      product_name: draft.product_name,
      quantity: qty,
      unit: draft.unit,
      unit_price: price,
      line_total: qty * price,
      supplier_name: draft.supplier_name || null,
      status: draft.status,
      purchase_date: draft.purchase_date || null,
      product_id: draft.product_id || null,
    });
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "Beställd": return "secondary";
      case "Inköpt": return "default";
      default: return "outline";
    }
  };

  if (!isEditing) {
    return (
      <TableRow className="group cursor-pointer hover:bg-accent/30" onDoubleClick={onStartEdit}>
        <TableCell className="font-medium text-sm">
          <div className="flex items-center gap-1">
            {line.product_name}
            {!line.product_id && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 text-amber-600 border-amber-300">Ej kopplad</Badge>
            )}
          </div>
        </TableCell>
        <TableCell className="text-right text-sm">{line.quantity} {line.unit}</TableCell>
        <TableCell className="text-right text-sm">{line.unit_price?.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr</TableCell>
        <TableCell className="text-sm text-muted-foreground">{line.supplier_name ?? "—"}</TableCell>
        <TableCell><Badge variant={statusColor(line.status)} className="text-xs">{line.status}</Badge></TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {line.purchase_date ? new Date(line.purchase_date).toLocaleDateString("sv-SE") : "—"}
        </TableCell>
        <TableCell>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onStartEdit}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="bg-accent/20">
      <TableCell>
        <Popover open={productOpen} onOpenChange={setProductOpen}>
          <PopoverTrigger asChild>
            <Input
              value={draft.product_name}
              onChange={(e) => {
                setDraft((d) => ({ ...d, product_name: e.target.value, product_id: "" }));
                setProductSearch(e.target.value);
                if (!productOpen) setProductOpen(true);
              }}
              className="h-8 text-sm"
              placeholder="Sök produkt..."
            />
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[280px]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <Command shouldFilter={false}>
              <CommandList>
                <CommandEmpty>Ingen produkt hittad</CommandEmpty>
                <CommandGroup heading="Produkter">
                  {filteredProducts.slice(0, 15).map((p) => (
                    <CommandItem
                      key={p.id}
                      onSelect={() => {
                        setDraft((d) => ({
                          ...d,
                          product_name: p.name,
                          product_id: p.id,
                          unit: p.unit || d.unit,
                          unit_price: String(p.cost_price || d.unit_price),
                          supplier_name: p.suppliers?.name || d.supplier_name,
                        }));
                        setProductOpen(false);
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.sku} · {p.category}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Input
            type="number"
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
            className="h-8 text-sm w-16"
          />
          <Select value={draft.unit} onValueChange={(v) => setDraft((d) => ({ ...d, unit: v }))}>
            <SelectTrigger className="h-8 w-16 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="kg">kg</SelectItem>
              <SelectItem value="st">st</SelectItem>
              <SelectItem value="l">l</SelectItem>
              <SelectItem value="förp">förp</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </TableCell>
      <TableCell>
        <Input
          type="number"
          value={draft.unit_price}
          onChange={(e) => setDraft((d) => ({ ...d, unit_price: e.target.value }))}
          className="h-8 text-sm w-20"
        />
      </TableCell>
      <TableCell>
        <Input
          value={draft.supplier_name}
          onChange={(e) => setDraft((d) => ({ ...d, supplier_name: e.target.value }))}
          className="h-8 text-sm"
          placeholder="Leverantör"
        />
      </TableCell>
      <TableCell>
        <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v }))}>
          <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Beställd">Beställd</SelectItem>
            <SelectItem value="Inköpt">Inköpt</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={draft.purchase_date}
          onChange={(e) => setDraft((d) => ({ ...d, purchase_date: e.target.value }))}
          className="h-8 text-sm w-32"
        />
      </TableCell>
      <TableCell>
        <div className="flex gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-primary" onClick={handleSave}>
            <Check className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onCancelEdit}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function PurchaseReporting() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  // Product search bar state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // New product dialog
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({
    name: "",
    sku: "",
    category: "Fisk",
    unit: "kg",
    cost_price: "",
    wholesale_price: "",
    retail_suggested: "",
  });

  const { data: products = [] } = useProducts();
  const { data: suppliers = [] } = useSuppliers();

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] }),
  });

  const updateLine = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ReportLine> & { id: string }) => {
      const { error } = await supabase.from("purchase_report_lines").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
      setEditingLineId(null);
      toast({ title: "Rad uppdaterad" });
    },
  });

  // Add line from search (existing product)
  const addLineFromProduct = useMutation({
    mutationFn: async (product: any) => {
      if (!selectedReportId) throw new Error("Välj en rapport först");
      const { error } = await supabase.from("purchase_report_lines").insert({
        report_id: selectedReportId,
        product_name: product.name,
        product_id: product.id,
        quantity: 0,
        unit: product.unit || "kg",
        unit_price: product.cost_price || 0,
        line_total: 0,
        supplier_name: product.suppliers?.name || null,
        status: "Inköpt",
        purchase_date: format(new Date(), "yyyy-MM-dd"),
      });
      if (error) throw error;
    },
    onSuccess: (_, product) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
      setSearchQuery("");
      setSearchOpen(false);
      toast({ title: `${product.name} tillagd` });
    },
  });

  // Create new product + add as line
  const createProductAndAdd = useMutation({
    mutationFn: async () => {
      const { data: created, error: pErr } = await supabase
        .from("products")
        .insert({
          name: newProduct.name,
          sku: newProduct.sku || `NEW-${Date.now()}`,
          category: newProduct.category,
          unit: newProduct.unit,
          cost_price: parseFloat(newProduct.cost_price) || 0,
          wholesale_price: parseFloat(newProduct.wholesale_price) || 0,
          retail_suggested: parseFloat(newProduct.retail_suggested) || 0,
        } as any)
        .select()
        .single();
      if (pErr) throw pErr;

      if (selectedReportId) {
        const { error: lErr } = await supabase.from("purchase_report_lines").insert({
          report_id: selectedReportId,
          product_name: created.name,
          product_id: created.id,
          quantity: 0,
          unit: created.unit || "kg",
          unit_price: created.cost_price || 0,
          line_total: 0,
          status: "Inköpt",
          purchase_date: format(new Date(), "yyyy-MM-dd"),
        });
        if (lErr) throw lErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
      setNewProductOpen(false);
      setNewProduct({ name: "", sku: "", category: "Fisk", unit: "kg", cost_price: "", wholesale_price: "", retail_suggested: "" });
      toast({ title: "Ny produkt skapad och tillagd" });
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

        setParsing(true);
        const { data: fnData, error: fnError } = await supabase.functions.invoke("parse-foljesedel", {
          body: { fileUrl },
        });

        if (fnError) throw fnError;
        if (fnData?.error) throw new Error(fnData.error);

        const parsedProducts = fnData.products || [];

        if (parsedProducts.length > 0) {
          const lines = parsedProducts.map((p: any) => ({
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

          const total = parsedProducts.reduce((s: number, p: any) => s + (p.line_total ?? 0), 0);
          await supabase.from("purchase_reports").update({ status: "Klar", total_amount: total }).eq("id", report.id);
        } else {
          await supabase.from("purchase_reports").update({ status: "Inga produkter hittades" }).eq("id", report.id);
        }

        queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });
        queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
        toast({ title: "Följesedel bearbetad", description: `${parsedProducts.length} produkter extraherade.` });
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

  const currentIdx = reports.findIndex((r) => r.id === selectedReportId);
  const goPrev = () => { if (currentIdx > 0) setSelectedReportId(reports[currentIdx - 1].id); };
  const goNext = () => { if (currentIdx < reports.length - 1) setSelectedReportId(reports[currentIdx + 1].id); };

  const grandTotal = allLines.reduce((s, l) => s + (l.line_total ?? 0), 0);

  const searchedProducts = products.filter((p) =>
    searchQuery.length > 0 && p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
            </div>

            {/* Search bar to add existing products + new product button */}
            {selectedReportId && (
              <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
                <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                  <PopoverTrigger asChild>
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          if (e.target.value.length > 0 && !searchOpen) setSearchOpen(true);
                          if (e.target.value.length === 0) setSearchOpen(false);
                        }}
                        placeholder="Sök och lägg till produkt från produktlistan..."
                        className="pl-9 h-9 text-sm"
                      />
                    </div>
                  </PopoverTrigger>
                  {searchQuery.length > 0 && (
                    <PopoverContent className="p-0 w-[400px]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                      <Command shouldFilter={false}>
                        <CommandList>
                          <CommandEmpty>
                            <div className="py-3 text-center">
                              <p className="text-sm text-muted-foreground mb-2">Ingen produkt hittad för "{searchQuery}"</p>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSearchOpen(false);
                                  setNewProduct((p) => ({ ...p, name: searchQuery }));
                                  setNewProductOpen(true);
                                  setSearchQuery("");
                                }}
                              >
                                <PackagePlus className="h-4 w-4 mr-1" /> Skapa ny produkt
                              </Button>
                            </div>
                          </CommandEmpty>
                          <CommandGroup heading="Produkter i systemet">
                            {searchedProducts.slice(0, 20).map((p) => (
                              <CommandItem
                                key={p.id}
                                onSelect={() => addLineFromProduct.mutate(p)}
                                className="cursor-pointer"
                              >
                                <div className="flex flex-col flex-1">
                                  <span className="text-sm font-medium">{p.name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {p.sku} · {p.category} · {p.cost_price?.toLocaleString("sv-SE")} kr/{p.unit}
                                    {p.suppliers?.name ? ` · ${p.suppliers.name}` : ""}
                                  </span>
                                </div>
                                <Plus className="h-4 w-4 text-muted-foreground" />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  )}
                </Popover>

                <Dialog open={newProductOpen} onOpenChange={setNewProductOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="shrink-0">
                      <PackagePlus className="h-4 w-4 mr-1" /> Ny produkt
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Skapa ny produkt</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                      Produkten finns inte i systemet. Fyll i uppgifterna för att skapa den och lägga till den i rapporten.
                    </p>
                    <div className="grid gap-3 py-2">
                      <div>
                        <Label>Produktnamn *</Label>
                        <Input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} placeholder="T.ex. Lax färsk" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>SKU</Label>
                          <Input value={newProduct.sku} onChange={(e) => setNewProduct((p) => ({ ...p, sku: e.target.value }))} placeholder="AUTO om tom" />
                        </div>
                        <div>
                          <Label>Kategori</Label>
                          <Input value={newProduct.category} onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label>Enhet</Label>
                          <Select value={newProduct.unit} onValueChange={(v) => setNewProduct((p) => ({ ...p, unit: v }))}>
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
                          <Label>Inköpspris</Label>
                          <Input type="number" value={newProduct.cost_price} onChange={(e) => setNewProduct((p) => ({ ...p, cost_price: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Grossistpris</Label>
                          <Input type="number" value={newProduct.wholesale_price} onChange={(e) => setNewProduct((p) => ({ ...p, wholesale_price: e.target.value }))} />
                        </div>
                      </div>
                    </div>
                    <DialogFooter>
                      <DialogClose asChild><Button variant="outline">Avbryt</Button></DialogClose>
                      <Button onClick={() => createProductAndAdd.mutate()} disabled={!newProduct.name.trim() || createProductAndAdd.isPending}>
                        {createProductAndAdd.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        Skapa & lägg till
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            )}

            <ScrollArea className="flex-1">
              {allLines.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-16">
                  Inga produkter ännu. Ladda upp en följesedel till höger eller sök efter produkter ovan.
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
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allLines.map((l) => (
                      <EditableRow
                        key={l.id}
                        line={l}
                        isEditing={editingLineId === l.id}
                        onStartEdit={() => setEditingLineId(l.id)}
                        onCancelEdit={() => setEditingLineId(null)}
                        onSave={(updates) => updateLine.mutate({ id: l.id, ...updates } as any)}
                        onDelete={() => deleteLine.mutate(l.id)}
                        products={products}
                        suppliers={suppliers}
                      />
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
            <div className="flex items-center justify-between p-3 border-b gap-2">
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentIdx <= 0} onClick={goPrev}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {selectedReport ? (
                  <span className="text-sm font-medium truncate max-w-[180px]">{selectedReport.file_name}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">Ingen följesedel vald</span>
                )}
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentIdx >= reports.length - 1 || currentIdx < 0} onClick={goNext}>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteReport.mutate(selectedReport.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
                <label>
                  <Input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileUpload} disabled={uploading || parsing} />
                  <Button asChild size="sm" variant="outline" disabled={uploading || parsing}>
                    <span className="cursor-pointer">
                      {uploading || parsing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                      {parsing ? "Extraherar..." : "Ladda upp"}
                    </span>
                  </Button>
                </label>
              </div>
            </div>

            {!selectedReport ? (
              <ScrollArea className="flex-1">
                {reportsLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                ) : reports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
                    <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
                    <p className="text-muted-foreground text-sm">Ladda upp en bild eller PDF av en följesedel för att komma igång</p>
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
                          <Badge variant={r.status === "Klar" ? "default" : "secondary"} className="text-xs ml-2">{r.status}</Badge>
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
