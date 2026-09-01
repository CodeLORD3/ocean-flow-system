import { useEffect, useMemo, useState } from "react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStores } from "@/hooks/useStores";
import { useStaff } from "@/hooks/useStaff";
import { useActorNames } from "@/hooks/useActorNames";
import { EDIT_FIELD_LABELS, useAllDailyReportEdits, useDailyReportEdits } from "@/hooks/useMonthlyReports";
import {
  formatWeekdayDate,
  type DailyReport,
  type StaffEntry,
  type WasteItem,
  useUpdateDailyReport,
} from "@/hooks/useDailyReport";
import {
  ChevronDown,
  ChevronRight,
  Edit3,
  FileText,
  Loader2,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function useAllDailyReports() {
  return useQuery({
    queryKey: ["daily-reports", "all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("daily_reports")
        .select("*")
        .order("report_date", { ascending: false })
        .limit(400);
      if (error) throw error;
      return (data ?? []) as DailyReport[];
    },
  });
}

const nf = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("sv-SE", { maximumFractionDigits: 0 });

const parseNumber = (value: string) => {
  if (value.trim() === "") return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};

function hours(start?: string, end?: string) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff > 0 ? diff / 60 : 0;
}

function totalHours(entries: StaffEntry[]) {
  return entries.reduce((total, entry) => total + hours(entry.start, entry.end), 0);
}

function Metric({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-md border border-border/70 bg-background/70 px-3 py-2.5", emphasis && "border-primary/30 bg-primary/5")}>
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono tabular-nums text-sm", emphasis && "text-primary")}>{value}</p>
    </div>
  );
}

type DraftReport = {
  gross_sales: string;
  net_sales: string;
  receipt_count: string;
  largest_sale: string;
  staff_entries: StaffEntry[];
  staff_notes: string;
  waste_items: WasteItem[];
  comment: string;
};

function draftFromReport(report: DailyReport): DraftReport {
  return {
    gross_sales: report.gross_sales == null ? "" : String(report.gross_sales),
    net_sales: report.net_sales == null ? "" : String(report.net_sales),
    receipt_count: report.receipt_count == null ? "" : String(report.receipt_count),
    largest_sale: report.largest_sale == null ? "" : String(report.largest_sale),
    staff_entries: (report.staff_entries ?? []).map((entry) => ({ ...entry })),
    staff_notes: report.staff_notes ?? "",
    waste_items: (report.waste_items ?? []).map((item) => ({ ...item })),
    comment: report.comment ?? "",
  };
}

