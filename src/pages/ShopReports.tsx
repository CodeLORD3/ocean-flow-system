import { useState, useMemo, useEffect, useCallback } from "react";
import { useSite } from "@/contexts/SiteContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStoreCurrency } from "@/lib/currency";
import {
  useWeeklyReportsList,
  useWeeklyReportDetail,
  usePreviousReport,
  useCreateWeeklyReportFull,
  useUpdateWeeklyReportFull,
  DEFAULT_COST_LABELS,
  DEFAULT_SALES_CHANNELS,
  DEFAULT_SOCIAL_PLATFORMS,
  type InventoryLine,
  type CostLine,
  type SalesLine,
  type SocialLine,
} from "@/hooks/useWeeklyReports";
import { useProducts } from "@/hooks/useProducts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Save, BarChart3, TrendingUp, ArrowLeft, Trash2, Search,
  Package, DollarSign, Share2, FileText, AlertTriangle, Printer,
} from "lucide-react";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function getCurrentWeek() {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeekDateRange(year: number, week: number) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 }).format(v);

// Default formatter (SEK). Per-store currency is resolved inside SummaryCards / WeeklyReportForm.
const fmtKr = (v: number) => `${fmt(v)} kr`;
const fmtCurr = (v: number, cur: string) => `${fmt(v)} ${cur === "SEK" ? "kr" : cur}`;

