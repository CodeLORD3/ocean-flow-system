import { useState, useCallback, useRef, useEffect } from "react";
import { markOrderLinesBehandlas } from "@/lib/orderStatusSync";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Trash2, Plus, Search, PackagePlus, Lock, ChevronDown, ChevronUp, CheckCircle2, Pencil, Loader2, Factory } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProducts } from "@/hooks/useProducts";
import { format } from "date-fns";

type ProdReportLine = {
  id: string;
  report_id: string;
  product_name: string;
  quantity: number;
  unit: string | null;
  product_id: string | null;
  status: string;
  production_date: string | null;
  operator: string | null;
  notes: string | null;
};

type ProdReport = {
  id: string;
  created_at: string;
  report_name: string;
  display_name: string | null;
  status: string;
  total_quantity: number;
  notes: string | null;
};

// Inline editable row
function EditableRow({
  line,
  onSave,
  onDelete,
  products,
  autoFocusQty,
  onQtyFocused,
  locked,
}: {
  line: ProdReportLine;
  onSave: (updated: Partial<ProdReportLine>) => void;
  onDelete: () => void;
  products: any[];
  autoFocusQty?: boolean;
  onQtyFocused?: () => void;
  locked?: boolean;
}) {
  const [productSearch, setProductSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [productIdx, setProductIdx] = useState(0);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const productInputRef = useRef<HTMLInputElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocusQty && qtyInputRef.current) {
      qtyInputRef.current.focus();
      qtyInputRef.current.select();
      onQtyFocused?.();
    }
  }, [autoFocusQty]);

  const commitField = (field: string, value: any) => {
    if (locked) return;
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onSave({ [field]: value }), 400);
  };

  const filteredProducts = products.filter((p: any) =>
    productSearch.length > 0 && p.name.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 12);

  const selectProduct = (p: any) => {
    if (locked) return;
    onSave({
      product_name: p.name,
      product_id: p.id,
      unit: p.unit || line.unit,
    });
    setProductOpen(false);
    setProductSearch("");
    if (productInputRef.current) productInputRef.current.value = p.name;
  };

  const handleProductKeyDown = (e: React.KeyboardEvent) => {
    if (!productOpen || filteredProducts.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setProductIdx((i) => Math.min(i + 1, filteredProducts.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setProductIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); selectProduct(filteredProducts[productIdx]); }
  };

  if (locked) {
    return (
      <TableRow className="h-8 opacity-75">
        <TableCell className="py-0.5 px-1.5 text-[11px] min-w-[160px]">{line.product_name}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] text-right w-[60px]">{line.quantity}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[42px]">{line.unit || "kg"}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[62px]">{line.status}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[86px]">{line.production_date || "—"}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[80px]">{line.operator || "—"}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[100px] truncate">{line.notes || "—"}</TableCell>
        <TableCell className="py-0.5 px-0 w-6"></TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="h-8 group/row">
      <TableCell className="py-0.5 px-1.5 min-w-[160px]">
        <Popover open={productOpen} onOpenChange={setProductOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Input
                ref={productInputRef}
                defaultValue={line.product_name}
                onChange={(e) => {
                  setProductSearch(e.target.value);
                  setProductIdx(0);
                  if (e.target.value.length > 0 && !productOpen) setProductOpen(true);
                  if (e.target.value.length === 0) setProductOpen(false);
                  commitField("product_name", e.target.value);
                }}
                onFocus={(e) => { e.target.select(); setProductSearch(e.target.value); if (e.target.value.length > 0) setProductOpen(true); }}
                onKeyDown={handleProductKeyDown}
                className="h-6 text-[11px] border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 min-w-[140px]"
                placeholder="Sök produkt..."
              />
              {!line.product_id && (
                <span className="absolute right-1 top-1/2 -translate-y-1/2">
                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600 border-amber-300">Ej kopplad</Badge>
                </span>
              )}
            </div>
          </PopoverTrigger>
          {productSearch.length > 0 && filteredProducts.length > 0 && (
            <PopoverContent className="p-0 w-[260px]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="max-h-[200px] overflow-y-auto py-1">
                {filteredProducts.map((p: any, i: number) => (
                  <div
                    key={p.id}
                    className={`px-2 py-1.5 text-xs cursor-pointer rounded-sm mx-1 ${i === productIdx ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                    onMouseEnter={() => setProductIdx(i)}
                    onMouseDown={(e) => { e.preventDefault(); selectProduct(p); }}
                  >
                    <div className="font-medium">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.sku} · {p.category}</div>
                  </div>
                ))}
              </div>
            </PopoverContent>
          )}
        </Popover>
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[60px]">
        <Input
          ref={qtyInputRef}
          type="number"
          defaultValue={line.quantity}
          onFocus={(e) => e.target.select()}
          onChange={(e) => commitField("quantity", parseFloat(e.target.value) || 0)}
          className="h-6 text-[11px] w-14 border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 text-right"
        />
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[42px]">
        <Select defaultValue={line.unit || "kg"} onValueChange={(v) => onSave({ unit: v })}>
          <SelectTrigger className="h-6 w-10 text-[11px] border-transparent bg-transparent hover:border-input"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="kg">kg</SelectItem>
            <SelectItem value="st">st</SelectItem>
            <SelectItem value="l">l</SelectItem>
            <SelectItem value="förp">förp</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[62px]">
        <Select defaultValue={line.status} onValueChange={(v) => onSave({ status: v })}>
          <SelectTrigger className="h-6 w-[58px] text-[11px] border-transparent bg-transparent hover:border-input"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Producerad">Producerad</SelectItem>
            <SelectItem value="Planerad">Planerad</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[86px]">
        <Input
          type="date"
          defaultValue={line.production_date || ""}
          onChange={(e) => commitField("production_date", e.target.value || null)}
          className="h-6 text-[11px] border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 w-[78px]"
        />
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[80px]">
        <Input
          defaultValue={line.operator || ""}
          onChange={(e) => commitField("operator", e.target.value || null)}
          className="h-6 text-[11px] border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 w-[72px]"
          placeholder="Operatör"
        />
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[100px]">
        <Input
          defaultValue={line.notes || ""}
          onChange={(e) => commitField("notes", e.target.value || null)}
          className="h-6 text-[11px] border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 w-[90px]"
          placeholder="Anteckning"
        />
      </TableCell>
      <TableCell className="py-0.5 px-0 w-6">
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={onDelete}>
          <Trash2 className="h-2.5 w-2.5 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

// Collapsible report section
function ReportSection({
  report,
  lines,
  products,
  onUpdateLine,
  onDeleteLine,
  onConfirm,
  onRenameReport,
  focusLineId,
  onQtyFocused,
}: {
  report: ProdReport;
  lines: ProdReportLine[];
  products: any[];
  onUpdateLine: (id: string, updates: Partial<ProdReportLine>) => void;
  onDeleteLine: (id: string) => void;
  onConfirm: (reportId: string) => void;
  onRenameReport: (reportId: string, newName: string) => void;
  focusLineId: string | null;
  onQtyFocused: () => void;
}) {
  const isLocked = report.status === "Bekräftad";
  const [expanded, setExpanded] = useState(!isLocked);
  const [editing, setEditing] = useState(false);
  const displayName = report.display_name || report.report_name;
  const [editName, setEditName] = useState(displayName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && nameInputRef.current) { nameInputRef.current.focus(); nameInputRef.current.select(); }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== displayName) onRenameReport(report.id, trimmed);
    else setEditName(displayName);
    setEditing(false);
  };

  const sectionTotal = lines.reduce((s, l) => s + l.quantity, 0);

  return (
    <div className="border-b last:border-b-0">
      <div
        className={`group w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors cursor-pointer ${isLocked ? "bg-muted/40 hover:bg-muted/60" : "bg-muted/20 hover:bg-muted/40"}`}
        onClick={() => !editing && setExpanded(!expanded)}
      >
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        {isLocked ? <Lock className="h-3.5 w-3.5 shrink-0 text-primary" /> : <Factory className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {editing ? (
          <Input
            ref={nameInputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditName(displayName); setEditing(false); } }}
            onClick={(e) => e.stopPropagation()}
            className="h-7 text-sm font-medium flex-1 px-1.5"
          />
        ) : (
          <span className="font-medium text-sm truncate flex-1" onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}>
            {displayName}
          </span>
        )}
        {!editing && (
          <button onClick={(e) => { e.stopPropagation(); setEditing(true); }} className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-foreground text-muted-foreground">
            <Pencil className="h-3 w-3" />
          </button>
        )}
        <span className="text-xs text-muted-foreground shrink-0">
          {lines.length} rader · {sectionTotal.toLocaleString("sv-SE")} total
        </span>
        {isLocked ? (
          <Badge className="text-[10px] shrink-0 bg-primary/10 text-primary border-primary/20" variant="outline">
            <CheckCircle2 className="h-3 w-3 mr-0.5" /> Bekräftad
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] shrink-0">Aktiv</Badge>
        )}
      </div>

      {expanded && (
        <div>
          <Table>
            <TableHeader>
              <TableRow className="h-7">
                <TableHead className="py-0.5 px-1.5 text-[11px] min-w-[160px]">Produkt</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] text-right w-[60px]">Antal</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[42px]">Enhet</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[62px]">Status</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[86px]">Datum</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[80px]">Operatör</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[100px]">Anteckning</TableHead>
                <TableHead className="py-0.5 px-0 w-6"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <EditableRow
                  key={l.id}
                  line={l}
                  onSave={(updates) => onUpdateLine(l.id, updates)}
                  onDelete={() => onDeleteLine(l.id)}
                  products={products}
                  autoFocusQty={focusLineId === l.id}
                  onQtyFocused={onQtyFocused}
                  locked={isLocked}
                />
              ))}
            </TableBody>
          </Table>

          {!isLocked && lines.length > 0 && (
            <div className="flex items-center justify-end px-3 py-2 border-t bg-muted/10">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="h-8">
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                    Bekräfta produktion
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Bekräfta produktion</AlertDialogTitle>
                    <AlertDialogDescription>
                      Du är på väg att låsa <strong>{displayName}</strong> med {lines.length} rader
                      och totalt <strong>{sectionTotal.toLocaleString("sv-SE")}</strong> enheter.
                      <br /><br />
                      När produktionen är bekräftad kan raderna inte längre redigeras.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Avbryt</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onConfirm(report.id)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Bekräfta
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProductionReporting() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIdx, setSearchIdx] = useState(0);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const [newProductOpen, setNewProductOpen] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: "", sku: "", category: "Fisk", unit: "kg", cost_price: "", wholesale_price: "" });

  const { data: products = [] } = useProducts();

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["production-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_reports")
        .select("*")
        .is("archived_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProdReport[];
    },
  });

  const { data: allLines = [] } = useQuery({
    queryKey: ["production-report-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_report_lines")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ProdReportLine[];
    },
  });

  const productCategoryMap = new Map(products.map((p: any) => [p.id, p.category]));
  const uniqueCategories = [...new Set(allLines.map((l) => l.product_id ? productCategoryMap.get(l.product_id) : null).filter(Boolean))].sort() as string[];

  const filteredLines = allLines.filter((l) => {
    if (filterCategory !== "all") {
      const cat = l.product_id ? productCategoryMap.get(l.product_id) : null;
      if (cat !== filterCategory) return false;
    }
    return true;
  });

  const groupedByReport = new Map<string, ProdReportLine[]>();
  for (const line of filteredLines) {
    const existing = groupedByReport.get(line.report_id) || [];
    existing.push(line);
    groupedByReport.set(line.report_id, existing);
  }

  const activeReports = reports.filter((r) => r.status !== "Bekräftad" && groupedByReport.has(r.id));
  const confirmedReports = reports.filter((r) => r.status === "Bekräftad" && groupedByReport.has(r.id));
  // Also show active reports with no lines yet
  const emptyActiveReports = reports.filter((r) => r.status !== "Bekräftad" && !groupedByReport.has(r.id));

  const deleteLine = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("production_report_lines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["production-report-lines"] }),
  });

  const updateLine = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ProdReportLine> & { id: string }) => {
      const { error } = await supabase.from("production_report_lines").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["production-report-lines"] }),
  });

  const renameReport = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("production_reports").update({ display_name: name }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-reports"] });
      toast({ title: "Namn uppdaterat" });
    },
  });

  const confirmReport = useMutation({
    mutationFn: async (reportId: string) => {
      const lines = allLines.filter((l) => l.report_id === reportId);
      const total = lines.reduce((s, l) => s + l.quantity, 0);

      // Find Grossist Flytande location
      const { data: flytandeLoc } = await supabase
        .from("storage_locations")
        .select("id")
        .eq("name", "Grossist Flytande")
        .maybeSingle();

      if (!flytandeLoc) throw new Error("Kunde inte hitta lagerstället 'Grossist Flytande'");

      // Transfer each produced line to Grossist Flytande
      for (const line of lines) {
        if (!line.product_id || line.quantity <= 0) continue;

        // Check if product already exists at Grossist Flytande
        const { data: existing } = await supabase
          .from("product_stock_locations")
          .select("id, quantity, unit_cost")
          .eq("product_id", line.product_id)
          .eq("location_id", flytandeLoc.id)
          .maybeSingle();

        // Get product cost_price for unit_cost
        const product = products.find((p: any) => p.id === line.product_id);
        const unitCost = Number(product?.cost_price) || 0;

        if (existing) {
          const oldTotal = Number(existing.quantity) * (Number(existing.unit_cost) || 0);
          const newTotal = line.quantity * unitCost;
          const combinedQty = Number(existing.quantity) + line.quantity;
          const avgCost = combinedQty > 0 ? (oldTotal + newTotal) / combinedQty : 0;
          await supabase.from("product_stock_locations")
            .update({ quantity: combinedQty, unit_cost: avgCost, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase.from("product_stock_locations")
            .insert({ product_id: line.product_id, location_id: flytandeLoc.id, quantity: line.quantity, unit_cost: unitCost });
        }
      }

      // Auto-update order line statuses to "Behandlas"
      const confirmedProductIds = lines.map((l) => l.product_id!).filter(Boolean);
      await markOrderLinesBehandlas(confirmedProductIds);

      // Lock the report
      const { error } = await supabase
        .from("production_reports")
        .update({ status: "Bekräftad", total_quantity: total })
        .eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-reports"] });
      queryClient.invalidateQueries({ queryKey: ["product_stock_locations"] });
      queryClient.invalidateQueries({ queryKey: ["all_stock_locations"] });
      queryClient.invalidateQueries({ queryKey: ["shop_orders"] });
      toast({ title: "Produktion bekräftad", description: "Producerade varor har lagts till i Grossist Flytande." });
    },
  });

  const addLineFromProduct = useMutation({
    mutationFn: async (product: any) => {
      let reportId = activeReportId;
      // Find or create an active report
      if (!reportId) {
        const existingActive = reports.find((r) => r.status === "Aktiv");
        if (existingActive) {
          reportId = existingActive.id;
        } else {
          const { data: newReport, error } = await supabase
            .from("production_reports")
            .insert({ report_name: `Produktion ${format(new Date(), "yyyy-MM-dd")}` })
            .select()
            .single();
          if (error) throw error;
          reportId = newReport.id;
        }
        setActiveReportId(reportId);
      }
      const { data: newLine, error } = await supabase.from("production_report_lines").insert({
        report_id: reportId,
        product_name: product.name,
        product_id: product.id,
        quantity: 0,
        unit: product.unit || "kg",
        status: "Producerad",
        production_date: format(new Date(), "yyyy-MM-dd"),
      }).select("id").single();
      if (error) throw error;
      return newLine.id;
    },
    onSuccess: (newLineId, product) => {
      queryClient.invalidateQueries({ queryKey: ["production-reports"] });
      queryClient.invalidateQueries({ queryKey: ["production-report-lines"] });
      setSearchQuery("");
      setSearchOpen(false);
      setFocusLineId(newLineId);
      toast({ title: `${product.name} tillagd` });
    },
  });

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
        } as any)
        .select()
        .single();
      if (pErr) throw pErr;
      // Add as line
      await addLineFromProduct.mutateAsync(created);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      setNewProductOpen(false);
      setNewProduct({ name: "", sku: "", category: "Fisk", unit: "kg", cost_price: "", wholesale_price: "" });
      toast({ title: "Ny produkt skapad och tillagd" });
    },
  });

  const grandTotal = allLines.reduce((s, l) => s + l.quantity, 0);
  const searchedProducts = products.filter((p) => searchQuery.length > 0 && p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between p-4 border-b">
        <div>
          <h1 className="text-xl font-bold">Produktionsrapportering</h1>
          <p className="text-muted-foreground text-xs">
            Totalt: <span className="font-semibold text-foreground">{grandTotal.toLocaleString("sv-SE")} enheter</span>
            {" · "}{allLines.length} rader
            {" · "}{confirmedReports.length} bekräftade
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSearchIdx(0); setSearchOpen(e.target.value.length > 0); }}
            onFocus={() => { if (searchQuery.length > 0) setSearchOpen(true); }}
            onBlur={() => { setTimeout(() => setSearchOpen(false), 200); }}
            onKeyDown={(e) => {
              const items = searchedProducts.slice(0, 20);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                if (!searchOpen && items.length > 0) setSearchOpen(true);
                setSearchIdx((i) => Math.min(i + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSearchIdx((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && searchQuery.length > 0 && items.length > 0) {
                e.preventDefault();
                const item = items[Math.min(searchIdx, items.length - 1)];
                if (item) addLineFromProduct.mutate(item);
              } else if (e.key === "Escape") {
                setSearchOpen(false);
              }
            }}
            placeholder="Sök och lägg till producerad produkt..."
            className="pl-9 h-9 text-sm"
          />
          {searchOpen && searchQuery.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-md">
              <div className="max-h-[300px] overflow-y-auto py-1">
                {searchedProducts.length === 0 ? (
                  <div className="py-3 text-center">
                    <p className="text-sm text-muted-foreground mb-2">Ingen produkt hittad för "{searchQuery}"</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setSearchOpen(false);
                        setNewProduct((p) => ({ ...p, name: searchQuery }));
                        setNewProductOpen(true);
                        setSearchQuery("");
                      }}
                    >
                      <PackagePlus className="h-4 w-4 mr-1" /> Skapa ny produkt
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Produkter i systemet</p>
                    {searchedProducts.slice(0, 20).map((p, i) => (
                      <div
                        key={p.id}
                        data-search-idx={i}
                        className={`px-2 py-1.5 mx-1 rounded-sm cursor-pointer flex items-center justify-between ${i === searchIdx ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                        onMouseEnter={() => setSearchIdx(i)}
                        onMouseDown={(e) => { e.preventDefault(); addLineFromProduct.mutate(p); }}
                      >
                        <div className="flex flex-col flex-1">
                          <span className="text-sm font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground">{p.sku} · {p.category} · {p.unit}</span>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <Dialog open={newProductOpen} onOpenChange={setNewProductOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="shrink-0">
              <PackagePlus className="h-4 w-4 mr-1" /> Ny produkt
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Skapa ny produkt</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div><Label>Produktnamn *</Label><Input value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>SKU</Label><Input value={newProduct.sku} onChange={(e) => setNewProduct((p) => ({ ...p, sku: e.target.value }))} placeholder="AUTO" /></div>
                <div><Label>Kategori</Label><Input value={newProduct.category} onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))} /></div>
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
                <div><Label>Inköpspris</Label><Input type="number" value={newProduct.cost_price} onChange={(e) => setNewProduct((p) => ({ ...p, cost_price: e.target.value }))} /></div>
                <div><Label>Grossistpris</Label><Input type="number" value={newProduct.wholesale_price} onChange={(e) => setNewProduct((p) => ({ ...p, wholesale_price: e.target.value }))} /></div>
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

      {/* Filter row */}
      {allLines.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b">
          <span className="text-xs text-muted-foreground shrink-0">Filtrera:</span>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="Kategori" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla kategorier</SelectItem>
              {uniqueCategories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
          {filterCategory !== "all" && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterCategory("all")}>Rensa filter</Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filteredLines.length} av {allLines.length} rader</span>
        </div>
      )}

      <ScrollArea className="flex-1">
        {allLines.length === 0 && emptyActiveReports.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-16">
            Inga produkter ännu. Sök efter produkter ovan för att börja rapportera produktion.
          </p>
        ) : (
          <div>
            {[...activeReports, ...emptyActiveReports].map((report) => (
              <ReportSection
                key={report.id}
                report={report}
                lines={groupedByReport.get(report.id) || []}
                products={products}
                onUpdateLine={(id, updates) => updateLine.mutate({ id, ...updates } as any)}
                onDeleteLine={(id) => deleteLine.mutate(id)}
                onConfirm={(reportId) => confirmReport.mutate(reportId)}
                onRenameReport={(id, name) => renameReport.mutate({ id, name })}
                focusLineId={focusLineId}
                onQtyFocused={() => setFocusLineId(null)}
              />
            ))}

            {confirmedReports.length > 0 && activeReports.length > 0 && (
              <div className="px-3 py-1.5 bg-muted/30 border-y">
                <span className="text-xs font-medium text-muted-foreground">Bekräftad produktion</span>
              </div>
            )}
            {confirmedReports.map((report) => (
              <ReportSection
                key={report.id}
                report={report}
                lines={groupedByReport.get(report.id) || []}
                products={products}
                onUpdateLine={(id, updates) => updateLine.mutate({ id, ...updates } as any)}
                onDeleteLine={(id) => deleteLine.mutate(id)}
                onConfirm={(reportId) => confirmReport.mutate(reportId)}
                onRenameReport={(id, name) => renameReport.mutate({ id, name })}
                focusLineId={focusLineId}
                onQtyFocused={() => setFocusLineId(null)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
