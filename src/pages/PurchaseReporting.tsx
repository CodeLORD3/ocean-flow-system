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
import { Upload, Loader2, Trash2, Plus, ZoomIn, ZoomOut, RotateCcw, FileText, Search, PackagePlus, Lock, ChevronDown, ChevronUp, CheckCircle2, Pencil } from "lucide-react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProducts } from "@/hooks/useProducts";
import { useSuppliers } from "@/hooks/useSuppliers";

// Magnifying glass overlay for document viewer
function DocumentMagnifier({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0, visible: false, w: 0 });
  const LENS_SIZE = 180;
  const MAGNIFY = 2.5;

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true, w: rect.width });
  };

  return (
    <div
      ref={containerRef}
      className="relative cursor-none"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setPos((p) => ({ ...p, visible: false }))}
    >
      {children}
      {pos.visible && (
        <div
          className="pointer-events-none absolute border-2 border-foreground/20 rounded-full shadow-lg z-50 overflow-hidden"
          style={{
            width: LENS_SIZE,
            height: LENS_SIZE,
            left: pos.x - LENS_SIZE / 2,
            top: pos.y - LENS_SIZE / 2,
          }}
        >
          <div
            style={{
              position: "absolute",
              width: pos.w,
              left: -(pos.x * MAGNIFY - LENS_SIZE / 2),
              top: -(pos.y * MAGNIFY - LENS_SIZE / 2),
              transform: `scale(${MAGNIFY})`,
              transformOrigin: "0 0",
              pointerEvents: "none",
            }}
          >
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

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
  display_name: string | null;
};

// Inline always-editable row
function EditableRow({
  line,
  onSave,
  onDelete,
  products,
  suppliers,
  reports,
  onViewDocument,
  autoFocusQty,
  onQtyFocused,
  locked,
}: {
  line: ReportLine;
  onSave: (updated: Partial<ReportLine>) => void;
  onDelete: () => void;
  products: any[];
  suppliers: any[];
  reports: Report[];
  onViewDocument?: (reportId: string) => void;
  autoFocusQty?: boolean;
  onQtyFocused?: () => void;
  locked?: boolean;
}) {
  const [productSearch, setProductSearch] = useState("");
  const [productOpen, setProductOpen] = useState(false);
  const [productIdx, setProductIdx] = useState(0);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [supplierIdx, setSupplierIdx] = useState(0);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  const productInputRef = useRef<HTMLInputElement>(null);
  const supplierInputRef = useRef<HTMLInputElement>(null);
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
    const updates: any = { [field]: value };
    if (field === "quantity" || field === "unit_price") {
      const qty = field === "quantity" ? (parseFloat(value) || 0) : line.quantity;
      const price = field === "unit_price" ? (parseFloat(value) || 0) : (line.unit_price ?? 0);
      updates.line_total = qty * price;
    }
    clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => onSave(updates), 400);
  };

  const filteredProducts = products.filter((p: any) =>
    productSearch.length > 0 && p.name.toLowerCase().includes(productSearch.toLowerCase())
  ).slice(0, 12);

  const filteredSuppliers = suppliers
    .filter((s: any) => supplierSearch.length > 0 && s.name.toLowerCase().includes(supplierSearch.toLowerCase()))
    .slice(0, 10);

  const selectProduct = (p: any) => {
    if (locked) return;
    onSave({
      product_name: p.name,
      product_id: p.id,
      unit: p.unit || line.unit,
      unit_price: p.cost_price || line.unit_price,
      supplier_name: p.suppliers?.name || line.supplier_name,
      line_total: line.quantity * (p.cost_price || line.unit_price || 0),
    });
    setProductOpen(false);
    setProductSearch("");
    if (productInputRef.current) productInputRef.current.value = p.name;
  };

  const selectSupplier = (s: any) => {
    if (locked) return;
    onSave({ supplier_name: s.name });
    setSupplierOpen(false);
    setSupplierSearch("");
    if (supplierInputRef.current) supplierInputRef.current.value = s.name;
  };

  const handleProductKeyDown = (e: React.KeyboardEvent) => {
    if (!productOpen || filteredProducts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setProductIdx((i) => Math.min(i + 1, filteredProducts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setProductIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectProduct(filteredProducts[productIdx]);
    }
  };

  const handleSupplierKeyDown = (e: React.KeyboardEvent) => {
    if (!supplierOpen || filteredSuppliers.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSupplierIdx((i) => Math.min(i + 1, filteredSuppliers.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSupplierIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      selectSupplier(filteredSuppliers[supplierIdx]);
    }
  };

  if (locked) {
    return (
      <TableRow className="h-8 opacity-75">
        <TableCell className="py-0.5 px-1.5 text-[11px] min-w-[140px]">{line.product_name}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] text-right w-[50px]">{line.quantity}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[42px]">{line.unit || "kg"}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] text-right w-[58px]">{(line.unit_price ?? 0).toLocaleString("sv-SE")}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[88px] truncate">{line.supplier_name || "—"}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[62px]">{line.status}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[86px]">{line.purchase_date || "—"}</TableCell>
        <TableCell className="py-0.5 px-1 text-[11px] w-[90px]">—</TableCell>
        <TableCell className="py-0.5 px-0 w-6"></TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className="h-8 group/row">
      <TableCell className="py-0.5 px-1.5 min-w-[140px]">
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
                onFocus={(e) => {
                  e.target.select();
                  setProductSearch(e.target.value);
                  if (e.target.value.length > 0) setProductOpen(true);
                }}
                onKeyDown={handleProductKeyDown}
                className="h-6 text-[11px] border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 min-w-[120px]"
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
      <TableCell className="py-0.5 px-1 w-[50px]">
        <Input
          ref={qtyInputRef}
          type="number"
          defaultValue={line.quantity}
          onFocus={(e) => e.target.select()}
          onChange={(e) => commitField("quantity", parseFloat(e.target.value) || 0)}
          className="h-6 text-[11px] w-12 border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 text-right"
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
      <TableCell className="py-0.5 px-1 w-[58px]">
        <Input
          type="number"
          defaultValue={line.unit_price ?? 0}
          onFocus={(e) => e.target.select()}
          onChange={(e) => commitField("unit_price", parseFloat(e.target.value) || 0)}
          className="h-6 text-[11px] w-14 border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 text-right"
        />
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[88px]">
        <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Input
                ref={supplierInputRef}
                defaultValue={line.supplier_name || ""}
                onChange={(e) => {
                  setSupplierSearch(e.target.value);
                  setSupplierIdx(0);
                  if (e.target.value.length > 0 && !supplierOpen) setSupplierOpen(true);
                  if (e.target.value.length === 0) setSupplierOpen(false);
                  commitField("supplier_name", e.target.value || null);
                }}
                onFocus={(e) => {
                  e.target.select();
                  setSupplierSearch(e.target.value);
                  if (e.target.value.length > 0) setSupplierOpen(true);
                }}
                onKeyDown={handleSupplierKeyDown}
                className="h-6 text-[11px] border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 w-20"
                placeholder="Sök leverantör..."
              />
            </div>
          </PopoverTrigger>
          {supplierSearch.length > 0 && filteredSuppliers.length > 0 && (
            <PopoverContent className="p-0 w-[220px]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
              <div className="max-h-[200px] overflow-y-auto py-1">
                {filteredSuppliers.map((s: any, i: number) => (
                  <div
                    key={s.id}
                    className={`px-2 py-1.5 text-xs cursor-pointer rounded-sm mx-1 ${i === supplierIdx ? "bg-accent text-accent-foreground" : "hover:bg-muted"}`}
                    onMouseEnter={() => setSupplierIdx(i)}
                    onMouseDown={(e) => { e.preventDefault(); selectSupplier(s); }}
                  >
                    <div className="font-medium">{s.name}</div>
                    {s.supplier_type && (
                      <div className="text-[10px] text-muted-foreground">{s.supplier_type}</div>
                    )}
                  </div>
                ))}
              </div>
            </PopoverContent>
          )}
        </Popover>
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[62px]">
        <Select defaultValue={line.status} onValueChange={(v) => onSave({ status: v })}>
          <SelectTrigger className="h-6 w-[58px] text-[11px] border-transparent bg-transparent hover:border-input"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Beställd">Beställd</SelectItem>
            <SelectItem value="Inköpt">Inköpt</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[86px]">
        <Input
          type="date"
          defaultValue={line.purchase_date || ""}
          onChange={(e) => commitField("purchase_date", e.target.value || null)}
          className="h-6 text-[11px] border-transparent bg-transparent hover:border-input focus:border-input transition-colors px-1 w-[78px]"
        />
      </TableCell>
      <TableCell className="py-0.5 px-1 w-[90px]">
        <div className="flex items-center gap-0.5">
          <Select defaultValue={line.report_id} onValueChange={(v) => onSave({ report_id: v })}>
            <SelectTrigger className="h-6 w-[72px] text-[11px] border-transparent bg-transparent hover:border-input">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {reports.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  <span className="truncate">{r.file_name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {line.report_id && onViewDocument && (
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onViewDocument(line.report_id)} title="Visa dokument">
              <FileText className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
        </div>
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
  suppliers,
  reports,
  onUpdateLine,
  onDeleteLine,
  onViewDocument,
  onConfirm,
  onRenameReport,
  focusLineId,
  onQtyFocused,
}: {
  report: Report;
  lines: ReportLine[];
  products: any[];
  suppliers: any[];
  reports: Report[];
  onUpdateLine: (id: string, updates: Partial<ReportLine>) => void;
  onDeleteLine: (id: string) => void;
  onViewDocument: (reportId: string) => void;
  onConfirm: (reportId: string) => void;
  onRenameReport: (reportId: string, newName: string) => void;
  focusLineId: string | null;
  onQtyFocused: () => void;
}) {
  const isLocked = report.status === "Godkänd";
  const [expanded, setExpanded] = useState(!isLocked);
  const [editing, setEditing] = useState(false);
  const displayName = report.display_name || report.file_name;
  const [editName, setEditName] = useState(displayName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== displayName) {
      onRenameReport(report.id, trimmed);
    } else {
      setEditName(displayName);
    }
    setEditing(false);
  };

  const sectionTotal = lines.reduce((s, l) => s + (l.line_total ?? 0), 0);

  return (
    <div className="border-b last:border-b-0">
      {/* Section header */}
      <div
        className={`group w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors cursor-pointer ${
          isLocked ? "bg-muted/40 hover:bg-muted/60" : "bg-muted/20 hover:bg-muted/40"
        }`}
        onClick={() => !editing && setExpanded(!expanded)}
      >
        {expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        {isLocked ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        {editing ? (
          <Input
            ref={nameInputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setEditName(displayName); setEditing(false); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-7 text-sm font-medium flex-1 px-1.5"
          />
        ) : (
          <span
            className="font-medium text-sm truncate flex-1"
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
          >
            {displayName}
          </span>
        )}
        {!editing && (
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-foreground text-muted-foreground"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
        <span className="text-xs text-muted-foreground shrink-0">
          {lines.length} rader · {sectionTotal.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr
        </span>
        {isLocked ? (
          <Badge className="text-[10px] shrink-0 bg-primary/10 text-primary border-primary/20" variant="outline">
            <CheckCircle2 className="h-3 w-3 mr-0.5" /> Bekräftad
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] shrink-0">Ej bekräftad</Badge>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div>
          <Table>
            <TableHeader>
              <TableRow className="h-7">
                <TableHead className="py-0.5 px-1.5 text-[11px] min-w-[140px]">Produkt</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] text-right w-[50px]">Antal</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[42px]">Enhet</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] text-right w-[58px]">Pris</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[88px]">Leverantör</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[62px]">Status</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[86px]">Datum</TableHead>
                <TableHead className="py-0.5 px-1 text-[11px] w-[90px]">Dokument</TableHead>
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
                  suppliers={suppliers}
                  reports={reports}
                  onViewDocument={onViewDocument}
                  autoFocusQty={focusLineId === l.id}
                  onQtyFocused={onQtyFocused}
                  locked={isLocked}
                />
              ))}
            </TableBody>
          </Table>

          {/* Confirm button for unlocked sections */}
          {!isLocked && lines.length > 0 && (
            <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/10">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onViewDocument(report.id)}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> Visa dokument
                </Button>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="h-8">
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                    Bekräfta inköp
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Bekräfta inköp</AlertDialogTitle>
                    <AlertDialogDescription>
                      Du är på väg att låsa <strong>{displayName}</strong> med {lines.length} rader
                      och ett totalt värde på{" "}
                      <strong>{sectionTotal.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr</strong>.
                      <br /><br />
                      När inköpet är bekräftat kan raderna inte längre redigeras. Dokumentet och listan kommer att vikas ihop.
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

export default function PurchaseReporting() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [docExpanded, setDocExpanded] = useState(true);
  const [zoom, setZoom] = useState(1);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchIdx, setSearchIdx] = useState(0);
  const [focusLineId, setFocusLineId] = useState<string | null>(null);
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");

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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ReportLine[];
    },
  });

  const selectedReport = reports.find((r) => r.id === selectedReportId) ?? null;

  // Build lookup: product_id -> category
  const productCategoryMap = new Map(products.map((p: any) => [p.id, p.category]));

  // Unique suppliers & categories from lines
  const uniqueSuppliers = [...new Set(allLines.map((l) => l.supplier_name).filter(Boolean))].sort() as string[];
  const uniqueCategories = [...new Set(
    allLines.map((l) => l.product_id ? productCategoryMap.get(l.product_id) : null).filter(Boolean)
  )].sort() as string[];

  // Filtered lines
  const filteredLines = allLines.filter((l) => {
    if (filterSupplier !== "all" && l.supplier_name !== filterSupplier) return false;
    if (filterCategory !== "all") {
      const cat = l.product_id ? productCategoryMap.get(l.product_id) : null;
      if (cat !== filterCategory) return false;
    }
    return true;
  });

  // Group filtered lines by report_id
  const groupedByReport = new Map<string, ReportLine[]>();
  for (const line of filteredLines) {
    const existing = groupedByReport.get(line.report_id) || [];
    existing.push(line);
    groupedByReport.set(line.report_id, existing);
  }

  // Order: unlocked reports first, then locked, each sub-sorted by created_at desc
  const unlockedReports = reports.filter((r) => r.status !== "Godkänd" && groupedByReport.has(r.id));
  const lockedReports = reports.filter((r) => r.status === "Godkänd" && groupedByReport.has(r.id));

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
      toast({ title: "Rad uppdaterad" });
    },
  });

  const renameReport = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from("purchase_reports").update({ display_name: name } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });
      toast({ title: "Namn uppdaterat" });
    },
  });

  const GROSSIST_FLYTANDE_ID = "5da57ad6-f72c-4a84-9873-87174d194e10";

  const confirmReport = useMutation({
    mutationFn: async (reportId: string) => {
      const lines = allLines.filter((l) => l.report_id === reportId);
      const total = lines.reduce((s, l) => s + (l.line_total ?? 0), 0);
      const { error } = await supabase
        .from("purchase_reports")
        .update({ status: "Godkänd", total_amount: total })
        .eq("id", reportId);
      if (error) throw error;

      // Transfer confirmed lines to Grossist Flytande storage
      const productLines = lines.filter((l) => l.product_id);
      for (const line of productLines) {
        // Check if there's already stock for this product at Grossist Flytande
        const { data: existing } = await supabase
          .from("product_stock_locations")
          .select("id, quantity")
          .eq("product_id", line.product_id!)
          .eq("location_id", GROSSIST_FLYTANDE_ID)
          .maybeSingle();

        if (existing) {
          // Weighted average unit cost
          const oldTotal = Number(existing.quantity) * Number(existing.unit_cost || 0);
          const newTotal = Number(line.quantity) * Number(line.unit_price || 0);
          const combinedQty = Number(existing.quantity) + Number(line.quantity);
          const avgCost = combinedQty > 0 ? (oldTotal + newTotal) / combinedQty : 0;
          await supabase
            .from("product_stock_locations")
            .update({ quantity: combinedQty, unit_cost: avgCost, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("product_stock_locations")
            .insert({ product_id: line.product_id!, location_id: GROSSIST_FLYTANDE_ID, quantity: Number(line.quantity), unit_cost: Number(line.unit_price || 0) });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });
      queryClient.invalidateQueries({ queryKey: ["product_stock_locations"] });
      queryClient.invalidateQueries({ queryKey: ["all_stock_locations"] });
      setSelectedReportId(null);
      toast({ title: "Inköp bekräftat", description: "Dokumentet har låsts och varor har lagts till i Grossist Flytande." });
    },
  });

  // Add line from search (existing product)
  const addLineFromProduct = useMutation({
    mutationFn: async (product: any) => {
      let reportId = selectedReportId;
      if (!reportId) {
        const { data: newReport, error: rErr } = await supabase
          .from("purchase_reports")
          .insert({ file_name: `Manuell rapport ${format(new Date(), "yyyy-MM-dd")}`, file_url: "", status: "Klar" })
          .select()
          .single();
        if (rErr) throw rErr;
        reportId = newReport.id;
        setSelectedReportId(reportId);
      }
      const { data: newLine, error } = await supabase.from("purchase_report_lines").insert({
        report_id: reportId,
        product_name: product.name,
        product_id: product.id,
        quantity: 0,
        unit: product.unit || "kg",
        unit_price: product.cost_price || 0,
        line_total: 0,
        supplier_name: product.suppliers?.name || null,
        status: "Inköpt",
        purchase_date: format(new Date(), "yyyy-MM-dd"),
      }).select("id").single();
      if (error) throw error;
      return newLine.id;
    },
    onSuccess: (newLineId, product) => {
      queryClient.invalidateQueries({ queryKey: ["purchase-reports"] });
      queryClient.invalidateQueries({ queryKey: ["purchase-report-lines"] });
      setSearchQuery("");
      setSearchOpen(false);
      setFocusLineId(newLineId);
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
        <ResizablePanel defaultSize={70} minSize={35}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h1 className="text-xl font-bold">Inköpsrapportering</h1>
                <p className="text-muted-foreground text-xs">
                  Totalt: <span className="font-semibold text-foreground">{grandTotal.toLocaleString("sv-SE", { minimumFractionDigits: 2 })} kr</span>
                  {" · "}{allLines.length} rader
                  {" · "}{lockedReports.length} bekräftade
                </p>
              </div>
            </div>

            {/* Search bar to add existing products + new product button */}
            <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSearchIdx(0);
                    setSearchOpen(e.target.value.length > 0);
                  }}
                  onFocus={() => { if (searchQuery.length > 0) setSearchOpen(true); }}
                  onBlur={() => { setTimeout(() => setSearchOpen(false), 200); }}
                  onKeyDown={(e) => {
                    const items = searchedProducts.slice(0, 20);
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      if (!searchOpen && items.length > 0) setSearchOpen(true);
                      setSearchIdx((i) => {
                        const next = Math.min(i + 1, items.length - 1);
                        setTimeout(() => document.querySelector(`[data-search-idx="${next}"]`)?.scrollIntoView({ block: "nearest" }), 0);
                        return next;
                      });
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setSearchIdx((i) => {
                        const next = Math.max(i - 1, 0);
                        setTimeout(() => document.querySelector(`[data-search-idx="${next}"]`)?.scrollIntoView({ block: "nearest" }), 0);
                        return next;
                      });
                    } else if (e.key === "Enter" && searchQuery.length > 0 && items.length > 0) {
                      e.preventDefault();
                      const item = items[Math.min(searchIdx, items.length - 1)];
                      if (item) addLineFromProduct.mutate(item);
                    } else if (e.key === "Escape") {
                      setSearchOpen(false);
                    }
                  }}
                  placeholder="Sök och lägg till produkt från produktlistan..."
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
                                <span className="text-xs text-muted-foreground">
                                  {p.sku} · {p.category} · {p.cost_price?.toLocaleString("sv-SE")} kr/{p.unit}
                                  {p.suppliers?.name ? ` · ${p.suppliers.name}` : ""}
                                </span>
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

            {/* Sort/filter row */}
            {allLines.length > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 border-b">
                <span className="text-xs text-muted-foreground shrink-0">Filtrera:</span>
                <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                  <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="Leverantör" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla leverantörer</SelectItem>
                    {uniqueSuppliers.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="Kategori" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alla kategorier</SelectItem>
                    {uniqueCategories.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(filterSupplier !== "all" || filterCategory !== "all") && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setFilterSupplier("all"); setFilterCategory("all"); }}>
                    Rensa filter
                  </Button>
                )}
                <span className="text-xs text-muted-foreground ml-auto">{filteredLines.length} av {allLines.length} rader</span>
              </div>
            )}

            <ScrollArea className="flex-1">
              {allLines.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-16">
                  Inga produkter ännu. Ladda upp en följesedel till höger eller sök efter produkter ovan.
                </p>
              ) : (
                <div>
                  {/* Unlocked reports first */}
                  {unlockedReports.map((report) => (
                    <ReportSection
                      key={report.id}
                      report={report}
                      lines={groupedByReport.get(report.id) || []}
                      products={products}
                      suppliers={suppliers}
                      reports={reports}
                      onUpdateLine={(id, updates) => updateLine.mutate({ id, ...updates } as any)}
                      onDeleteLine={(id) => deleteLine.mutate(id)}
                      onViewDocument={(reportId) => { setSelectedReportId(reportId); setDocExpanded(true); setZoom(1); }}
                      onConfirm={(reportId) => confirmReport.mutate(reportId)}
                      onRenameReport={(id, name) => renameReport.mutate({ id, name })}
                      focusLineId={focusLineId}
                      onQtyFocused={() => setFocusLineId(null)}
                    />
                  ))}

                  {/* Locked/confirmed reports */}
                  {lockedReports.length > 0 && unlockedReports.length > 0 && (
                    <div className="px-3 py-1.5 bg-muted/30 border-y">
                      <span className="text-xs font-medium text-muted-foreground">Bekräftade inköp</span>
                    </div>
                  )}
                  {lockedReports.map((report) => (
                    <ReportSection
                      key={report.id}
                      report={report}
                      lines={groupedByReport.get(report.id) || []}
                      products={products}
                      suppliers={suppliers}
                      reports={reports}
                      onUpdateLine={(id, updates) => updateLine.mutate({ id, ...updates } as any)}
                      onDeleteLine={(id) => deleteLine.mutate(id)}
                      onViewDocument={(reportId) => { setSelectedReportId(reportId); setDocExpanded(true); setZoom(1); }}
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
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT: Document viewer */}
        <ResizablePanel defaultSize={30} minSize={20}>
          <div className="flex flex-col h-full">
            {/* Upload bar */}
            <div className="flex items-center justify-between p-3 border-b gap-2">
              <span className="text-sm font-medium">Dokument</span>
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

            <ScrollArea className="flex-1">
              {reportsLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : reports.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-16 text-center px-6">
                  <FileText className="h-12 w-12 text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground text-sm">Ladda upp en bild eller PDF av en följesedel för att komma igång</p>
                </div>
              ) : (
                <div>
                  {reports.map((r) => {
                    const isSelected = selectedReportId === r.id;
                    const isExpanded = isSelected && docExpanded;
                    return (
                      <div key={r.id} className="border-b last:border-b-0">
                        {/* Collapsible header */}
                        <div
                          className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-colors ${
                            isExpanded ? "bg-accent/50" : "hover:bg-muted/40"
                          }`}
                          onClick={() => {
                            if (isSelected) {
                              setDocExpanded(!docExpanded);
                            } else {
                              setSelectedReportId(r.id);
                              setDocExpanded(true);
                              setZoom(1);
                            }
                          }}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                          )}
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium text-sm truncate flex-1">{r.file_name}</span>
                          <Badge
                            variant={r.status === "Godkänd" ? "default" : r.status === "Klar" ? "secondary" : "outline"}
                            className={`text-[10px] shrink-0 ${r.status === "Godkänd" ? "bg-primary/10 text-primary border-primary/20" : ""}`}
                          >
                            {r.status === "Godkänd" && <Lock className="h-3 w-3 mr-0.5" />}
                            {r.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={(e) => { e.stopPropagation(); deleteReport.mutate(r.id); }}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>

                        {/* Expanded document viewer */}
                        {isExpanded && (
                          <div className="border-t bg-background">
                            {/* Zoom controls */}
                            <div className="flex items-center justify-center gap-1 py-1.5 border-b bg-muted/20">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.max(0.25, z - 0.25))}>
                                <ZoomOut className="h-3.5 w-3.5" />
                              </Button>
                              <span className="text-xs w-10 text-center text-muted-foreground">{Math.round(zoom * 100)}%</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}>
                                <ZoomIn className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setZoom(1)}>
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="p-4">
                              <DocumentMagnifier>
                                {r.file_url && r.file_name.toLowerCase().endsWith(".pdf") ? (
                                  <PdfViewer url={r.file_url} zoom={zoom} />
                                ) : r.file_url ? (
                                  <div className="flex justify-center">
                                    <img
                                      src={r.file_url}
                                      alt={r.file_name}
                                      className="rounded-md shadow-sm max-w-full"
                                      style={{ transform: `scale(${zoom})`, transformOrigin: "top center" }}
                                      draggable={false}
                                    />
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground text-center py-8">Inget dokument kopplat</p>
                                )}
                              </DocumentMagnifier>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
