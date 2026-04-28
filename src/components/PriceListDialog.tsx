import { useEffect, useMemo, useState } from "react";
import { FileDown, Layers, ShoppingBasket, Search } from "lucide-react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { generatePriceListPdf, type PriceListPdfRow } from "@/lib/priceListPdf";

type AnyProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string | null;
  category: string | null;
  wholesale_price: number;
  parent_product_id: string | null;
};

type ProductWithChildren = AnyProduct & { subproducts?: AnyProduct[] };

interface PurchaseLineToday {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  products: ProductWithChildren[]; // top-level with subproducts attached
  allProducts: AnyProduct[];
}

export default function PriceListDialog({ open, onOpenChange, products, allProducts }: Props) {
  const { toast } = useToast();
  const { data: stores = [] } = useStores(true);
  const shopStores = useMemo(
    () => (stores as any[]).filter((s) => !s.is_wholesale),
    [stores],
  );
  const [todayLines, setTodayLines] = useState<PurchaseLineToday[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);
  const [prices, setPrices] = useState<Record<string, number>>({}); // product_id -> price
  const [included, setIncluded] = useState<Record<string, boolean>>({});
  const [selectedStores, setSelectedStores] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  // Map product id -> product
  const productMap = useMemo(() => {
    const m = new Map<string, AnyProduct>();
    for (const p of allProducts) m.set(p.id, p);
    return m;
  }, [allProducts]);

  // Group siblings by parent (so a purchase row for "Hel torsk" can show all torsk variants)
  const siblingsByParent = useMemo(() => {
    const m = new Map<string, AnyProduct[]>();
    for (const p of products) {
      const family = [p, ...(p.subproducts || [])];
      m.set(p.id, family);
    }
    return m;
  }, [products]);

  // Resolve the "family" for a given product id (returns parent's family)
  const familyFor = (productId: string | null): AnyProduct[] => {
    if (!productId) return [];
    const p = productMap.get(productId);
    if (!p) return [];
    const parentId = p.parent_product_id || p.id;
    return siblingsByParent.get(parentId) || [p];
  };

  // Load today's purchase report lines when opened
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingLines(true);
      const today = format(new Date(), "yyyy-MM-dd");
      // Reports created today (or with report_date today)
      const { data: reports } = await supabase
        .from("purchase_reports")
        .select("id, report_date, created_at")
        .or(`report_date.eq.${today},created_at.gte.${today}T00:00:00`);
      const reportIds = (reports || []).map((r: any) => r.id);
      let lines: PurchaseLineToday[] = [];
      if (reportIds.length) {
        const { data } = await supabase
          .from("purchase_report_lines")
          .select("id, product_id, product_name, quantity, unit, unit_price")
          .in("report_id", reportIds);
        lines = (data || []) as any;
      }
      if (cancelled) return;
      setTodayLines(lines);

      // Initialise prices from current wholesale_price
      const initPrices: Record<string, number> = {};
      const initInc: Record<string, boolean> = {};
      for (const p of allProducts) {
        initPrices[p.id] = Number(p.wholesale_price) || 0;
      }
      // Auto-include products from today's purchases
      for (const l of lines) {
        const fam = familyFor(l.product_id);
        for (const f of fam) initInc[f.id] = true;
      }
      setPrices(initPrices);
      setIncluded(initInc);
      setLoadingLines(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Build the set of product ids that appear in today's purchases (their families)
  const todayFamilyIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of todayLines) {
      const fam = familyFor(l.product_id);
      for (const f of fam) s.add(f.id);
    }
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayLines, productMap, siblingsByParent]);

  // Other products = all products NOT in today families
  const otherProducts = useMemo(() => {
    const list: AnyProduct[] = [];
    for (const p of products) {
      const family = [p, ...(p.subproducts || [])];
      for (const f of family) {
        if (!todayFamilyIds.has(f.id)) list.push(f);
      }
    }
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q),
    );
  }, [products, todayFamilyIds, search]);

  const setPrice = (id: string, v: number) => setPrices((prev) => ({ ...prev, [id]: v }));
  const toggleInc = (id: string, v: boolean) => setIncluded((prev) => ({ ...prev, [id]: v }));

  const includedCount = Object.values(included).filter(Boolean).length;

  const generatePdfForStore = (storeName: string | null, rows: { name: string; sku: string; unit: string; price: number; category: string }[], dateStr: string) => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Prislista", 40, 50);
    if (storeName) {
      doc.setFontSize(13);
      doc.setTextColor(60);
      doc.text(storeName, 40, 70);
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    const subY = storeName ? 88 : 68;
    doc.text(`Datum: ${dateStr}`, 40, subY);
    doc.text(`${rows.length} produkter`, pageWidth - 40, subY, { align: "right" });
    doc.setTextColor(0);

    autoTable(doc, {
      startY: subY + 16,
      head: [["Kategori", "Produkt", "SKU", "Enhet", "Pris (SEK)"]],
      body: rows.map((r) => [
        r.category,
        r.name,
        r.sku,
        r.unit,
        r.price.toFixed(2).replace(".", ",") + " kr",
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 90 },
        1: { cellWidth: "auto" },
        2: { cellWidth: 80 },
        3: { cellWidth: 50, halign: "center" },
        4: { cellWidth: 80, halign: "right" },
      },
      margin: { left: 40, right: 40 },
      didDrawPage: () => {
        const pageCount = doc.getNumberOfPages();
        const current = (doc as any).internal.getCurrentPageInfo().pageNumber;
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Sida ${current} / ${pageCount}`, pageWidth - 40, pageHeight - 20, { align: "right" });
        if (storeName) {
          doc.text(storeName, 40, pageHeight - 20);
        }
        doc.setTextColor(0);
      },
    });

    const safeName = storeName ? storeName.replace(/[^a-z0-9-_]+/gi, "_") : "alla";
    doc.save(`prislista-${safeName}-${dateStr}.pdf`);
  };

  const downloadPdf = () => {
    const rows: { name: string; sku: string; unit: string; price: number; category: string }[] = [];
    for (const p of allProducts) {
      if (included[p.id]) {
        rows.push({
          name: p.name,
          sku: p.sku || "",
          unit: p.unit || "",
          category: p.category || "",
          price: Number(prices[p.id] || 0),
        });
      }
    }
    if (!rows.length) {
      toast({ title: "Inga produkter valda", variant: "destructive" });
      return;
    }
    rows.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    const dateStr = format(new Date(), "yyyy-MM-dd");

    const chosen = shopStores.filter((s) => selectedStores[s.id]);
    if (chosen.length === 0) {
      generatePdfForStore(null, rows, dateStr);
      toast({ title: "Prislista nedladdad", description: `${rows.length} produkter` });
    } else {
      chosen.forEach((s) => generatePdfForStore(s.name, rows, dateStr));
      toast({
        title: "Prislistor nedladdade",
        description: `${chosen.length} butik(er) · ${rows.length} produkter`,
      });
    }
  };

  const renderPriceInput = (p: AnyProduct) => (
    <Input
      type="number"
      step="0.01"
      value={prices[p.id] ?? ""}
      onChange={(e) => setPrice(p.id, Number(e.target.value))}
      className="h-7 w-24 text-xs tabular-nums"
    />
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5 text-primary" /> Skapa prislista
          </DialogTitle>
          <DialogDescription>
            Sätt priser på dagens inköp och välj vilka produkter som ska med i prislistan till butikerna.
          </DialogDescription>
        </DialogHeader>

        {/* Store selector */}
        <section className="space-y-2 border rounded-md p-3 bg-muted/30">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Butiker som prislistan gäller</h2>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={() =>
                  setSelectedStores(Object.fromEntries(shopStores.map((s) => [s.id, true])))
                }
              >
                Markera alla
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-[10px]"
                onClick={() => setSelectedStores({})}
              >
                Rensa
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {shopStores.length === 0 && (
              <span className="text-xs text-muted-foreground">Inga butiker tillgängliga.</span>
            )}
            {shopStores.map((s) => {
              const checked = !!selectedStores[s.id];
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md border cursor-pointer text-xs transition-colors ${
                    checked
                      ? "bg-primary/10 border-primary/50 text-foreground"
                      : "bg-background border-border hover:bg-muted"
                  }`}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) =>
                      setSelectedStores((prev) => ({ ...prev, [s.id]: !!v }))
                    }
                  />
                  <span>{s.name}</span>
                </label>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            En separat PDF skapas per vald butik. Om ingen butik väljs skapas en generell prislista.
          </p>
        </section>

        {/* Section 1: Today's purchases */}
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <ShoppingBasket className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Dagens inköp</h2>
            <Badge variant="outline" className="text-[10px]">{todayLines.length} rader</Badge>
          </div>
          {loadingLines ? (
            <div className="text-xs text-muted-foreground py-4">Laddar dagens inköp…</div>
          ) : todayLines.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4 border rounded-md px-3">
              Inga inköpsrapporter för idag.
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Inköpt produkt</TableHead>
                    <TableHead className="text-right">Antal</TableHead>
                    <TableHead className="text-right">Inköpspris</TableHead>
                    <TableHead>Sätt pris i prislistan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todayLines.map((line) => {
                    const fam = familyFor(line.product_id);
                    return (
                      <TableRow key={line.id} className="align-top">
                        <TableCell>
                          {fam.length > 1 && <Layers className="h-3.5 w-3.5 text-muted-foreground" />}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs font-medium">{line.product_name}</div>
                          {fam.length > 1 && (
                            <div className="text-[10px] text-muted-foreground">
                              Grupp: {fam.length} varianter
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {Number(line.quantity).toLocaleString("sv-SE")} {line.unit || ""}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          {line.unit_price ? Number(line.unit_price).toFixed(2) : "–"}
                        </TableCell>
                        <TableCell>
                          {fam.length === 0 ? (
                            <span className="text-[10px] text-muted-foreground">Ej kopplad till produkt</span>
                          ) : (
                            <div className="space-y-1">
                              {fam.map((f) => (
                                <div key={f.id} className="flex items-center gap-2">
                                  <Checkbox
                                    checked={!!included[f.id]}
                                    onCheckedChange={(v) => toggleInc(f.id, !!v)}
                                  />
                                  <span className="text-xs flex-1 truncate">{f.name}</span>
                                  {renderPriceInput(f)}
                                  <span className="text-[10px] text-muted-foreground w-8">
                                    /{f.unit || ""}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* Section 2: All other products */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">Övriga produkter</h2>
              <Badge variant="outline" className="text-[10px]">{otherProducts.length}</Badge>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Sök produkt…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Enhet</TableHead>
                  <TableHead className="text-right">Pris</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {otherProducts.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Checkbox
                        checked={!!included[p.id]}
                        onCheckedChange={(v) => toggleInc(p.id, !!v)}
                      />
                    </TableCell>
                    <TableCell className="text-xs">{p.name}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{p.category}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{p.unit}</TableCell>
                    <TableCell className="text-right">{renderPriceInput(p)}</TableCell>
                  </TableRow>
                ))}
                {otherProducts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-4">
                      Inga produkter matchar.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {includedCount} produkter valda
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Stäng
            </Button>
            <Button size="sm" onClick={downloadPdf} className="gap-1.5">
              <FileDown className="h-3.5 w-3.5" /> Ladda ner prislista
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
