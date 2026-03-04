import { useState, useMemo } from "react";
import { useSite } from "@/contexts/SiteContext";
import {
  useWeeklyReports,
  useCreateWeeklyReport,
  useUpdateWeeklyReport,
  SALES_CATEGORIES,
  PURCHASE_CATEGORIES,
  type ReportLine,
} from "@/hooks/useShopReports";
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
import { toast } from "sonner";
import { Plus, Save, BarChart3, TrendingUp, ShoppingCart } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";

function getCurrentWeek() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const diff = now.getTime() - start.getTime();
  const oneWeek = 604800000;
  return Math.ceil((diff / oneWeek + start.getDay() / 7));
}

function getWeeksInYear(year: number) {
  const d = new Date(year, 11, 31);
  const week = getCurrentWeekForDate(d);
  return week === 1 ? 52 : week;
}

function getCurrentWeekForDate(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function getWeeksForMonth(year: number, month: number): number[] {
  const weeks: Set<number> = new Set();
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    weeks.add(getCurrentWeekForDate(d));
  }
  return Array.from(weeks).sort((a, b) => a - b);
}

const fmt = (v: number) =>
  new Intl.NumberFormat("sv-SE", {
    style: "currency",
    currency: "SEK",
    maximumFractionDigits: 0,
  }).format(v);

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "Maj", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dec"];

