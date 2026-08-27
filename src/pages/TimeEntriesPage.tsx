/**
 * Stämplingsvy och personalliggare (inspektörsläge).
 *
 * Journalen är append-only: manuell efterregistrering skapar source='manual'
 * och en korrigering skapar source='correction' med referens till originalet.
 */
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const today = () => new Date().toISOString().slice(0, 10);

export default function TimeEntriesPage() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [storeId, setStoreId] = useState<string>("");
  const [inspector, setInspector] = useState(false);
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
    const occurredAt = new Date(`${form.date}T${form.time}:00`).toISOString();
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
        ? new Date(`${form.date}T${form.time}:00`).toISOString()
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
      date: entry.occurred_at.slice(0, 10),
      time: new Date(entry.occurred_at).toLocaleTimeString("sv-SE", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      note: "",
    }));
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
    const printedAt = new Date().toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
    const unitLabel = storeId ? storeName.get(storeId) ?? "–" : "Alla enheter";
    return (
      <div className="fixed inset-0 z-50 ind-inspect overflow-auto p-6 print:p-0">
        <div className="flex items-center justify-between mb-6 ind-print-hidden">
          <div>
            <SectionLabel>Elektronisk personalliggare — låst läge</SectionLabel>
            <h1 className="ind-h2">
              {unitLabel} · {from} – {to}
            </h1>
          </div>
          <div className="flex gap-2">
            <IndustryButton variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Skriv ut / PDF
            </IndustryButton>
            <IndustryButton variant="ghost" onClick={() => setInspector(false)}>
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
                <td className="ind-mono">{e.occurred_at.slice(0, 16).replace("T", " ")}</td>
                <td>{employeeName.get(e.employee_id) ?? e.employee_id}</td>
                <td>{TYPE_LABEL[e.type]}</td>
                <td>{SOURCE_LABEL[e.source]}</td>
                <td className="ind-mono">{e.corrects_entry_id ? `${e.correction_kind} ${e.corrects_entry_id.slice(0, 8)}` : "–"}</td>
                <td className="ind-mono">{e.registered_at.slice(0, 16).replace("T", " ")}</td>
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


  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Rapporterad tid</h1>
          <p className="text-sm text-muted-foreground">
            Stämplingar från klockan, manuella efterregistreringar och rättelser.
          </p>
        </div>
        <div className="flex gap-2">
          <Button className="gap-2" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4" /> Efterregistrera
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setInspector(true)}>
            <ShieldCheck className="h-4 w-4" /> Visa för Skatteverket
          </Button>
        </div>
      </div>

      {filters}

      <Tabs defaultValue="day">
        <TabsList>
          <TabsTrigger value="day">Dagslista</TabsTrigger>
          <TabsTrigger value="journal">Journal ({entries.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="day">
          <Card className="overflow-x-auto">
            {isLoading ? (
              <div className="p-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : summaries.length === 0 ? (
              <p className="p-8 text-center text-sm text-muted-foreground">
                Inga stämplingar för perioden.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="p-2 w-8"></th>
                    <th className="p-2">Datum</th>
                    <th className="p-2">Person</th>
                    <th className="p-2">In</th>
                    <th className="p-2">Ut</th>
                    <th className="p-2">Rast</th>
                    <th className="p-2">Total tid</th>
                    <th className="p-2">Källa</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((r) => {
                    const key = `${r.employee_id}-${r.day}`;
                    return (
                      <tr key={key} className="border-b hover:bg-muted/40">
                        <td className="p-2">
                          <Checkbox
                            checked={selected.has(key)}
                            onCheckedChange={(v) =>
                              setSelected((prev) => {
                                const next = new Set(prev);
                                if (v) next.add(key);
                                else next.delete(key);
                                return next;
                              })
                            }
                          />
                        </td>
                        <td className="p-2 font-mono">{r.day}</td>
                        <td className="p-2">{employeeName.get(r.employee_id) ?? r.employee_id}</td>
                        <td className="p-2 font-mono tabular-nums">{hhmm(r.first_in)}</td>
                        <td className="p-2 font-mono tabular-nums">{hhmm(r.last_out)}</td>
                        <td className="p-2 font-mono tabular-nums">{durationLabel(r.break_seconds)}</td>
                        <td className="p-2 font-mono tabular-nums">{durationLabel(r.work_seconds)}</td>
                        <td className="p-2">
                          {r.sources.map((s) => (
                            <Badge key={s} variant="outline" className="mr-1 text-[10px]">
                              {SOURCE_LABEL[s as TimeEntry["source"]]}
                            </Badge>
                          ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
          {selected.size > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {selected.size} rader markerade. Attest kommer i etapp 3.
            </p>
          )}
        </TabsContent>

        <TabsContent value="journal">
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="p-2">Tidpunkt</th>
                  <th className="p-2">Person</th>
                  <th className="p-2">Typ</th>
                  <th className="p-2">Källa</th>
                  <th className="p-2">Registrerad</th>
                  <th className="p-2">Rättar</th>
                  <th className="p-2">Anteckning</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {journal.map((e) => {
                  const isEffective = effective.some((x) => x.id === e.id);
                  return (
                    <tr
                      key={e.id}
                      className={`border-b ${isEffective ? "" : "opacity-50 line-through"}`}
                    >
                      <td className="p-2 font-mono">{e.occurred_at.slice(0, 16).replace("T", " ")}</td>
                      <td className="p-2">{employeeName.get(e.employee_id) ?? e.employee_id}</td>
                      <td className="p-2">{TYPE_LABEL[e.type]}</td>
                      <td className="p-2">
                        <Badge variant="outline" className="text-[10px]">
                          {SOURCE_LABEL[e.source]}
                        </Badge>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {e.registered_at.slice(0, 16).replace("T", " ")}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {e.corrects_entry_id ? `${e.correction_kind} · ${e.corrects_entry_id.slice(0, 8)}` : "–"}
                      </td>
                      <td className="p-2 text-xs">{e.note ?? ""}</td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" className="gap-1" onClick={() => openCorrection(e)}>
                          <Pencil className="h-3.5 w-3.5" /> Rätta
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

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
    </div>
  );
}
