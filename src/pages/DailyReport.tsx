import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Loader2, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSite } from "@/contexts/SiteContext";
import { useTabs } from "@/contexts/TabsContext";
import { useStaff } from "@/hooks/useStaff";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import {
  useDailyReport,
  useSaveDailyReport,
  todayIso,
  formatWeekdayDate,
  type WasteItem,
} from "@/hooks/useDailyReport";

const REASONS = ["Utgångsdatum", "Kvalitet", "Skadad", "Annat"];
const DEVIATIONS = ["Sjukdom", "Extra personal", "Utbildning"];

type StaffRow = { active: boolean; start: string; end: string };

function num(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function hoursBetween(start: string, end: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((x) => !Number.isFinite(x))) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return mins / 60;
}

export default function DailyReport() {
  const date = todayIso();
  const { activeStoreId, activeStoreName } = useSite();
  const { switchTab } = useTabs();
  const { staff: me } = useStaffAuth();
  const { data: staffList = [] } = useStaff(activeStoreId || undefined);
  const { data: existing, isLoading } = useDailyReport(activeStoreId, date);
  const save = useSaveDailyReport();

  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [receipts, setReceipts] = useState("");
  const [largest, setLargest] = useState("");
  const [staffRows, setStaffRows] = useState<Record<string, StaffRow>>({});
  const [deviations, setDeviations] = useState<string[]>([]);
  const [waste, setWaste] = useState<WasteItem[]>([]);
  const [comment, setComment] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (isLoading || hydrated) return;
    if (existing) {
      setGross(existing.gross_sales != null ? String(existing.gross_sales) : "");
      setNet(existing.net_sales != null ? String(existing.net_sales) : "");
      setReceipts(existing.receipt_count != null ? String(existing.receipt_count) : "");
      setLargest(existing.largest_sale != null ? String(existing.largest_sale) : "");
      const rows: Record<string, StaffRow> = {};
      (existing.staff_entries || []).forEach((e) => {
        rows[e.staff_id] = { active: true, start: e.start || "", end: e.end || "" };
      });
      setStaffRows(rows);
      setDeviations(
        (existing.staff_notes || "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => DEVIATIONS.includes(s)),
      );
      setWaste(existing.waste_items || []);
      setComment(existing.comment || "");
    }
    setHydrated(true);
  }, [existing, isLoading, hydrated]);

  const avgBasket = useMemo(() => {
    const g = num(gross);
    const r = num(receipts);
    if (!g || !r) return null;
    return g / r;
  }, [gross, receipts]);

  const totalHours = useMemo(
    () =>
      Object.values(staffRows).reduce(
        (sum, r) => sum + (r.active ? hoursBetween(r.start, r.end) : 0),
        0,
      ),
    [staffRows],
  );

  const wasteWeight = waste.reduce((s, w) => s + (w.weight_kg || 0), 0);
  const wasteValue = waste.reduce((s, w) => s + (w.value_sek || 0), 0);
  const wastePct = useMemo(() => {
    const n = num(net);
    if (!n) return null;
    return (wasteValue / n) * 100;
  }, [net, wasteValue]);

  const setRow = (id: string, patch: Partial<StaffRow>) =>
    setStaffRows((prev) => ({
      ...prev,
      [id]: { active: false, start: "", end: "", ...prev[id], ...patch },
    }));

  const missing = useMemo(() => {
    const m = {
      gross: num(gross) == null,
      net: num(net) == null,
      receipts: num(receipts) == null,
      largest: num(largest) == null,
      staffTimes: Object.values(staffRows).some((r) => r.active && (!r.start || !r.end)),
    };
    return { ...m, any: Object.values(m).some(Boolean) };
  }, [gross, net, receipts, largest, staffRows]);

  const errCls = (bad: boolean) =>
    showErrors && bad ? "border-destructive ring-1 ring-destructive/40" : "";

  const handleSave = async () => {
    if (!activeStoreId) {
      toast.error("Ingen butik vald");
      return;
    }
    if (missing.any) {
      setShowErrors(true);
      toast.error("Fyll i alla obligatoriska fält innan du avslutar dagsrapporten");
      return;
    }
    try {
      await save.mutateAsync({
        ...(existing?.id ? { id: existing.id } : {}),
        store_id: activeStoreId,
        report_date: date,
        gross_sales: num(gross),
        net_sales: num(net),
        receipt_count: num(receipts) != null ? Math.round(num(receipts)!) : null,
        largest_sale: num(largest),
        staff_entries: Object.entries(staffRows)
          .filter(([, r]) => r.active)
          .map(([staff_id, r]) => ({ staff_id, start: r.start, end: r.end })),
        staff_notes: deviations.join(", "),
        waste_items: waste.filter((w) => w.item.trim() !== ""),
        comment: comment.trim() || null,
        created_by: me ? `${me.first_name} ${me.last_name}` : null,
      });
      toast.success("Dagsrapport sparad");
      switchTab("/organisation");
    } catch (e: any) {
      toast.error(e.message || "Kunde inte spara dagsrapporten");
    }
  };

  return (
    <div className="pb-24">
      <div className="space-y-1 mb-4">
        <p className="text-xs text-muted-foreground">
          Hem › Rapporter › Dagsrapport
        </p>
        <h1 className="font-heading text-xl md:text-2xl text-foreground flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          {existing ? "Dagsrapport" : "Ny dagsrapport"} — {formatWeekdayDate(date)}
        </h1>
        <p className="text-sm text-muted-foreground">
          Fyll i dagens försäljning, personal och svinn.
          {activeStoreName ? ` (${activeStoreName})` : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Laddar…
        </div>
      ) : (
        <div className="space-y-4">
          {/* Försäljning */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Försäljning</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 max-w-md">
              <div className="space-y-1">
                <Label className="text-xs">Bruttoförsäljning (kr) *</Label>
                <Input
                  className={cn("font-mono tabular-nums", errCls(missing.gross))}
                  inputMode="decimal"
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nettoförsäljning (kr) *</Label>
                <Input
                  className={cn("font-mono tabular-nums", errCls(missing.net))}
                  inputMode="decimal"
                  value={net}
                  onChange={(e) => setNet(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Antal kvitton *</Label>
                <Input
                  className={cn("font-mono tabular-nums", errCls(missing.receipts))}
                  inputMode="numeric"
                  value={receipts}
                  onChange={(e) => setReceipts(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Snittköp (kr)</Label>
                <Input
                  readOnly
                  className="font-mono tabular-nums bg-muted/50"
                  value={avgBasket != null ? avgBasket.toFixed(2) : ""}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Största försäljning (kr) *</Label>
                <Input
                  className={cn("font-mono tabular-nums", errCls(missing.largest))}
                  inputMode="decimal"
                  value={largest}
                  onChange={(e) => setLargest(e.target.value)}
                />
              </div>
              {showErrors && (missing.gross || missing.net || missing.receipts || missing.largest) && (
                <p className="text-xs text-destructive">Fälten märkta * måste fyllas i.</p>
              )}
            </CardContent>
          </Card>

          {/* Personal */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Personal som arbetade</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {staffList.length === 0 && (
                <p className="text-sm text-muted-foreground">Ingen personal registrerad för butiken.</p>
              )}
              <div className="divide-y divide-border">
                {staffList.map((s) => {
                  const row = staffRows[s.id] || { active: false, start: "", end: "" };
                  return (
                    <div key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                      <Switch
                        checked={row.active}
                        onCheckedChange={(v) => setRow(s.id, { active: v })}
                      />
                      <span className="text-sm text-foreground min-w-[9rem]">
                        {s.first_name} {s.last_name}
                      </span>
                      {row.active && (
                        <div className="flex items-center gap-2">
                          <Input
                            type="time"
                            className={cn("w-28 font-mono", errCls(!row.start))}
                            value={row.start}
                            onChange={(e) => setRow(s.id, { start: e.target.value })}
                          />
                          <span className="text-muted-foreground text-xs">–</span>
                          <Input
                            type="time"
                            className={cn("w-28 font-mono", errCls(!row.end))}
                            value={row.end}
                            onChange={(e) => setRow(s.id, { end: e.target.value })}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {DEVIATIONS.map((d) => {
                  const on = deviations.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() =>
                        setDeviations((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d]))
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs transition-colors",
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 inline-block">
                <p className="text-[11px] text-muted-foreground">Totalt arbetade timmar</p>
                <p className="font-mono tabular-nums text-lg text-foreground">{totalHours.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>

          {/* Svinn */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Svinn / Kastade varor</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2 font-medium">Vara</th>
                      <th className="py-1 pr-2 font-medium">Vikt (kg)</th>
                      <th className="py-1 pr-2 font-medium">Värde (kr)</th>
                      <th className="py-1 pr-2 font-medium">Anledning</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {waste.map((w, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1.5 pr-2">
                          <Input
                            value={w.item}
                            onChange={(e) =>
                              setWaste((prev) => prev.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)))
                            }
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            className="w-24 font-mono tabular-nums"
                            inputMode="decimal"
                            value={w.weight_kg ?? ""}
                            onChange={(e) =>
                              setWaste((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, weight_kg: num(e.target.value) } : x)),
                              )
                            }
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            className="w-24 font-mono tabular-nums"
                            inputMode="decimal"
                            value={w.value_sek ?? ""}
                            onChange={(e) =>
                              setWaste((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, value_sek: num(e.target.value) } : x)),
                              )
                            }
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Select
                            value={w.reason || undefined}
                            onValueChange={(v) =>
                              setWaste((prev) => prev.map((x, j) => (j === i ? { ...x, reason: v } : x)))
                            }
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Välj" />
                            </SelectTrigger>
                            <SelectContent>
                              {REASONS.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {r}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setWaste((prev) => prev.filter((_, j) => j !== i))}
                          >
                            <Trash2 className="h-4 w-4 mr-1" /> Ta bort
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setWaste((prev) => [...prev, { item: "", weight_kg: null, value_sek: null, reason: "" }])
                }
              >
                <Plus className="h-4 w-4 mr-1" /> Lägg till vara
              </Button>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Total vikt (kg)</p>
                  <p className="font-mono tabular-nums text-lg text-foreground">{wasteWeight.toFixed(2)}</p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Totalt värde (kr)</p>
                  <p className="font-mono tabular-nums text-lg text-foreground">
                    {wasteValue.toLocaleString("sv-SE", { maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Svinn %</p>
                  <p className="font-mono tabular-nums text-lg text-foreground">
                    {wastePct != null ? `${wastePct.toFixed(2)} %` : "–"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Kommentar */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Dagens kommentar</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Fritext om dagen…"
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-4 mt-4 border-t border-border bg-background/95 px-4 py-3 backdrop-blur flex justify-end gap-2">
        <Button variant="outline" onClick={() => switchTab("/organisation")}>
          Avbryt
        </Button>
        <Button
          onClick={handleSave}
          disabled={save.isPending}
          variant={showErrors && missing.any ? "destructive" : "default"}
        >
          {save.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
          Spara dagsrapport
        </Button>
      </div>
    </div>
  );
}