// ─── Weekly Report Form ─────────────────────────────────────────────
function WeeklyReportForm({
  storeId,
  onDone,
  editReport,
}: {
  storeId: string;
  onDone: () => void;
  editReport?: any;
}) {
  const currentYear = new Date().getFullYear();
  const currentWeek = getCurrentWeek();

  const [year, setYear] = useState(editReport?.year ?? currentYear);
  const [week, setWeek] = useState(editReport?.week_number ?? currentWeek);
  const [openingInv, setOpeningInv] = useState(String(editReport?.opening_inventory ?? ""));
  const [closingInv, setClosingInv] = useState(String(editReport?.closing_inventory ?? ""));
  const [notes, setNotes] = useState(editReport?.notes ?? "");

  const existingLines: ReportLine[] = editReport?.shop_report_lines ?? [];

  const initLines = (): Record<string, string> => {
    const m: Record<string, string> = {};
    SALES_CATEGORIES.forEach((c) => {
      const existing = existingLines.find((l: any) => l.line_type === "sale" && l.category === c);
      m[`sale_${c}`] = existing ? String(existing.amount) : "";
    });
    PURCHASE_CATEGORIES.forEach((c) => {
      const existing = existingLines.find((l: any) => l.line_type === "purchase" && l.category === c);
      m[`purchase_${c}`] = existing ? String(existing.amount) : "";
    });
    return m;
  };

  const [lineAmounts, setLineAmounts] = useState<Record<string, string>>(initLines);

  const setAmount = (key: string, val: string) =>
    setLineAmounts((prev) => ({ ...prev, [key]: val }));

  const createMut = useCreateWeeklyReport();
  const updateMut = useUpdateWeeklyReport();

  const handleSubmit = () => {
    const lines: ReportLine[] = [];
    SALES_CATEGORIES.forEach((c) => {
      const amt = Number(lineAmounts[`sale_${c}`]) || 0;
      if (amt > 0) lines.push({ line_type: "sale", category: c, amount: amt });
    });
    PURCHASE_CATEGORIES.forEach((c) => {
      const amt = Number(lineAmounts[`purchase_${c}`]) || 0;
      if (amt > 0) lines.push({ line_type: "purchase", category: c, amount: amt });
    });

    if (editReport) {
      updateMut.mutate(
        {
          id: editReport.id,
          store_id: storeId,
          opening_inventory: Number(openingInv) || 0,
          closing_inventory: Number(closingInv) || 0,
          notes: notes || undefined,
          lines,
        },
        {
          onSuccess: () => { toast.success("Rapport uppdaterad"); onDone(); },
          onError: (e) => toast.error(e.message),
        }
      );
    } else {
      createMut.mutate(
        {
          store_id: storeId,
          year,
          week_number: week,
          opening_inventory: Number(openingInv) || 0,
          closing_inventory: Number(closingInv) || 0,
          notes: notes || undefined,
          lines,
        },
        {
          onSuccess: () => { toast.success("Rapport sparad"); onDone(); },
          onError: (e) => toast.error(e.message),
        }
      );
    }
  };

  const isPending = createMut.isPending || updateMut.isPending;

  const totalSales = SALES_CATEGORIES.reduce(
    (s, c) => s + (Number(lineAmounts[`sale_${c}`]) || 0), 0
  );
  const totalPurchases = PURCHASE_CATEGORIES.reduce(
    (s, c) => s + (Number(lineAmounts[`purchase_${c}`]) || 0), 0
  );

  return (
    <div className="space-y-5">
      {/* Week selector */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>År</Label>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))} disabled={!!editReport}>
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
          <Select value={String(week)} onValueChange={(v) => setWeek(Number(v))} disabled={!!editReport}>
            <SelectTrigger><SelectValue placeholder="Välj vecka" /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: getWeeksInYear(year) }, (_, i) => i + 1).map((w) => (
                <SelectItem key={w} value={String(w)}>V{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Sales section */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-primary" /> Försäljning
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {SALES_CATEGORIES.map((c) => (
            <div key={c} className="flex items-center gap-3">
              <Label className="w-44 text-xs shrink-0">{c}</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-8 text-sm"
                value={lineAmounts[`sale_${c}`]}
                onChange={(e) => setAmount(`sale_${c}`, e.target.value)}
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1 border-t border-border">
            <span className="w-44 text-xs font-semibold shrink-0">Totalt försäljning</span>
            <span className="text-sm font-bold">{fmt(totalSales)}</span>
          </div>
        </div>
      </div>

      {/* Purchase section */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <ShoppingCart className="h-4 w-4 text-primary" /> Inköp
        </h3>
        <div className="grid grid-cols-1 gap-2">
          {PURCHASE_CATEGORIES.map((c) => (
            <div key={c} className="flex items-center gap-3">
              <Label className="w-44 text-xs shrink-0">{c}</Label>
              <Input
                type="number"
                placeholder="0"
                className="h-8 text-sm"
                value={lineAmounts[`purchase_${c}`]}
                onChange={(e) => setAmount(`purchase_${c}`, e.target.value)}
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-1 border-t border-border">
            <span className="w-44 text-xs font-semibold shrink-0">Totalt inköp</span>
            <span className="text-sm font-bold">{fmt(totalPurchases)}</span>
          </div>
        </div>
      </div>

      {/* Inventory */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Ingående lager (SEK)</Label>
          <Input type="number" placeholder="0" value={openingInv} onChange={(e) => setOpeningInv(e.target.value)} />
        </div>
        <div>
          <Label>Utgående lager (SEK)</Label>
          <Input type="number" placeholder="0" value={closingInv} onChange={(e) => setClosingInv(e.target.value)} />
        </div>
      </div>

      <div>
        <Label>Anteckningar</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Valfria anteckningar..." />
      </div>

      <Button onClick={handleSubmit} disabled={isPending} className="w-full">
        <Save className="h-4 w-4 mr-2" />
        {isPending ? "Sparar..." : editReport ? "Uppdatera rapport" : "Spara rapport"}
      </Button>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────
export default function ShopReports() {
  const { activeStoreId, activeStoreName } = useSite();
  const { data: weeklyReports, isLoading } = useWeeklyReports(activeStoreId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<any>(null);

  // Monthly aggregation state
  const currentYear = new Date().getFullYear();
  const [monthlyYear, setMonthlyYear] = useState(currentYear);
  const [monthlyMode, setMonthlyMode] = useState<"month" | "weeks" | "dates">("month");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedWeeksFrom, setSelectedWeeksFrom] = useState(1);
  const [selectedWeeksTo, setSelectedWeeksTo] = useState(getCurrentWeek());

  const targetWeeks = useMemo(() => {
    if (monthlyMode === "month") return getWeeksForMonth(monthlyYear, selectedMonth);
    return Array.from(
      { length: selectedWeeksTo - selectedWeeksFrom + 1 },
      (_, i) => selectedWeeksFrom + i
    );
  }, [monthlyMode, monthlyYear, selectedMonth, selectedWeeksFrom, selectedWeeksTo]);

  const monthlyData = useMemo(() => {
    if (!weeklyReports) return null;
    const filtered = weeklyReports.filter(
      (r) => r.year === monthlyYear && targetWeeks.includes(r.week_number!)
    );
    if (filtered.length === 0) return null;

    const allLines = filtered.flatMap((r: any) => r.shop_report_lines || []);
    const salesByCategory: Record<string, number> = {};
    const purchasesByCategory: Record<string, number> = {};

    allLines.forEach((l: any) => {
      if (l.line_type === "sale") {
        salesByCategory[l.category] = (salesByCategory[l.category] || 0) + Number(l.amount);
      } else {
        purchasesByCategory[l.category] = (purchasesByCategory[l.category] || 0) + Number(l.amount);
      }
    });

    const totalSales = Object.values(salesByCategory).reduce((s, v) => s + v, 0);
    const totalPurchases = Object.values(purchasesByCategory).reduce((s, v) => s + v, 0);

    const sortedByWeek = [...filtered].sort((a, b) => (a.week_number ?? 0) - (b.week_number ?? 0));
    const openingInv = Number(sortedByWeek[0]?.opening_inventory ?? 0);
    const closingInv = Number(sortedByWeek[sortedByWeek.length - 1]?.closing_inventory ?? 0);

    return {
      weeksIncluded: filtered.length,
      salesByCategory,
      purchasesByCategory,
      totalSales,
      totalPurchases,
      openingInv,
      closingInv,
    };
  }, [weeklyReports, monthlyYear, targetWeeks]);

  const handleEdit = (report: any) => {
    setEditingReport(report);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingReport(null);
  };

  if (!activeStoreId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Välj en butik för att se rapporter.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Rapporter — {activeStoreName}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Vecko- och månadsrapporter</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(v) => { if (!v) handleDialogClose(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Ny veckorapport</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingReport ? `Redigera V${editingReport.week_number} ${editingReport.year}` : "Ny veckorapport"}</DialogTitle>
            </DialogHeader>
            <WeeklyReportForm storeId={activeStoreId} onDone={handleDialogClose} editReport={editingReport} />
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="weekly">
        <TabsList>
          <TabsTrigger value="weekly">Veckorapporter</TabsTrigger>
          <TabsTrigger value="monthly">Månadsrapport</TabsTrigger>
        </TabsList>

        {/* ── Weekly Tab ── */}
        <TabsContent value="weekly" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Veckorapporter</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-muted-foreground text-sm">Laddar...</p>
              ) : !weeklyReports?.length ? (
                <p className="text-muted-foreground text-sm">Inga veckorapporter ännu.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vecka</TableHead>
                      <TableHead className="text-right">Försäljning</TableHead>
                      <TableHead className="text-right">Inköp</TableHead>
                      <TableHead className="text-right">Ing. lager</TableHead>
                      <TableHead className="text-right">Utg. lager</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weeklyReports.map((r: any) => {
                      const lines = r.shop_report_lines || [];
                      const sales = lines.filter((l: any) => l.line_type === "sale").reduce((s: number, l: any) => s + Number(l.amount), 0);
                      const purchases = lines.filter((l: any) => l.line_type === "purchase").reduce((s: number, l: any) => s + Number(l.amount), 0);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">V{r.week_number} {r.year}</TableCell>
                          <TableCell className="text-right">{fmt(sales)}</TableCell>
                          <TableCell className="text-right">{fmt(purchases)}</TableCell>
                          <TableCell className="text-right">{fmt(Number(r.opening_inventory))}</TableCell>
                          <TableCell className="text-right">{fmt(Number(r.closing_inventory))}</TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(r)}>Redigera</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Monthly Tab ── */}
        <TabsContent value="monthly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Månadsrapport (summering)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Interval selector */}
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <Label>År</Label>
                  <Select value={String(monthlyYear)} onValueChange={(v) => setMonthlyYear(Number(v))}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Typ</Label>
                  <Select value={monthlyMode} onValueChange={(v: any) => setMonthlyMode(v)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="month">Hel månad</SelectItem>
                      <SelectItem value="weeks">Veckointervall</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {monthlyMode === "month" && (
                  <div>
                    <Label>Månad</Label>
                    <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                      <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTH_NAMES.map((m, i) => (
                          <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {monthlyMode === "weeks" && (
                  <>
                    <div>
                      <Label>Från vecka</Label>
                      <Select value={String(selectedWeeksFrom)} onValueChange={(v) => setSelectedWeeksFrom(Number(v))}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 53 }, (_, i) => i + 1).map((w) => (
                            <SelectItem key={w} value={String(w)}>V{w}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Till vecka</Label>
                      <Select value={String(selectedWeeksTo)} onValueChange={(v) => setSelectedWeeksTo(Number(v))}>
                        <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 53 }, (_, i) => i + 1).map((w) => (
                            <SelectItem key={w} value={String(w)}>V{w}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
              </div>

              {/* Aggregated results */}
              {!monthlyData ? (
                <p className="text-muted-foreground text-sm py-4">
                  Inga veckorapporter hittades för det valda intervallet.
                </p>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Summerat från {monthlyData.weeksIncluded} veckorapport(er)
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-4 pb-3 px-4">
                        <p className="text-xs text-muted-foreground">Försäljning</p>
                        <p className="text-lg font-bold">{fmt(monthlyData.totalSales)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-3 px-4">
                        <p className="text-xs text-muted-foreground">Inköp</p>
                        <p className="text-lg font-bold">{fmt(monthlyData.totalPurchases)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-3 px-4">
                        <p className="text-xs text-muted-foreground">Ingående lager</p>
                        <p className="text-lg font-bold">{fmt(monthlyData.openingInv)}</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-4 pb-3 px-4">
                        <p className="text-xs text-muted-foreground">Utgående lager</p>
                        <p className="text-lg font-bold">{fmt(monthlyData.closingInv)}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Försäljning per kategori</h4>
                      <Table>
                        <TableBody>
                          {Object.entries(monthlyData.salesByCategory).map(([cat, amt]) => (
                            <TableRow key={cat}>
                              <TableCell className="text-sm">{cat}</TableCell>
                              <TableCell className="text-right text-sm font-medium">{fmt(amt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Inköp per kategori</h4>
                      <Table>
                        <TableBody>
                          {Object.entries(monthlyData.purchasesByCategory).map(([cat, amt]) => (
                            <TableRow key={cat}>
                              <TableCell className="text-sm">{cat}</TableCell>
                              <TableCell className="text-right text-sm font-medium">{fmt(amt)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
