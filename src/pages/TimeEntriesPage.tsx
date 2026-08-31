/**
 * Stämplingsvy och personalliggare (inspektörsläge).
 *
 * Journalen är append-only: manuell efterregistrering skapar source='manual'
 * och en korrigering skapar source='correction' med referens till originalet.
 */
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  IndustryFrame,
  IndustryButton,
  IndustryRow,
  SectionLabel,
  StatusLabel,
  DecisionBar,
} from "@/components/industry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
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
import { Loader2, Plus, Pencil, Printer, ShieldCheck, X } from "lucide-react";
import { useTimeEntries, useCreateTimeEntry, type TimeEntry } from "@/hooks/useClock";
import { useEmployees } from "@/hooks/useEmployees";
import { useStores } from "@/hooks/useStores";
import {
  summarizeDays,
  effectiveEntries,
  hhmm,
  durationLabel,
  TYPE_LABEL,
  SOURCE_LABEL,
} from "@/lib/timeEntries";
import { svenskDatum, svenskTid, svenskTidpunkt } from "@/lib/swedishTime";

const today = () => svenskDatum();

export default function TimeEntriesPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [storeId, setStoreId] = useState<string>("");
  const [inspector, setInspector] = useState(false);
  const [inspectorSessionId, setInspectorSessionId] = useState<string | null>(null);
  const [inspectorExpiresAt, setInspectorExpiresAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manualOpen, setManualOpen] = useState(false);
  const [correcting, setCorrecting] = useState<TimeEntry | null>(null);

  const { data: stores = [] } = useStores();
  const { data: employees = [] } = useEmployees(true);
  const { data: entries = [], isLoading } = useTimeEntries(from, to, storeId || null);
  const createEntry = useCreateTimeEntry();

  const [form, setForm] = useState({
    employee_id: "",
    type: "in" as TimeEntry["type"],
    time: "08:00",
    date: today(),
    note: "",
  });

  const employeeName = useMemo(
    () => new Map(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`])),
    [employees],
  );
  const storeName = useMemo(() => new Map(stores.map((s) => [s.id, s.name])), [stores]);

  const summaries = useMemo(() => summarizeDays(entries), [entries]);
  const journal = useMemo(
    () => [...entries].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [entries],
  );
  const effective = useMemo(() => effectiveEntries(entries), [entries]);

  const submitManual = async () => {
    if (!form.employee_id) return;
    const occurredAt = svenskTidpunkt(form.date, form.time).toISOString();
    try {
      await createEntry.mutateAsync({
        employee_id: form.employee_id,
        store_id: storeId || null,
        type: form.type,
        occurred_at: occurredAt,
        note: form.note || null,
      });
      toast.success("Stämpling efterregistrerad");
      setManualOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    }
  };

  const submitCorrection = async (kind: "replace" | "void") => {
    if (!correcting) return;
    const occurredAt =
      kind === "replace"
        ? svenskTidpunkt(form.date, form.time).toISOString()
        : correcting.occurred_at;
    try {
      await createEntry.mutateAsync({
        employee_id: correcting.employee_id,
        store_id: correcting.store_id,
        station_id: correcting.station_id,
        type: correcting.type,
        occurred_at: occurredAt,
        corrects_entry_id: correcting.id,
        correction_kind: kind,
        note: form.note || null,
      });
      toast.success(kind === "void" ? "Stämplingen ogiltigförklarad" : "Rättelse sparad");
      setCorrecting(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara rättelsen");
    }
  };

  const openCorrection = (entry: TimeEntry) => {
    setCorrecting(entry);
    setForm((f) => ({
      ...f,
      date: svenskDatum(entry.occurred_at),
      time: svenskTid(entry.occurred_at).slice(0, 5),
      note: "",
    }));
  };

  const openInspector = async () => {
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomUUID();
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`INSPECTOR:${token}`));
    const tokenHash = Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const { data, error } = await supabase
      .from("inspector_sessions")
      .insert({ token_hash: tokenHash, work_site_id: null, expires_at: expiresAt, reason: "Personalliggare visad för kontroll" })
      .select("id")
      .single();
    if (error) {
      toast.error("Kunde inte öppna inspektörsläget");
      return;
    }
    setInspectorSessionId(data.id);
    setInspectorExpiresAt(expiresAt);
    setInspector(true);
  };

  const closeInspector = async () => {
    if (inspectorSessionId) {
      await supabase.from("inspector_sessions").update({ revoked_at: new Date().toISOString() }).eq("id", inspectorSessionId);
    }
    setInspectorSessionId(null);
    setInspectorExpiresAt(null);
    setInspector(false);
  };

  const ledgerRows = summaries.filter((s) => s.first_in || s.last_out);

  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Från</Label>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Till</Label>
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Enhet</Label>
        <Select value={storeId || "all"} onValueChange={(v) => setStoreId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alla enheter</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  if (inspector) {
    const printedAt = `${svenskDatum()} ${svenskTid()}`;
    const unitLabel = storeId ? storeName.get(storeId) ?? "–" : "Alla enheter";
    return (
      <div className="fixed inset-0 z-50 ind-inspect overflow-auto p-6 print:p-0">
        <div className="flex items-center justify-between mb-6 ind-print-hidden">
           <div>
            <SectionLabel>Elektronisk personalliggare — låst läge</SectionLabel>
            <h1 className="ind-h2">
              {unitLabel} · {from} – {to}
            </h1>
            {inspectorExpiresAt && (
              <p className="ind-muted text-xs">Kontrollsession aktiv till {svenskTid(inspectorExpiresAt).slice(0, 5)}</p>
            )}
          </div>
          <div className="flex gap-2">
            <IndustryButton variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Skriv ut / PDF
            </IndustryButton>
            <IndustryButton variant="ghost" onClick={() => void closeInspector()}>
              <X className="h-4 w-4" /> Stäng
            </IndustryButton>
          </div>
        </div>

        <SectionLabel className="mb-2">Närvaro</SectionLabel>
        <table>
          <thead>
            <tr>
              <th>Datum</th>
              <th>Person</th>
              <th>Start</th>
              <th>Slut</th>
              <th>Rast</th>
              <th>Arbetad tid</th>
              <th>Källa</th>
            </tr>
          </thead>
          <tbody>
            {ledgerRows.map((r) => (
              <tr key={`${r.employee_id}-${r.day}`}>
                <td className="ind-mono">{r.day}</td>
                <td>{employeeName.get(r.employee_id) ?? r.employee_id}</td>
                <td className="ind-mono">{hhmm(r.first_in)}</td>
                <td className="ind-mono">{hhmm(r.last_out)}</td>
                <td className="ind-mono">{durationLabel(r.break_seconds)}</td>
                <td className="ind-mono">{durationLabel(r.work_seconds)}</td>
                <td>{r.sources.map((s) => SOURCE_LABEL[s as TimeEntry["source"]]).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <SectionLabel className="mt-8 mb-2">Korrigeringshistorik</SectionLabel>
        <table>
          <thead>
            <tr>
              <th>Tidpunkt</th>
              <th>Person</th>
              <th>Typ</th>
              <th>Källa</th>
              <th>Rättar</th>
              <th>Registrerad</th>
              <th>Anteckning</th>
            </tr>
          </thead>
          <tbody>
            {journal.map((e) => (
              <tr key={e.id}>
                <td className="ind-mono">{`${svenskDatum(e.occurred_at)} ${svenskTid(e.occurred_at)}`}</td>
                <td>{employeeName.get(e.employee_id) ?? e.employee_id}</td>
                <td>{TYPE_LABEL[e.type]}</td>
                <td>{SOURCE_LABEL[e.source]}</td>
                <td className="ind-mono">{e.corrects_entry_id ? `${e.correction_kind} ${e.corrects_entry_id.slice(0, 8)}` : "–"}</td>
                <td className="ind-mono">{`${svenskDatum(e.registered_at)} ${svenskTid(e.registered_at)}`}</td>
                <td>{e.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-8 pt-3 text-sm" style={{ borderTop: "1px solid currentColor" }}>
          Elektronisk personalliggare — {unitLabel} — utskriven {printedAt}
        </footer>
      </div>
    );
  }


  const sourceEdge = (source: string): "accent" | "neutral" | "accent-2" =>
    source === "clock" ? "accent" : source === "correction" ? "accent-2" : "neutral";

  const days = [...new Set(summaries.map((s) => s.day))].sort((a, b) => b.localeCompare(a));

  return (
    <IndustryFrame className="p-4 sm:p-6">
      <DecisionBar>
        <div className="mr-auto">
          <SectionLabel>Personal · journal</SectionLabel>
          <h1 className="ind-h1">Rapporterad tid</h1>
          <p className="ind-muted text-sm">
            Stämplingar från klockan, manuella efterregistreringar och rättelser.
          </p>
        </div>
        <div className="flex gap-2">
          <IndustryButton variant="secondary" size="touch" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" /> Efterregistrera
          </IndustryButton>
           <IndustryButton variant="secondary" size="touch" onClick={() => void openInspector()}>
             <ShieldCheck className="h-4 w-4" /> Visa för Skatteverket
           </IndustryButton>
        </div>
      </DecisionBar>

      <div className="mt-4">{filters}</div>

      <section className="mt-6">
        <SectionLabel className="mb-2">Dagslista</SectionLabel>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin ind-muted" />
        ) : summaries.length === 0 ? (
          <p className="ind-muted text-sm">Inga stämplingar för perioden.</p>
        ) : (
          days.map((day) => (
            <div key={day} className="mb-6">
              <SectionLabel className="mb-1">{day}</SectionLabel>
              {summaries
                .filter((r) => r.day === day)
                .map((r) => {
                  const key = `${r.employee_id}-${r.day}`;
                  const primarySource = r.sources[0] ?? "clock";
                  return (
                    <IndustryRow key={key} edge={sourceEdge(primarySource)} className="flex-wrap">
                      <Checkbox
                        checked={selected.has(key)}
                        aria-label={`Markera ${employeeName.get(r.employee_id) ?? r.employee_id}`}
                        onCheckedChange={(v) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (v) next.add(key);
                            else next.delete(key);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-[180px]">{employeeName.get(r.employee_id) ?? r.employee_id}</span>
                      <span className="ind-mono">{hhmm(r.first_in)} – {hhmm(r.last_out)}</span>
                      <span className="ind-muted ind-mono text-sm">rast {durationLabel(r.break_seconds)}</span>
                      <span className="ind-mono">{durationLabel(r.work_seconds)}</span>
                      <span className="ml-auto flex gap-3">
                        {r.sources.map((s) => (
                          <StatusLabel
                            key={s}
                            tone={s === "clock" ? "ok" : s === "correction" ? "progress" : "neutral"}
                          >
                            {SOURCE_LABEL[s as TimeEntry["source"]]}
                          </StatusLabel>
                        ))}
                      </span>
                    </IndustryRow>
                  );
                })}
            </div>
          ))
        )}
        {selected.size > 0 && (
          <p className="ind-muted text-sm">{selected.size} rader markerade. Attest kommer i etapp 3.</p>
        )}
      </section>

      <section className="mt-8">
        <SectionLabel className="mb-2">Journal ({entries.length})</SectionLabel>
        {journal.map((e) => {
          const isEffective = effective.some((x) => x.id === e.id);
          return (
            <IndustryRow
              key={e.id}
              edge={sourceEdge(e.source)}
              muted={!isEffective}
              className={`flex-wrap ${isEffective ? "" : "line-through"}`}
            >
              <span className="ind-mono min-w-[130px]">{`${svenskDatum(e.occurred_at)} ${svenskTid(e.occurred_at)}`}</span>
              <span className="min-w-[170px]">{employeeName.get(e.employee_id) ?? e.employee_id}</span>
              <span>{TYPE_LABEL[e.type]}</span>
              <StatusLabel tone={e.source === "clock" ? "ok" : e.source === "correction" ? "progress" : "neutral"}>
                {SOURCE_LABEL[e.source]}
              </StatusLabel>
              {e.corrects_entry_id && (
                <span className="ind-muted text-sm">
                  ersätter {e.correction_kind} · {e.corrects_entry_id.slice(0, 8)}
                </span>
              )}
              {e.note && <span className="ind-muted text-sm">{e.note}</span>}
              <IndustryButton variant="ghost" className="ml-auto" onClick={() => openCorrection(e)}>
                <Pencil className="h-3.5 w-3.5" /> Rätta
              </IndustryButton>
            </IndustryRow>
          );
        })}
      </section>


      {/* Manuell efterregistrering */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Efterregistrera stämpling</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Person</Label>
              <Select
                value={form.employee_id}
                onValueChange={(v) => setForm((f) => ({ ...f, employee_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Välj person" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.first_name} {e.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label>Typ</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as TimeEntry["type"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABEL) as TimeEntry["type"][]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TYPE_LABEL[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Datum</Label>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Tid</Label>
                <Input
                  type="time"
                  value={form.time}
                  onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Anteckning</Label>
              <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitManual} disabled={createEntry.isPending || !form.employee_id}>
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Korrigering */}
      <Dialog open={Boolean(correcting)} onOpenChange={() => setCorrecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rätta stämpling</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Originalet ligger kvar i journalen. Rättelsen sparas som en ny rad med referens till
            originalet.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Datum</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Tid</Label>
              <Input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Orsak</Label>
            <Input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="text-destructive" onClick={() => submitCorrection("void")}>
              Ogiltigförklara
            </Button>
            <Button onClick={() => submitCorrection("replace")} disabled={createEntry.isPending}>
              Spara rättelse
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </IndustryFrame>
  );
}
