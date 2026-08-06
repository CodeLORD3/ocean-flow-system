import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  DIFF_REASONS,
  DIFF_THRESHOLD_KG,
  DIFF_THRESHOLD_VALUE,
  buildLines,
  closeSheet,
  diffOf,
  diffValueOf,
  expectedOf,
  loadSheet,
  needsReason,
  saveDraft,
  sortLines,
  todayStockholm,
  totalsOf,
  type DailySheetLine,
} from "@/lib/dailySheet";
import { generateDailySheetPdf } from "@/lib/dailySheetPdf";
import {
  CalendarDays,
  CheckCircle2,
  Lock,
  Printer,
  RefreshCw,
  Save,
  ScrollText,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  storeName?: string | null;
  locations: any[];
  currency?: string;
}

const dec = (n: number | null, d = 1) =>
  n === null || n === undefined
    ? "–"
    : Number(n).toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });

const parseNum = (v: string) => {
  const s = String(v).replace(",", ".").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export default function DailySheetDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  locations,
  currency = "kr",
}: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [sheetDate, setSheetDate] = useState(todayStockholm());
  const [locationId, setLocationId] = useState("");
  const [mode, setMode] = useState<"digital" | "papper">("digital");
  const [status, setStatus] = useState<"utkast" | "godkand">("utkast");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [openedBy, setOpenedBy] = useState("");
  const [closedBy, setClosedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DailySheetLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flagMissing, setFlagMissing] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  /** Lagerplatser för butiken — försäljningslager först. */
  const storeLocations = useMemo(() => {
    const list = (locations || []).filter((l: any) => l.store_id === storeId);
    return list.sort(
      (a: any, b: any) =>
        Number(String(b.name).toLowerCase().includes("försäljning")) -
          Number(String(a.name).toLowerCase().includes("försäljning")) ||
        String(a.name).localeCompare(String(b.name), "sv"),
    );
  }, [locations, storeId]);

  const activeLocation = storeLocations.find((l: any) => l.id === locationId);

  /** Valt lager + underlager. */
  const scopeIds = useMemo(() => {
    if (!locationId) return [];
    const kids = (locations || [])
      .filter((l: any) => l.parent_location_id === locationId)
      .map((l: any) => l.id);
    const grandKids = (locations || [])
      .filter((l: any) => kids.includes(l.parent_location_id))
      .map((l: any) => l.id);
    return [locationId, ...kids, ...grandKids];
  }, [locations, locationId]);

  useEffect(() => {
    if (!open) return;
    setSheetDate(todayStockholm());
    setFlagMissing(false);
    if (!locationId && storeLocations.length) setLocationId(storeLocations[0].id);
  }, [open, storeLocations]);

  const loadHistory = async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from("daily_stock_sheets")
      .select("*")
      .eq("store_id", storeId)
      .order("sheet_date", { ascending: false })
      .limit(14);
    setHistory(data || []);
  };

  /** Läser in dagen: befintlig rapport eller nytt underlag från huvudboken. */
  const load = async (opts?: { refreshLedger?: boolean }) => {
    if (!storeId || !locationId || !scopeIds.length) return;
    setLoading(true);
    try {
      const existing = await loadSheet(storeId, locationId, sheetDate);
      const fresh = await buildLines({ storeId, locationId, locationIds: scopeIds, sheetDate });

      if (existing && !opts?.refreshLedger) {
        setSheetId(existing.id);
        setStatus(existing.status);
        setMode(existing.mode);
        setOpenedBy(existing.openedBy || "");
        setClosedBy(existing.closedBy || "");
        setNotes(existing.notes || "");
        setLines(existing.lines);
      } else if (existing) {
        // Behåll räknade värden, uppdatera systemkolumnerna
        const byProduct = new Map(existing.lines.map((l) => [l.productId, l]));
        const merged = fresh.map((f) => {
          const prev = byProduct.get(f.productId);
          return prev
            ? { ...f, counted: prev.counted, checked: prev.checked, reason: prev.reason, note: prev.note }
            : f;
        });
        const extras = existing.lines.filter((l) => !fresh.some((f) => f.productId === l.productId));
        setSheetId(existing.id);
        setStatus(existing.status);
        setLines(sortLines([...merged, ...extras]));
      } else {
        setSheetId(null);
        setStatus("utkast");
        setClosedBy("");
        setNotes("");
        setLines(fresh);
      }
      loadHistory();
    } catch (e: any) {
      toast({ title: "Kunde inte läsa in dagen", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && locationId && scopeIds.length) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, locationId, sheetDate]);

  const locked = status === "godkand";
  const totals = totalsOf(lines);

  const setLine = (productId: string, patch: Partial<DailySheetLine>) =>
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));

  const grouped = useMemo(() => {
    const map = new Map<string, DailySheetLine[]>();
    lines.forEach((l) => {
      const c = l.category || "Övrigt";
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(l);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, "sv"));
  }, [lines]);

  const baseArgs = () => ({
    sheetId,
    storeId,
    locationId,
    locationName: activeLocation?.name || "",
    sheetDate,
    mode,
    openedBy,
    notes,
    lines,
  });

  const handleSave = async () => {
    setBusy(true);
    try {
      const id = await saveDraft(baseArgs());
      setSheetId(id);
      toast({ title: "Utkast sparat", description: `${totals.countedCount} av ${totals.lineCount} rader räknade.` });
      loadHistory();
    } catch (e: any) {
      toast({ title: "Kunde inte spara", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    if (totals.countedCount === 0) {
      toast({ title: "Inget räknat", description: "Fyll i räknat utgående lager först.", variant: "destructive" });
      return;
    }
    if (totals.missingReasons > 0 || totals.unchecked > 0) {
      setFlagMissing(true);
      toast({
        title: "Dagen kan inte godkännas",
        description: `${totals.unchecked} okontrollerade rader och ${totals.missingReasons} differenser utan orsak.`,
        variant: "destructive",
      });
      return;
    }
    if (!closedBy.trim()) {
      toast({ title: "Ange vem som räknat", description: "Namnet signerar dagen.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const id = await closeSheet({ ...baseArgs(), closedBy: closedBy.trim() });
      setSheetId(id);
      setStatus("godkand");
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      toast({
        title: "Dagen godkänd och låst",
        description: `Utgående lager ${dec(totals.countedQty)} kg · differens ${dec(totals.diffKg)} kg.`,
      });
      loadHistory();
    } catch (e: any) {
      toast({ title: "Kunde inte godkänna", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const printWorksheet = () =>
    generateDailySheetPdf({
      storeName,
      locationName: activeLocation?.name,
      sheetDate,
      openedBy,
      notes,
      lines,
      variant: "arbetsblad",
      currency,
    });

  const printFinal = () =>
    generateDailySheetPdf({
      storeName,
      locationName: activeLocation?.name,
      sheetDate,
      openedBy,
      closedBy,
      notes,
      lines,
      variant: "slutrapport",
      currency,
    });

  const openHistoric = async (row: any) => {
    setLocationId(row.location_id);
    setSheetDate(row.sheet_date);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[97vw] xl:max-w-[1500px]">
        <DialogHeader>
          <DialogTitle className="font-heading flex items-center gap-2 text-lg">
            <ScrollText className="h-5 w-5 text-primary" /> Dagsavstämning lager
            {locked && (
              <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
                <Lock className="h-3 w-3" /> Godkänd
              </Badge>
            )}
            {!locked && sheetId && <Badge variant="secondary">Utkast</Badge>}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Ingående lager och inleveranser fylls i automatiskt. Räkna bara utgående lager vid stängning —
            orsak krävs vid differens över {DIFF_THRESHOLD_KG} kg eller {DIFF_THRESHOLD_VALUE} {currency}.
          </DialogDescription>
        </DialogHeader>

        {/* Topprad */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 rounded-md border border-border p-3">
          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="date"
              value={sheetDate}
              onChange={(e) => setSheetDate(e.target.value)}
              className="h-8 text-xs font-normal"
            />
          </label>
          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
            Lager:
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs font-normal"
            >
              {storeLocations.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-1">
            {(["digital", "papper"] as const).map((m) => (
              <button
                key={m}
                disabled={locked}
                onClick={() => setMode(m)}
                className={`flex-1 rounded px-2 py-1 text-xs font-semibold transition-colors ${
                  mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {m === "digital" ? "Räknas digitalt" : "Räknas på papper"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide">
            Räknad av:
            <Input
              value={closedBy}
              onChange={(e) => setClosedBy(e.target.value)}
              disabled={locked}
              placeholder="Namn"
              className="h-8 text-xs font-normal"
            />
          </label>
        </div>

        {/* Verktygsrad */}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => load({ refreshLedger: true })} disabled={loading || locked}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} /> Uppdatera från systemet
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={printWorksheet} disabled={!lines.length}>
            <Printer className="h-3 w-3" /> Skriv ut arbetsblad
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={printFinal} disabled={!lines.length}>
            <Printer className="h-3 w-3" /> Skriv ut slutrapport
          </Button>
          <div className="flex-1" />
          {!locked && (
            <>
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleSave} disabled={busy}>
                <Save className="h-3 w-3" /> Spara utkast
              </Button>
              <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleClose} disabled={busy}>
                <CheckCircle2 className="h-3 w-3" /> Godkänn dagen
              </Button>
            </>
          )}
        </div>

        {/* Tabell */}
        <div className="max-h-[46vh] overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="[&>th]:px-2 [&>th]:py-1.5 [&>th]:text-center [&>th]:text-[10px] [&>th]:uppercase [&>th]:leading-tight [&>th]:tracking-wide [&>th]:text-muted-foreground">
                <th className="w-8">Nr</th>
                <th className="text-left">Produkt</th>
                <th className="w-20">Ing. lager<br />kg</th>
                <th className="w-20">Inlev.<br />i dag kg</th>
                <th className="w-20">Övrigt<br />kg</th>
                <th className="w-20">Sålt kassa<br />kg</th>
                <th className="w-20">Förväntat<br />kg</th>
                <th className="w-24 text-primary">Räknat<br />(stängning)</th>
                <th className="w-12">Kontr.</th>
                <th className="w-20">Diff kg</th>
                <th className="w-20">Diff {currency}</th>
                <th className="w-40">Orsak</th>
                <th className="w-40">Kommentar</th>
              </tr>
            </thead>
            <tbody>
              {!lines.length && (
                <tr>
                  <td colSpan={13} className="p-8 text-center text-muted-foreground">
                    {loading ? "Läser in dagen…" : "Inga produkter med saldo i det här lagret."}
                  </td>
                </tr>
              )}
              {grouped.map(([cat, catLines]) => (
                <Fragment key={`cat-${cat}`}>
                  <tr className="bg-primary/5">
                    <td colSpan={13} className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide">
                      {cat}
                    </td>
                  </tr>
                  {catLines.map((l, i) => {
                    const d = diffOf(l);
                    const dv = diffValueOf(l);
                    const reasonRequired = needsReason(l) && !l.reason;
                    const flagRow = flagMissing && (!l.checked || reasonRequired);
                    return (
                      <tr
                        key={l.productId}
                        className={`border-t border-border/50 ${flagRow ? "bg-destructive/10" : ""}`}
                      >
                        <td className="px-2 text-center text-[10px] tabular-nums text-muted-foreground">
                          {i + 1}
                        </td>
                        <td className="px-2 py-1">{l.productName}</td>
                        <td className="px-2 text-right font-mono tabular-nums text-muted-foreground">{dec(l.opening)}</td>
                        <td className="px-2 text-right font-mono tabular-nums text-muted-foreground">{l.received ? dec(l.received) : "–"}</td>
                        <td className="px-2 text-right font-mono tabular-nums text-muted-foreground">{l.other ? dec(l.other) : "–"}</td>
                        <td className="px-2 text-right font-mono tabular-nums text-muted-foreground">{l.salesBooked ? dec(l.salesBooked) : "–"}</td>
                        <td className="px-2 text-right font-mono tabular-nums font-semibold">{dec(expectedOf(l))}</td>
                        <td className="px-1 py-0.5">
                          <Input
                            value={l.counted === null ? "" : String(l.counted).replace(".", ",")}
                            onChange={(e) => setLine(l.productId, { counted: parseNum(e.target.value) })}
                            disabled={locked}
                            inputMode="decimal"
                            placeholder="–"
                            className="h-7 text-right font-mono text-xs tabular-nums"
                          />
                        </td>
                        <td className="text-center">
                          <Checkbox
                            checked={l.checked}
                            disabled={locked}
                            onCheckedChange={(v) => setLine(l.productId, { checked: !!v })}
                          />
                        </td>
                        <td
                          className={`px-2 text-right font-mono tabular-nums ${
                            d ? (d < 0 ? "text-destructive" : "text-emerald-600") : ""
                          }`}
                        >
                          {dec(d)}
                        </td>
                        <td className="px-2 text-right font-mono tabular-nums text-muted-foreground">
                          {dv === null ? "–" : dec(dv, 0)}
                        </td>
                        <td className="px-1 py-0.5">
                          {needsReason(l) || l.reason ? (
                            <select
                              value={l.reason || ""}
                              disabled={locked}
                              onChange={(e) => setLine(l.productId, { reason: e.target.value || null })}
                              className={`h-7 w-full rounded-md border bg-background px-1 text-xs ${
                                reasonRequired ? "border-destructive" : "border-input"
                              }`}
                            >
                              <option value="">Välj orsak…</option>
                              {DIFF_REASONS.map((r) => (
                                <option key={r.value} value={r.value}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="block text-center text-muted-foreground">–</span>
                          )}
                        </td>
                        <td className="px-1 py-0.5">
                          <Input
                            value={l.note || ""}
                            disabled={locked}
                            onChange={(e) => setLine(l.productId, { note: e.target.value || null })}
                            className="h-7 text-xs"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-muted/80 backdrop-blur">
              <tr className="border-t border-border font-semibold [&>td]:px-2 [&>td]:py-1.5">
                <td />
                <td className="text-[11px] uppercase">Summa</td>
                <td className="text-right font-mono tabular-nums">{dec(totals.opening)}</td>
                <td className="text-right font-mono tabular-nums">{dec(totals.received)}</td>
                <td className="text-right font-mono tabular-nums">{dec(totals.other)}</td>
                <td className="text-right font-mono tabular-nums">{dec(totals.salesBooked)}</td>
                <td />
                <td className="text-right font-mono tabular-nums">{dec(totals.countedQty)}</td>
                <td className="text-center text-[10px] text-muted-foreground">
                  {totals.lineCount - totals.unchecked}/{totals.lineCount}
                </td>
                <td className="text-right font-mono tabular-nums">{dec(totals.diffKg)}</td>
                <td className="text-right font-mono tabular-nums">{dec(totals.diffValue, 0)}</td>
                <td colSpan={2} className="text-right text-[11px]">
                  Lagervärde {dec(totals.closingValue, 0)} {currency} · Beräknad försäljning {dec(totals.sold)} kg
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <Textarea
              value={notes}
              disabled={locked}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Noteringar för dagen (leveransavvikelser, kassation, personal…)"
              className="min-h-[70px] text-xs"
            />
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              Senaste dagar
            </p>
            <div className="max-h-[70px] space-y-0.5 overflow-auto">
              {!history.length && <p className="text-xs text-muted-foreground">Inga rapporter än.</p>}
              {history.map((h) => (
                <button
                  key={h.id}
                  onClick={() => openHistoric(h)}
                  className="flex w-full items-center justify-between rounded px-1 py-0.5 text-xs hover:bg-muted"
                >
                  <span className="tabular-nums">{h.sheet_date}</span>
                  <span className="truncate px-2 text-muted-foreground">{h.location_name}</span>
                  <Badge variant={h.status === "godkand" ? "outline" : "secondary"} className="h-4 text-[9px]">
                    {h.status === "godkand" ? "Godkänd" : "Utkast"}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
