import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Loader2, Receipt, UserPlus, Clock } from "lucide-react";
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
import { useShiftsForDate, shiftTimeValue } from "@/hooks/useStaffShifts";
import {
  useDailyReport,
  useSaveDailyReport,
  todayIso,
  formatWeekdayDate,
  type WasteItem,
} from "@/hooks/useDailyReport";

const REASONS = ["Utgångsdatum", "Kvalitet", "Skadad", "Annat"];
const DEVIATIONS = [
  { value: "none", label: "Ingen avvikelse" },
  { value: "Sjukdom", label: "Sjukdom" },
  { value: "Extra personal", label: "Extra personal" },
  { value: "Utbildning", label: "Utbildning" },
];

type StaffRow = {
  active: boolean;
  start: string;
  end: string;
  deviation: string;
  note: string;
};

const emptyRow: StaffRow = { active: false, start: "", end: "", deviation: "none", note: "" };

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
  const { data: storeStaff = [] } = useStaff(activeStoreId || undefined);
  const { data: allStaff = [] } = useStaff();
  const { data: shifts = [] } = useShiftsForDate(activeStoreId, date);
  const { data: existing, isLoading } = useDailyReport(activeStoreId, date);
  const save = useSaveDailyReport();

  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [receipts, setReceipts] = useState("");
  const [largest, setLargest] = useState("");
  const [staffRows, setStaffRows] = useState<Record<string, StaffRow>>({});
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [waste, setWaste] = useState<WasteItem[]>([]);
  const [comment, setComment] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Nollställ formuläret när butik eller datum byts — inget följer med mellan butiker.
  const scopeKey = `${activeStoreId ?? ""}|${date}`;
  const scopeRef = useRef(scopeKey);
  useEffect(() => {
    if (scopeRef.current === scopeKey) return;
    scopeRef.current = scopeKey;
    setGross("");
    setNet("");
    setReceipts("");
    setLargest("");
    setStaffRows({});
    setExtraIds([]);
    setWaste([]);
    setComment("");
    setShowErrors(false);
    setHydrated(false);
  }, [scopeKey]);


  /** Enter hoppar till nästa fält istället för att skicka formuläret. */
  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "TEXTAREA") return;
    if (!(target instanceof HTMLInputElement)) return;
    e.preventDefault();
    const form = formRef.current;
    if (!form) return;
    const fields = Array.from(
      form.querySelectorAll<HTMLInputElement>("input"),
    ).filter((el) => !el.disabled && !el.readOnly && el.type !== "hidden" && el.offsetParent !== null);
    const i = fields.indexOf(target);
    const next = fields[i + 1];
    if (next) {
      next.focus();
      next.select?.();
    } else {
      target.blur();
    }
  };

  // Personer som visas: butikens personal + instämplade + tillagda + de i sparad rapport
  const shiftByStaff = useMemo(() => {
    const m = new Map<string, { start: string; end: string }>();
    shifts.forEach((s) => {
      m.set(s.staff_id, {
        start: shiftTimeValue(s.clocked_in_at),
        end: shiftTimeValue(s.clocked_out_at),
      });
    });
    return m;
  }, [shifts]);

  const listedStaff = useMemo(() => {
    const ids = new Set<string>([
      ...storeStaff.map((s) => s.id),
      ...shifts.map((s) => s.staff_id),
      ...extraIds,
      ...Object.keys(staffRows),
    ]);
    return allStaff
      .filter((s) => ids.has(s.id))
      .sort((a, b) => a.first_name.localeCompare(b.first_name, "sv"));
  }, [storeStaff, shifts, extraIds, staffRows, allStaff]);

  const addableStaff = useMemo(
    () => allStaff.filter((s) => !listedStaff.some((l) => l.id === s.id)),
    [allStaff, listedStaff],
  );

  useEffect(() => {
    if (isLoading || hydrated) return;
    if (existing) {
      setGross(existing.gross_sales != null ? String(existing.gross_sales) : "");
      setNet(existing.net_sales != null ? String(existing.net_sales) : "");
      setReceipts(existing.receipt_count != null ? String(existing.receipt_count) : "");
      setLargest(existing.largest_sale != null ? String(existing.largest_sale) : "");
      const rows: Record<string, StaffRow> = {};
      (existing.staff_entries || []).forEach((e) => {
        rows[e.staff_id] = {
          active: true,
          start: e.start || "",
          end: e.end || "",
          deviation: e.deviation || "none",
          note: e.deviation_note || "",
        };
      });
      setStaffRows(rows);
      setWaste(existing.waste_items || []);
      setComment(existing.comment || "");
    }
    setHydrated(true);
  }, [existing, isLoading, hydrated]);

  // Förifyll instämplingstider som grund där inget är ifyllt
  useEffect(() => {
    if (!hydrated || shiftByStaff.size === 0) return;
    setStaffRows((prev) => {
      const next = { ...prev };
      let changed = false;
      shiftByStaff.forEach((t, staffId) => {
        const cur = next[staffId];
        if (!cur) {
          next[staffId] = { ...emptyRow, active: true, start: t.start, end: t.end };
          changed = true;
        } else if (!cur.start && t.start) {
          next[staffId] = { ...cur, active: true, start: t.start, end: cur.end || t.end };
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [hydrated, shiftByStaff]);

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
      [id]: { ...emptyRow, ...prev[id], ...patch },
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

  const staffName = (id: string) => {
    const s = allStaff.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name}` : "";
  };

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
      const entries = Object.entries(staffRows).filter(
        ([, r]) => r.active || r.deviation !== "none",
      );
      await save.mutateAsync({
        ...(existing?.id ? { id: existing.id } : {}),
        store_id: activeStoreId,
        report_date: date,
        gross_sales: num(gross),
        net_sales: num(net),
        receipt_count: num(receipts) != null ? Math.round(num(receipts)!) : null,
        largest_sale: num(largest),
        staff_entries: entries.map(([staff_id, r]) => ({
          staff_id,
          start: r.active ? r.start : "",
          end: r.active ? r.end : "",
          ...(r.deviation !== "none" ? { deviation: r.deviation } : {}),
          ...(r.note.trim() ? { deviation_note: r.note.trim() } : {}),
        })),
        staff_notes:
          entries
            .filter(([, r]) => r.deviation !== "none")
            .map(
              ([id, r]) =>
                `${staffName(id)}: ${r.deviation}${r.note.trim() ? ` (${r.note.trim()})` : ""}`,
            )
            .join(", ") || null,
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
        <p className="text-xs text-muted-foreground">Hem › Rapporter › Dagsrapport</p>
        <h1 className="font-heading text-xl md:text-2xl text-foreground flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          {existing ? "Dagsrapport" : "Ny dagsrapport"} — {formatWeekdayDate(date)}
        </h1>
        <p className="text-sm text-muted-foreground">
          Fyll i dagens försäljning, personal och svinn. Tryck Enter för att hoppa till nästa fält.
          {activeStoreName ? ` (${activeStoreName})` : ""}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Laddar…
        </div>
      ) : (
        <form
          ref={formRef}
          onSubmit={(e) => e.preventDefault()}
          onKeyDown={handleFormKeyDown}
          className="space-y-4"
        >
          {/* Försäljning */}
          <Card className="shadow-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-heading">Försäljning</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 max-w-md">
              <div className="space-y-1">
                <Label className="text-xs">Bruttoförsäljning (kr) *</Label>
                <Input
                  className={cn("h-11 text-base font-mono tabular-nums", errCls(missing.gross))}
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nettoförsäljning (kr) *</Label>
                <Input
                  className={cn("h-11 text-base font-mono tabular-nums", errCls(missing.net))}
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={net}
                  onChange={(e) => setNet(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Antal kvitton *</Label>
                <Input
                  className={cn("h-11 text-base font-mono tabular-nums", errCls(missing.receipts))}
                  inputMode="numeric"
                  enterKeyHint="next"
                  autoComplete="off"
                  value={receipts}
                  onChange={(e) => setReceipts(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Snittköp (kr)</Label>
                <Input
                  readOnly
                  tabIndex={-1}
                  className="h-11 text-base font-mono tabular-nums bg-muted/50"
                  value={avgBasket != null ? avgBasket.toFixed(2) : ""}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Största försäljning (kr) *</Label>
                <Input
                  className={cn("h-11 text-base font-mono tabular-nums", errCls(missing.largest))}
                  inputMode="decimal"
                  enterKeyHint="next"
                  autoComplete="off"
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
              {listedStaff.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Ingen personal registrerad för butiken.
                </p>
              )}
              <div className="divide-y divide-border">
                {listedStaff.map((s) => {
                  const row = staffRows[s.id] || emptyRow;
                  const stamped = shiftByStaff.get(s.id);
                  return (
                    <div key={s.id} className="py-2.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <Switch
                          checked={row.active}
                          onCheckedChange={(v) => setRow(s.id, { active: v })}
                        />
                        <span className="text-sm text-foreground min-w-[9rem]">
                          {s.first_name} {s.last_name}
                        </span>
                        {stamped && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Stämplad {stamped.start || "–"}
                            {stamped.end ? `–${stamped.end}` : " (pågår)"}
                          </span>
                        )}
                        {row.active && (
                          <div className="flex items-center gap-2">
                            <Input
                              type="time"
                              enterKeyHint="next"
                              className={cn("w-28 h-11 text-base font-mono", errCls(!row.start))}
                              value={row.start}
                              onChange={(e) => setRow(s.id, { start: e.target.value })}
                            />
                            <span className="text-muted-foreground text-xs">–</span>
                            <Input
                              type="time"
                              enterKeyHint="next"
                              className={cn("w-28 h-11 text-base font-mono", errCls(!row.end))}
                              value={row.end}
                              onChange={(e) => setRow(s.id, { end: e.target.value })}
                            />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 pl-11">
                        <Select
                          value={row.deviation}
                          onValueChange={(v) => setRow(s.id, { deviation: v })}
                        >
                          <SelectTrigger className="w-44 h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {DEVIATIONS.map((d) => (
                              <SelectItem key={d.value} value={d.value}>
                                {d.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {row.deviation !== "none" && (
                          <Input
                            className="h-9 text-base flex-1 min-w-[10rem]"
                            enterKeyHint="next"
                            placeholder={`Anledning / kommentar (${row.deviation.toLowerCase()})`}
                            value={row.note}
                            onChange={(e) => setRow(s.id, { note: e.target.value })}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {addableStaff.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value=""
                    onValueChange={(id) => {
                      setExtraIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                      setRow(id, { active: true, deviation: "Extra personal" });
                    }}
                  >
                    <SelectTrigger className="w-64 h-9">
                      <SelectValue placeholder="Lägg till person från systemet" />
                    </SelectTrigger>
                    <SelectContent>
                      {addableStaff.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.first_name} {s.last_name}
                          {s.stores?.name ? ` — ${s.stores.name}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 inline-block">
                <p className="text-[11px] text-muted-foreground">Totalt arbetade timmar</p>
                <p className="font-mono tabular-nums text-lg text-foreground">
                  {totalHours.toFixed(2)}
                </p>
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
                            className="h-11 text-base"
                            enterKeyHint="next"
                            value={w.item}
                            onChange={(e) =>
                              setWaste((prev) =>
                                prev.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)),
                              )
                            }
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            className="w-24 h-11 text-base font-mono tabular-nums"
                            inputMode="decimal"
                            enterKeyHint="next"
                            value={w.weight_kg ?? ""}
                            onChange={(e) =>
                              setWaste((prev) =>
                                prev.map((x, j) =>
                                  j === i ? { ...x, weight_kg: num(e.target.value) } : x,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            className="w-24 h-11 text-base font-mono tabular-nums"
                            inputMode="decimal"
                            enterKeyHint="next"
                            value={w.value_sek ?? ""}
                            onChange={(e) =>
                              setWaste((prev) =>
                                prev.map((x, j) =>
                                  j === i ? { ...x, value_sek: num(e.target.value) } : x,
                                ),
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
                            type="button"
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
                type="button"
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
                  <p className="font-mono tabular-nums text-lg text-foreground">
                    {wasteWeight.toFixed(2)}
                  </p>
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
                className="text-base"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Fritext om dagen…"
              />
            </CardContent>
          </Card>
        </form>
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