// ─── Product Picker ─────────────────────────────────────────────────
function ProductPicker({
  value,
  onSelect,
  products,
}: {
  value: string | null;
  onSelect: (id: string, name: string, unit: string, price: number) => void;
  products: any[];
}) {
  const [open, setOpen] = useState(false);
  const selected = products.find((p) => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start text-xs h-8 font-normal">
          {selected ? selected.name : <span className="text-muted-foreground">Välj produkt...</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Sök produkt..." />
          <CommandList>
            <CommandEmpty>Ingen produkt hittad</CommandEmpty>
            <CommandGroup>
              {products.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.name}
                  onSelect={() => {
                    onSelect(p.id, p.name, p.unit, p.cost_price);
                    setOpen(false);
                  }}
                >
                  <span className="text-xs">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{p.unit}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── Summary Cards ──────────────────────────────────────────────────
function SummaryCards({
  totalSales,
  grossMarginPct,
  closingInventory,
  inventoryChange,
  currency = "SEK",
}: {
  totalSales: number;
  grossMarginPct: number;
  closingInventory: number;
  inventoryChange: number;
  currency?: string;
}) {
  const fmtC = (v: number) => fmtCurr(v, currency);
  const marginColor =
    grossMarginPct >= 45 ? "text-emerald-400" :
    grossMarginPct >= 35 ? "text-yellow-400" :
    grossMarginPct > 0 ? "text-red-400" : "text-muted-foreground";

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card>
        <CardContent className="pt-3 pb-2 px-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Försäljning</p>
          <p className="text-lg font-bold font-mono tabular-nums">{fmtC(totalSales)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-3 pb-2 px-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Bruttomarginal</p>
          <p className={`text-lg font-bold font-mono tabular-nums ${marginColor}`}>
            {grossMarginPct > 0 ? `${grossMarginPct.toFixed(1)}%` : "–"}
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-3 pb-2 px-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Utgående lager</p>
          <p className="text-lg font-bold font-mono tabular-nums">{fmtC(closingInventory)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-3 pb-2 px-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Lagerförändring</p>
          <p className={`text-lg font-bold font-mono tabular-nums ${inventoryChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {inventoryChange >= 0 ? "+" : ""}{fmtC(inventoryChange)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Report Form ────────────────────────────────────────────────────
function WeeklyReportForm({
  storeId,
  onDone,
  reportId,
}: {
  storeId: string;
  onDone: () => void;
  reportId: string | null;
}) {
  const isEdit = !!reportId;
  const { data: detail, isLoading: detailLoading } = useWeeklyReportDetail(reportId);
  const { data: allProducts = [] } = useProducts();
  const { data: storeRow } = useQuery({
    queryKey: ["store_row_for_report", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data } = await supabase.from("stores").select("id, name, city").eq("id", storeId).maybeSingle();
      return data;
    },
  });
  const localCurrency = getStoreCurrency(storeRow as any);
  const currencyLabel = localCurrency === "SEK" ? "kr" : localCurrency;
  const fmtC = (v: number) => fmtCurr(v, localCurrency);
  const currentYear = new Date().getFullYear();
  const currentWeek = getCurrentWeek();

  const [year, setYear] = useState(currentYear);
  const [week, setWeek] = useState(currentWeek);
  const [status, setStatus] = useState<"draft" | "finalized">("draft");
  const [notes, setNotes] = useState("");
  const [openingInventory, setOpeningInventory] = useState(0);
  const [activeTab, setActiveTab] = useState("inventory");
  const [showFinalizeWarning, setShowFinalizeWarning] = useState(false);

  // Inventory lines
  const [invLines, setInvLines] = useState<(InventoryLine & { _name?: string })[]>([]);

  // Cost lines
  const [costLines, setCostLines] = useState<CostLine[]>(
    DEFAULT_COST_LABELS.map((label, i) => ({ label, amount: 0, sort_order: i }))
  );

  // Sales lines
  const [salesLines, setSalesLines] = useState<SalesLine[]>(
    DEFAULT_SALES_CHANNELS.map((channel, i) => ({ channel, quantity: 0, amount: 0, sort_order: i }))
  );

  // Social lines
  const [socialLines, setSocialLines] = useState<SocialLine[]>(
    DEFAULT_SOCIAL_PLATFORMS.map((platform, i) => ({
      platform, opening_followers: 0, closing_followers: 0, follower_change: 0, posts_count: 0, sort_order: i,
    }))
  );

  // Previous report for auto-fill
  const { data: prevData } = usePreviousReport(storeId, year, week);

  // Auto-fill from previous report
  useEffect(() => {
    if (isEdit || !prevData) return;
    setOpeningInventory(Number(prevData.report.closing_inventory) || 0);
    if (prevData.socialLines.length > 0) {
      setSocialLines((prev) =>
        prev.map((s) => {
          const prevSocial = prevData.socialLines.find((ps: any) => ps.platform === s.platform);
          return prevSocial ? { ...s, opening_followers: prevSocial.closing_followers } : s;
        })
      );
    }
  }, [prevData, isEdit]);

  // Load existing report data
  useEffect(() => {
    if (!detail) return;
    const r = detail.report;
    setYear(r.year);
    setWeek(r.week_number);
    setStatus(r.status as any);
    setNotes(r.notes || "");
    setOpeningInventory(Number(r.opening_inventory));

    if (detail.inventoryLines.length > 0) {
      setInvLines(
        detail.inventoryLines.map((l: any) => {
          const prod = allProducts.find((p) => p.id === l.product_id);
          return {
            product_id: l.product_id,
            quantity: Number(l.quantity),
            unit: l.unit,
            unit_price: Number(l.unit_price),
            total: Number(l.total),
            _name: prod?.name || "Okänd produkt",
          };
        })
      );
    }

    if (detail.costLines.length > 0) {
      setCostLines(detail.costLines.map((l: any) => ({
        label: l.label,
        amount: Number(l.amount),
        sort_order: l.sort_order,
      })));
    }

    if (detail.salesLines.length > 0) {
      setSalesLines(detail.salesLines.map((l: any) => ({
        channel: l.channel,
        quantity: l.quantity,
        amount: Number(l.amount),
        last_year_amount: l.last_year_amount ? Number(l.last_year_amount) : undefined,
        sort_order: l.sort_order,
      })));
    }

    if (detail.socialLines.length > 0) {
      setSocialLines(detail.socialLines.map((l: any) => ({
        platform: l.platform,
        opening_followers: l.opening_followers,
        closing_followers: l.closing_followers,
        follower_change: l.follower_change,
        posts_count: l.posts_count,
        sort_order: l.sort_order,
      })));
    }
  }, [detail, allProducts]);

  // Computed values
  const closingInventory = invLines.reduce((s, l) => s + l.total, 0);
  const inventoryChange = closingInventory - openingInventory;
  const totalCosts = costLines.reduce((s, l) => s + l.amount, 0) + Math.abs(Math.min(0, inventoryChange));
  const totalSales = salesLines.reduce((s, l) => s + l.amount, 0);
  const grossMargin = totalSales - totalCosts;
  const grossMarginPct = totalSales > 0 ? (grossMargin / totalSales) * 100 : 0;

  const createMut = useCreateWeeklyReportFull();
  const updateMut = useUpdateWeeklyReportFull();

  const handleSave = (targetStatus: "draft" | "finalized") => {
    if (targetStatus === "finalized" && isEdit && status === "finalized") {
      setShowFinalizeWarning(true);
      return;
    }
    doSave(targetStatus);
  };

  const doSave = (targetStatus: "draft" | "finalized") => {
    const payload = {
      store_id: storeId,
      year,
      week_number: week,
      status: targetStatus,
      opening_inventory: openingInventory,
      closing_inventory: closingInventory,
      inventory_change: inventoryChange,
      total_costs: totalCosts,
      total_sales: totalSales,
      gross_margin: grossMargin,
      gross_margin_pct: grossMarginPct,
      notes: notes || undefined,
      inventoryLines: invLines.filter((l) => l.product_id).map(({ _name, ...l }) => l),
      costLines: costLines.filter((l) => l.amount > 0),
      salesLines: salesLines.filter((l) => l.amount > 0 || l.quantity > 0),
      socialLines: socialLines.map((s) => ({
        ...s,
        follower_change: s.closing_followers - s.opening_followers,
      })),
    };

    if (isEdit) {
      updateMut.mutate(
        { ...payload, id: reportId! },
        {
          onSuccess: () => {
            toast.success(targetStatus === "finalized" ? "Rapport slutförd & lager uppdaterat" : "Utkast sparat");
            onDone();
          },
          onError: (e) => toast.error(e.message),
        }
      );
    } else {
      createMut.mutate(payload, {
        onSuccess: () => {
          toast.success(targetStatus === "finalized" ? "Rapport skapad & lager uppdaterat" : "Utkast sparat");
          onDone();
        },
        onError: (e) => toast.error(e.message),
      });
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  // Inventory line helpers
  const addInvLine = () => {
    setInvLines((prev) => [...prev, { product_id: "", quantity: 0, unit: "kg", unit_price: 0, total: 0 }]);
  };

  const updateInvLine = (idx: number, field: string, value: any) => {
    setInvLines((prev) => {
      const updated = [...prev];
      (updated[idx] as any)[field] = value;
      if (field === "quantity" || field === "unit_price") {
        updated[idx].total = updated[idx].quantity * updated[idx].unit_price;
      }
      return updated;
    });
  };

  const removeInvLine = (idx: number) => {
    setInvLines((prev) => prev.filter((_, i) => i !== idx));
  };

  // Cost line helpers
  const addCostLine = () => {
    setCostLines((prev) => [...prev, { label: "", amount: 0, sort_order: prev.length }]);
  };

  const updateCostLine = (idx: number, field: string, value: any) => {
    setCostLines((prev) => {
      const updated = [...prev];
      (updated[idx] as any)[field] = value;
      return updated;
    });
  };

  if (detailLoading && isEdit) {
    return <p className="text-muted-foreground text-sm p-6">Laddar rapport...</p>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onDone}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Tillbaka
          </Button>
          <div>
            <h2 className="text-lg font-bold">
              {isEdit ? `Vecka ${week}, ${year}` : "Ny veckorapport"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {getWeekDateRange(year, week)}
              {status === "finalized" && (
                <Badge variant="secondary" className="ml-2 text-[10px]">Slutförd</Badge>
              )}
              {status === "draft" && (
                <Badge variant="outline" className="ml-2 text-[10px]">Utkast</Badge>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Skriv ut
          </Button>
        </div>
      </div>

      {/* Week selector for new reports */}
      {!isEdit && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>År</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Vecka</Label>
            <Select value={String(week)} onValueChange={(v) => setWeek(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 52 }, (_, i) => i + 1).map((w) => (
                  <SelectItem key={w} value={String(w)}>V{w}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <SummaryCards
        totalSales={totalSales}
        grossMarginPct={grossMarginPct}
        closingInventory={closingInventory}
        inventoryChange={inventoryChange}
      />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="inventory" className="text-xs gap-1"><Package className="h-3.5 w-3.5" /> Inventering</TabsTrigger>
          <TabsTrigger value="sales" className="text-xs gap-1"><DollarSign className="h-3.5 w-3.5" /> Försäljning</TabsTrigger>
          <TabsTrigger value="social" className="text-xs gap-1"><Share2 className="h-3.5 w-3.5" /> Sociala Medier</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs gap-1"><FileText className="h-3.5 w-3.5" /> Noteringar</TabsTrigger>
        </TabsList>

        {/* Section A: Inventory */}
        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Inventeringsrapport</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 pb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">
                    Ingående lager ({currencyLabel})
                    {!isEdit && prevData && (
                      <span className="text-[10px] text-muted-foreground ml-1">(auto)</span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    className="h-8 text-sm font-mono"
                    value={openingInventory || ""}
                    onChange={(e) => setOpeningInventory(Number(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Utgående lager (beräknat)</Label>
                  <div className="h-8 flex items-center text-sm font-mono font-bold">{fmtC(closingInventory)}</div>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[40%]">Produkt</TableHead>
                    <TableHead className="text-xs text-right">Antal</TableHead>
                    <TableHead className="text-xs text-center">Enhet</TableHead>
                    <TableHead className="text-xs text-right">Á-pris ({currencyLabel})</TableHead>
                    <TableHead className="text-xs text-right">Totalt</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invLines.map((line, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="py-1">
                        <ProductPicker
                          value={line.product_id || null}
                          products={allProducts}
                          onSelect={(id, name, unit, price) => {
                            const updated = [...invLines];
                            updated[idx] = {
                              ...updated[idx],
                              product_id: id,
                              unit,
                              unit_price: price,
                              _name: name,
                              total: updated[idx].quantity * price,
                            };
                            setInvLines(updated);
                          }}
                        />
                      </TableCell>
                      <TableCell className="py-1">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right font-mono w-20"
                          value={line.quantity || ""}
                          onChange={(e) => updateInvLine(idx, "quantity", Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell className="py-1 text-center text-xs text-muted-foreground">{line.unit}</TableCell>
                      <TableCell className="py-1">
                        <Input
                          type="number"
                          className="h-7 text-xs text-right font-mono w-24"
                          value={line.unit_price || ""}
                          onChange={(e) => updateInvLine(idx, "unit_price", Number(e.target.value) || 0)}
                        />
                      </TableCell>
                      <TableCell className="py-1 text-right text-xs font-mono font-medium">{fmtC(line.total)}</TableCell>
                      <TableCell className="py-1">
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => removeInvLine(idx)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Button variant="outline" size="sm" onClick={addInvLine} className="text-xs">
                <Plus className="h-3 w-3 mr-1" /> Lägg till rad
              </Button>

              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-semibold">Totalt inventering</span>
                <span className="text-sm font-bold font-mono">{fmtC(closingInventory)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Lagerförändring</span>
                <span className={`text-xs font-mono ${inventoryChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {inventoryChange >= 0 ? "+" : ""}{fmtC(inventoryChange)}
                </span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section B: Sales & Gross Margin */}
        <TabsContent value="sales" className="space-y-4">
          {/* Costs */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Kostnader</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              {costLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <Input
                    className="h-8 text-xs w-44"
                    value={line.label}
                    onChange={(e) => updateCostLine(idx, "label", e.target.value)}
                    placeholder="Kostnad..."
                  />
                  <Input
                    type="number"
                    className="h-8 text-xs text-right font-mono flex-1"
                    value={line.amount || ""}
                    onChange={(e) => updateCostLine(idx, "amount", Number(e.target.value) || 0)}
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground w-6">{currencyLabel}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="w-44">Lagerförändring (neg.)</span>
                <span className="flex-1 text-right font-mono">
                  {inventoryChange < 0 ? fmtC(Math.abs(inventoryChange)) : `0 ${currencyLabel}`}
                </span>
                <span className="w-6"></span>
              </div>
              <Button variant="outline" size="sm" onClick={addCostLine} className="text-xs">
                <Plus className="h-3 w-3 mr-1" /> Lägg till kostnad
              </Button>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm font-semibold">Totala kostnader</span>
                <span className="text-sm font-bold font-mono">{fmtC(totalCosts)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Sales */}
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Försäljning exkl. moms</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Kanal</TableHead>
                    <TableHead className="text-xs text-right">Antal</TableHead>
                    <TableHead className="text-xs text-right">Belopp ({currencyLabel})</TableHead>
                    <TableHead className="text-xs text-right">Förra året</TableHead>
                    <TableHead className="text-xs text-right">Förändr.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesLines.map((line, idx) => {
                    const yoy = line.last_year_amount && line.last_year_amount > 0
                      ? ((line.amount - line.last_year_amount) / line.last_year_amount * 100)
                      : null;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-xs py-1">{line.channel}</TableCell>
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            className="h-7 text-xs text-right font-mono w-20 ml-auto"
                            value={line.quantity || ""}
                            onChange={(e) => {
                              const updated = [...salesLines];
                              updated[idx].quantity = Number(e.target.value) || 0;
                              setSalesLines(updated);
                            }}
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            className="h-7 text-xs text-right font-mono w-28 ml-auto"
                            value={line.amount || ""}
                            onChange={(e) => {
                              const updated = [...salesLines];
                              updated[idx].amount = Number(e.target.value) || 0;
                              setSalesLines(updated);
                            }}
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            className="h-7 text-xs text-right font-mono w-28 ml-auto"
                            value={line.last_year_amount || ""}
                            onChange={(e) => {
                              const updated = [...salesLines];
                              updated[idx].last_year_amount = Number(e.target.value) || undefined;
                              setSalesLines(updated);
                            }}
                            placeholder="–"
                          />
                        </TableCell>
                        <TableCell className="text-xs text-right py-1 font-mono">
                          {yoy !== null ? (
                            <span className={yoy >= 0 ? "text-emerald-400" : "text-red-400"}>
                              {yoy >= 0 ? "+" : ""}{yoy.toFixed(0)}%
                            </span>
                          ) : "–"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="space-y-2 pt-3 border-t mt-3">
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">Total försäljning exkl. moms</span>
                  <span className="text-sm font-bold font-mono">{fmtC(totalSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">Bruttomarginal</span>
                  <span className="text-sm font-bold font-mono">{fmtC(grossMargin)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm font-semibold">Bruttomarginal %</span>
                  <span className={`text-sm font-bold font-mono ${
                    grossMarginPct >= 45 ? "text-emerald-400" :
                    grossMarginPct >= 35 ? "text-yellow-400" :
                    grossMarginPct > 0 ? "text-red-400" : ""
                  }`}>
                    {grossMarginPct > 0 ? `${grossMarginPct.toFixed(1)}%` : "–"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section C: Social Media */}
        <TabsContent value="social" className="space-y-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Sociala Medier</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Plattform</TableHead>
                    <TableHead className="text-xs text-right">Ing. följare</TableHead>
                    <TableHead className="text-xs text-right">Utg. följare</TableHead>
                    <TableHead className="text-xs text-right">Förändring</TableHead>
                    <TableHead className="text-xs text-right">Antal inlägg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {socialLines.map((line, idx) => {
                    const change = line.closing_followers - line.opening_followers;
                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-xs py-1 font-medium">{line.platform}</TableCell>
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            className="h-7 text-xs text-right font-mono w-24 ml-auto"
                            value={line.opening_followers || ""}
                            onChange={(e) => {
                              const updated = [...socialLines];
                              updated[idx].opening_followers = Number(e.target.value) || 0;
                              setSocialLines(updated);
                            }}
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            className="h-7 text-xs text-right font-mono w-24 ml-auto"
                            value={line.closing_followers || ""}
                            onChange={(e) => {
                              const updated = [...socialLines];
                              updated[idx].closing_followers = Number(e.target.value) || 0;
                              setSocialLines(updated);
                            }}
                          />
                        </TableCell>
                        <TableCell className={`text-xs text-right py-1 font-mono ${change > 0 ? "text-emerald-400" : change < 0 ? "text-red-400" : ""}`}>
                          {change > 0 ? "+" : ""}{change}
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            type="number"
                            className="h-7 text-xs text-right font-mono w-20 ml-auto"
                            value={line.posts_count || ""}
                            onChange={(e) => {
                              const updated = [...socialLines];
                              updated[idx].posts_count = Number(e.target.value) || 0;
                              setSocialLines(updated);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Section D: Notes */}
        <TabsContent value="notes" className="space-y-4">
          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm">Veckans Noteringar</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Kommentarer och observationer om veckan..."
                className="min-h-[200px]"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => handleSave("draft")}
          disabled={isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {isPending ? "Sparar..." : "Spara utkast"}
        </Button>
        <Button
          className="flex-1"
          onClick={() => handleSave("finalized")}
          disabled={isPending}
        >
          <TrendingUp className="h-4 w-4 mr-2" />
          {isPending ? "Sparar..." : "Slutför & uppdatera lager"}
        </Button>
      </div>

      {/* Finalize warning dialog */}
      <AlertDialog open={showFinalizeWarning} onOpenChange={setShowFinalizeWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
              Uppdatera slutförd rapport
            </AlertDialogTitle>
            <AlertDialogDescription>
              Denna rapport är redan slutförd. Att spara om den kommer att uppdatera lagersaldona igen baserat på de nya inventeingssiffrorna. Vill du fortsätta?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowFinalizeWarning(false); doSave("finalized"); }}>
              Uppdatera ändå
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function ShopReports() {
  const { activeStoreId, activeStoreName } = useSite();
  const { data: reports, isLoading } = useWeeklyReportsList(activeStoreId);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  if (!activeStoreId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Välj en butik för att se rapporter.</p>
      </div>
    );
  }

  // Show form if editing or creating
  if (activeReportId || isCreating) {
    return (
      <div className="p-6 max-w-4xl">
        <WeeklyReportForm
          storeId={activeStoreId}
          reportId={activeReportId}
          onDone={() => {
            setActiveReportId(null);
            setIsCreating(false);
          }}
        />
      </div>
    );
  }

  // Report list view
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Rapporter — {activeStoreName}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Veckorapporter</p>
        </div>
        <Button onClick={() => setIsCreating(true)}>
          <Plus className="h-4 w-4 mr-2" /> Skapa ny rapport
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-muted-foreground text-sm p-6">Laddar...</p>
          ) : !reports?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Inga veckorapporter ännu.</p>
              <p className="text-xs mt-1">Klicka "Skapa ny rapport" för att börja.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vecka</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Försäljning</TableHead>
                  <TableHead className="text-right">Bruttomarg. %</TableHead>
                  <TableHead className="text-right">Utg. lager</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r: any) => {
                  const marginColor =
                    r.gross_margin_pct >= 45 ? "text-emerald-400" :
                    r.gross_margin_pct >= 35 ? "text-yellow-400" :
                    r.gross_margin_pct > 0 ? "text-red-400" : "text-muted-foreground";
                  return (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setActiveReportId(r.id)}
                    >
                      <TableCell className="font-medium">V{r.week_number} {r.year}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {getWeekDateRange(r.year, r.week_number)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === "finalized" ? "secondary" : "outline"} className="text-[10px]">
                          {r.status === "finalized" ? "Slutförd" : "Utkast"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        {fmtKr(Number(r.total_sales))}
                      </TableCell>
                      <TableCell className={`text-right font-mono tabular-nums text-sm ${marginColor}`}>
                        {Number(r.gross_margin_pct) > 0 ? `${Number(r.gross_margin_pct).toFixed(1)}%` : "–"}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-sm">
                        {fmtKr(Number(r.closing_inventory))}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