function StaffDraftRows({
  entries,
  onChange,
  nameOf,
}: {
  entries: StaffEntry[];
  onChange: (entries: StaffEntry[]) => void;
  nameOf: (id: string) => string;
}) {
  const update = (index: number, patch: Partial<StaffEntry>) => {
    onChange(entries.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)));
  };

  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Ingen personal är registrerad i rapporten.</p>
      ) : (
        entries.map((entry, index) => (
          <div key={`${entry.staff_id}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-end gap-2 rounded-md border bg-background p-2">
            <div className="min-w-0">
              <Label className="text-[10px] text-muted-foreground">Personal</Label>
              <p className="truncate pt-2 text-sm font-medium">{nameOf(entry.staff_id) || "Personal"}</p>
            </div>
            <div>
              <Label htmlFor={`start-${index}`} className="text-[10px] text-muted-foreground">Start</Label>
              <Input id={`start-${index}`} type="time" value={entry.start || ""} onChange={(event) => update(index, { start: event.target.value })} className="mt-1 h-9 w-[105px] text-sm" />
            </div>
            <div>
              <Label htmlFor={`end-${index}`} className="text-[10px] text-muted-foreground">Slut</Label>
              <Input id={`end-${index}`} type="time" value={entry.end || ""} onChange={(event) => update(index, { end: event.target.value })} className="mt-1 h-9 w-[105px] text-sm" />
            </div>
            <Button type="button" variant="ghost" size="icon" aria-label={`Ta bort ${nameOf(entry.staff_id) || "personal"}`} onClick={() => onChange(entries.filter((_, entryIndex) => entryIndex !== index))} className="h-9 w-9 text-muted-foreground hover:text-destructive">
              <Trash2 />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

function WasteDraftRows({ items, onChange }: { items: WasteItem[]; onChange: (items: WasteItem[]) => void }) {
  const update = (index: number, patch: Partial<WasteItem>) => {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-[minmax(0,1fr)_90px_100px_auto] items-end gap-2 rounded-md border bg-background p-2">
          <div>
            <Label htmlFor={`waste-item-${index}`} className="text-[10px] text-muted-foreground">Vara</Label>
            <Input id={`waste-item-${index}`} value={item.item} onChange={(event) => update(index, { item: event.target.value })} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor={`waste-weight-${index}`} className="text-[10px] text-muted-foreground">Kg</Label>
            <Input id={`waste-weight-${index}`} inputMode="decimal" value={item.weight_kg ?? ""} onChange={(event) => update(index, { weight_kg: parseNumber(event.target.value) })} className="mt-1 h-9" />
          </div>
          <div>
            <Label htmlFor={`waste-value-${index}`} className="text-[10px] text-muted-foreground">Värde kr</Label>
            <Input id={`waste-value-${index}`} inputMode="decimal" value={item.value_sek ?? ""} onChange={(event) => update(index, { value_sek: parseNumber(event.target.value) })} className="mt-1 h-9" />
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Ta bort svinnrad" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} className="h-9 w-9 text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        </div>
      ))}
      {items.length === 0 && <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">Inget svinn är registrerat.</p>}
    </div>
  );
}

function EditDailyReportDialog({
  report,
  open,
  onOpenChange,
  nameOf,
}: {
  report: DailyReport | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nameOf: (id: string) => string;
}) {
  const updateReport = useUpdateDailyReport();
  const edits = useDailyReportEdits(report?.id);
  const [draft, setDraft] = useState<DraftReport | null>(null);

  useEffect(() => {
    if (open && report) setDraft(draftFromReport(report));
    if (!open) setDraft(null);
  }, [open, report]);

  const setField = <K extends keyof DraftReport>(field: K, value: DraftReport[K]) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const save = async () => {
    if (!report || !draft) return;
    const gross = parseNumber(draft.gross_sales);
    const net = parseNumber(draft.net_sales);
    const receipts = parseNumber(draft.receipt_count);
    const largest = parseNumber(draft.largest_sale);
    if (gross == null || net == null || receipts == null || largest == null || [gross, net, receipts, largest].some((value) => value < 0)) {
      toast.error("Fyll i giltiga, positiva försäljningssiffror innan du sparar");
      return;
    }
    if (!Number.isInteger(receipts)) {
      toast.error("Antal kvitton måste vara ett heltal");
      return;
    }
    try {
      await updateReport.mutateAsync({
        id: report.id,
        gross_sales: gross,
        net_sales: net,
        receipt_count: receipts,
        largest_sale: largest,
        staff_entries: draft.staff_entries,
        staff_notes: draft.staff_notes.trim() || null,
        waste_items: draft.waste_items.filter((item) => item.item.trim()),
        comment: draft.comment.trim() || null,
      });
      toast.success("Dagsrapporten är uppdaterad");
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte uppdatera dagsrapporten");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ändra dagsrapport</DialogTitle>
          <DialogDescription>
            {report ? `${formatWeekdayDate(report.report_date)} · ändringen sparas i samma rapport` : ""}
          </DialogDescription>
          {report && edits.data && edits.data.length > 0 && (
            <Badge variant="outline" className="w-fit border-warning/40 text-warning">Korrigerad tidigare · {edits.data.length} ändringar</Badge>
          )}
        </DialogHeader>
        {draft && report && (
          <div className="space-y-6 py-2">
            <section className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Försäljning</p>
                <p className="text-xs text-muted-foreground">Kontrollera siffrorna mot dagens underlag innan du sparar.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["gross_sales", "Bruttoförsäljning (kr)"],
                  ["net_sales", "Nettoförsäljning (kr)"],
                  ["receipt_count", "Antal kvitton"],
                  ["largest_sale", "Största köp (kr)"],
                ] as const).map(([field, label]) => (
                  <div key={field} className="space-y-1.5">
                    <Label htmlFor={`edit-${field}`}>{label}</Label>
                    <Input id={`edit-${field}`} value={draft[field]} onChange={(event) => setField(field, event.target.value)} inputMode="decimal" className="font-mono tabular-nums" />
                  </div>
                ))}
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Bemanning</p>
                  <p className="text-xs text-muted-foreground">Justera tider eller ta bort en felaktig rad.</p>
                </div>
                <span className="text-xs text-muted-foreground">Ändra pass och timmar</span>
              </div>
              <StaffDraftRows entries={draft.staff_entries} onChange={(entries) => setField("staff_entries", entries)} nameOf={nameOf} />
              <div className="space-y-1.5">
                <Label htmlFor="edit-staff-notes">Bemanningsanteckning</Label>
                <Textarea id="edit-staff-notes" value={draft.staff_notes} onChange={(event) => setField("staff_notes", event.target.value)} placeholder="Anteckning om bemanning" />
              </div>
            </section>

            <section className="space-y-3 border-t pt-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Svinn</p>
                  <p className="text-xs text-muted-foreground">Rätta vara, vikt och värde på befintliga rader.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setField("waste_items", [...draft.waste_items, { item: "", weight_kg: null, value_sek: null, reason: "" }])}>
                  <Plus /> Lägg till rad
                </Button>
              </div>
              <WasteDraftRows items={draft.waste_items} onChange={(items) => setField("waste_items", items)} />
            </section>

            <section className="space-y-1.5 border-t pt-5">
              <Label htmlFor="edit-comment">Dagens kommentar</Label>
              <Textarea id="edit-comment" value={draft.comment} onChange={(event) => setField("comment", event.target.value)} placeholder="Skriv en kommentar" />
            </section>
          </div>
        )}
        {edits.data && edits.data.length > 0 && (
          <section className="border-t pt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Ändringslogg</p>
                <p className="text-xs text-muted-foreground">Varje korrigering sparas med ursprungligt och nytt värde.</p>
              </div>
              <Badge variant="outline">{edits.data.length} ändringar</Badge>
            </div>
            <div className="max-h-48 divide-y overflow-y-auto rounded-md border bg-muted/10">
              {edits.data.map((edit) => (
                <div key={edit.id} className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)_120px] sm:items-start sm:gap-3">
                  <span className="font-medium">{EDIT_FIELD_LABELS[edit.field] ?? edit.field}</span>
                  <span className="break-words text-muted-foreground"><span className="mr-1 text-[10px] uppercase tracking-wide">Från</span>{edit.old_value ?? "—"}</span>
                  <span className="break-words"><span className="mr-1 text-[10px] uppercase tracking-wide text-primary">Till</span>{edit.new_value ?? "—"}</span>
                  <span className="text-muted-foreground">{nameOf(edit.changed_by) ?? "Okänd"}<br />{new Date(edit.changed_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button type="button" onClick={() => void save()} disabled={!draft || updateReport.isPending}>
            {updateReport.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {updateReport.isPending ? "Sparar…" : "Spara ändringar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DailyReportsArchive() {
  const { staff: currentStaff } = useStaffAuth();
  const { data: reports = [], isLoading } = useAllDailyReports();
  const { data: stores = [] } = useStores(true);
  const { data: staff = [] } = useStaff();
  const { nameOf } = useActorNames();
  const { data: reportEdits = [] } = useAllDailyReportEdits();
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<DailyReport | null>(null);

  const isAdmin = (currentStaff?.portal_access ?? []).includes("admin");
  const correctedReportIds = useMemo(() => new Set(reportEdits.map((edit) => edit.report_id)), [reportEdits]);
  const storeName = (id: string) => stores.find((store) => store.id === id)?.name ?? "Butik";
  const staffName = (id: string) => {
    const person = staff.find((entry) => entry.id === id);
    return person ? `${person.first_name} ${person.last_name}` : "Personal";
  };

  const rows = useMemo(
    () => (storeFilter === "all" ? reports : reports.filter((report) => report.store_id === storeFilter)),
    [reports, storeFilter],
  );
  /* Listan visar nettoomsättning — det är talet som följs upp per dag. */
  const totalNetSales = useMemo(() => rows.reduce((sum, report) => sum + (report.net_sales ?? 0), 0), [rows]);
  const totalReceipts = useMemo(() => rows.reduce((sum, report) => sum + (report.receipt_count ?? 0), 0), [rows]);
  const totalStaffHours = useMemo(() => rows.reduce((sum, report) => sum + totalHours(report.staff_entries ?? []), 0), [rows]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary"><FileText className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Dagsrapportarkiv</span></div>
          <h3 className="text-xl font-semibold tracking-tight">Avslutade dagsrapporter</h3>
          <p className="mt-1 text-sm text-muted-foreground">Öppna en rad för att granska underlaget. {isAdmin ? "Som admin kan du rätta sparade rapporter." : ""}</p>
        </div>
        <div className="w-full md:w-[230px]">
          <Label className="mb-1.5 block text-xs text-muted-foreground">Visa butik</Label>
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger><SelectValue placeholder="Alla butiker" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alla butiker</SelectItem>
              {stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="Rapporter" value={nf(rows.length)} emphasis />
        <Metric label="Brutto totalt" value={`${nf(totalSales)} kr`} />
        <Metric label="Kvitton totalt" value={nf(totalReceipts)} />
        <Metric label="Bemanning" value={`${totalStaffHours.toFixed(1)} h`} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed px-4 py-12 text-center"><FileText className="mx-auto mb-3 h-6 w-6 text-muted-foreground" /><p className="text-sm text-muted-foreground">Inga dagsrapporter ännu.</p></div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border/80">
          <div className="hidden grid-cols-[minmax(0,1fr)_150px_130px_100px] gap-4 border-b bg-muted/30 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid">
            <span>Butik och datum</span><span>Rapportör</span><span className="text-right">Brutto</span><span className="text-right">Bemanning</span>
          </div>
          <div className="divide-y divide-border/70">
            {rows.map((report) => {
              const open = openId === report.id;
              const waste = (report.waste_items ?? []).reduce((sum, item) => sum + (item.value_sek ?? 0), 0);
              const wasteKg = (report.waste_items ?? []).reduce((sum, item) => sum + (item.weight_kg ?? 0), 0);
              const reportHours = totalHours(report.staff_entries ?? []);
              return (
                <div key={report.id} className={cn("bg-background transition-colors", open && "bg-muted/10")}>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-3 py-3 md:grid-cols-[minmax(0,1fr)_150px_130px_100px_auto] md:items-center md:gap-4 md:px-4">
                    <button type="button" aria-label={open ? "Dölj detaljer" : "Visa detaljer"} aria-expanded={open} onClick={() => setOpenId(open ? null : report.id)} className="mt-0.5 text-muted-foreground hover:text-foreground">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <button type="button" onClick={() => setOpenId(open ? null : report.id)} className="min-w-0 text-left">
                      <span className="block truncate text-sm font-semibold">{storeName(report.store_id)}</span>
                      <span className="mt-0.5 block flex flex-wrap items-center gap-2 text-xs text-muted-foreground">{formatWeekdayDate(report.report_date)}{correctedReportIds.has(report.id) && <Badge variant="outline" className="border-warning/40 px-1.5 py-0 text-[9px] text-warning">Korrigerad</Badge>}</span>
                    </button>
                    <span className="hidden truncate text-xs text-muted-foreground md:block">{nameOf(report.created_by) ?? "Okänd rapportör"}</span>
                    <span className="col-start-2 row-start-1 text-right font-mono text-sm font-medium tabular-nums md:col-auto md:row-auto">{nf(report.gross_sales)} kr</span>
                    <span className="col-start-2 row-start-2 flex justify-end gap-2 text-xs text-muted-foreground md:col-auto md:row-auto md:justify-end"><Users className="h-3.5 w-3.5" />{(report.staff_entries ?? []).length} · {reportHours.toFixed(1)} h</span>
                    {isAdmin && <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(report)} className="col-start-2 row-start-3 ml-auto md:col-auto md:row-auto"><Edit3 /> Ändra</Button>}
                  </div>

                  {open && (
                    <div className="border-t bg-muted/10 px-4 pb-5 pt-4 md:px-12">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        {correctedReportIds.has(report.id) && <Badge variant="outline" className="border-warning/40 text-warning">Korrigerad efter inskick</Badge>}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                        <Metric label="Brutto" value={`${nf(report.gross_sales)} kr`} emphasis />
                        <Metric label="Netto" value={`${nf(report.net_sales)} kr`} />
                        <Metric label="Kvitton" value={nf(report.receipt_count)} />
                        <Metric label="Snittköp" value={report.receipt_count ? `${((report.gross_sales ?? 0) / report.receipt_count).toFixed(2)} kr` : "—"} />
                        <Metric label="Största köp" value={`${nf(report.largest_sale)} kr`} />
                      </div>

                      <div className="mt-5 grid gap-5 lg:grid-cols-2">
                        <section>
                          <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Personal · {reportHours.toFixed(1)} timmar</p><Badge variant="outline">{(report.staff_entries ?? []).length} personer</Badge></div>
                          {(report.staff_entries ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Ingen personal rapporterad.</p> : <div className="divide-y rounded-md border bg-background">{report.staff_entries.map((entry, index) => <div key={`${entry.staff_id}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs"><span className="font-medium">{staffName(entry.staff_id)}</span><span className="font-mono tabular-nums text-muted-foreground">{entry.start || "—"}–{entry.end || "—"}</span><span className="font-mono tabular-nums text-muted-foreground">{hours(entry.start, entry.end).toFixed(1)} h</span>{entry.deviation && entry.deviation !== "none" && <Badge variant="outline" className="text-[10px]">{entry.deviation}</Badge>}</div>)}</div>}
                          {report.staff_notes && <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{report.staff_notes}</p>}
                        </section>
                        <section>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Svinn · {nf(wasteKg)} kg · {nf(waste)} kr</p>
                          {(report.waste_items ?? []).length === 0 ? <p className="text-xs text-muted-foreground">Inget svinn rapporterat.</p> : <div className="divide-y rounded-md border bg-background">{report.waste_items.map((item, index) => <div key={`${item.item}-${index}`} className="flex flex-wrap items-center gap-3 px-3 py-2 text-xs"><span className="font-medium">{item.item || "—"}</span><span className="font-mono tabular-nums text-muted-foreground">{item.weight_kg ?? "—"} kg</span><span className="font-mono tabular-nums text-muted-foreground">{nf(item.value_sek)} kr</span>{item.reason && <span className="text-muted-foreground">{item.reason}</span>}</div>)}</div>}
                        </section>
                      </div>
                      <div className="mt-5 border-t pt-4"><p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Dagens kommentar</p><p className="mt-1 whitespace-pre-wrap text-sm">{report.comment || <span className="text-muted-foreground">Ingen kommentar.</span>}</p></div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-[10px] text-muted-foreground"><span>Sparad av {nameOf(report.created_by) ?? "okänd"}</span><span>{new Date(report.updated_at || report.created_at).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</span>{isAdmin && <Button type="button" variant="outline" size="sm" onClick={() => setEditing(report)}><Edit3 /> Ändra rapport</Button>}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EditDailyReportDialog report={editing} open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }} nameOf={staffName} />
    </div>
  );
}
