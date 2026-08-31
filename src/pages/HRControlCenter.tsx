import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, ChevronRight, Lock, Unlock, Users, CalendarDays, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { IndustryButton, IndustryFrame, IndustryRow, SectionLabel, SideQueue, StatusLabel } from "@/components/industry";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStores } from "@/hooks/useStores";
import { useEmployees, useAllEmployments } from "@/hooks/useEmployees";
import { useAbsenceRequests, useAbsenceTypes, useAbsenceConflicts, useDecideAbsenceRequest } from "@/hooks/useAbsence";
import { dateKey, DAY_NAMES, weekDates } from "@/lib/schedule";

const swedishDate = (value: string) => new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" }).format(new Date(`${value}T12:00:00`));
const monthKey = (value: string) => value.slice(0, 7);

type LockRow = { id: string; store_id: string; period: string; locked_at: string; unlocked_at: string | null; unlock_reason: string | null };
type ShiftRow = { store_id: string; date: string; employee_id: string | null; status: string };
type TemplateRow = { store_id: string; weekday: number; count: number };

export default function HRControlCenter() {
  const { data: stores = [], isLoading: storesLoading } = useStores(true);
  const { data: employees = [] } = useEmployees(false);
  const { data: employments = [] } = useAllEmployments();
  const [storeId, setStoreId] = useState("");
  const activeStoreId = storeId || stores[0]?.id || "";
  const [anchor, setAnchor] = useState(dateKey(new Date()));
  const week = useMemo(() => weekDates(anchor), [anchor]);
  const [period, setPeriod] = useState(monthKey(dateKey(new Date())));
  const [absenceReviewId, setAbsenceReviewId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [activeTab, setActiveTab] = useState("absence");
  const [conflictAction, setConflictAction] = useState<"open_shift" | "cancel_shift">("open_shift");

  const absenceRequests = useAbsenceRequests(undefined, activeStoreId || null);
  const absenceTypes = useAbsenceTypes();
  const decideAbsence = useDecideAbsenceRequest();
  const conflicts = useAbsenceConflicts(absenceReviewId);

  const shifts = useQuery({
    queryKey: ["hr-control-shifts", week[0], week[6]],
    queryFn: async () => {
      const { data, error } = await supabase.from("shifts").select("store_id, date, employee_id, status").gte("date", week[0]).lte("date", week[6]);
      if (error) throw error;
      return (data ?? []) as ShiftRow[];
    },
  });
  const templates = useQuery({
    queryKey: ["hr-control-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shift_templates").select("store_id, weekday, count");
      if (error) throw error;
      return (data ?? []) as TemplateRow[];
    },
  });
  const locks = useQuery({
    queryKey: ["hr-control-locks", period],
    queryFn: async () => {
      const { data, error } = await supabase.from("period_locks").select("id, store_id, period, locked_at, unlocked_at, unlock_reason").eq("period", period);
      if (error) throw error;
      return (data ?? []) as LockRow[];
    },
  });

  const employeeName = useMemo(() => new Map(employees.map((employee) => [employee.id, `${employee.first_name} ${employee.last_name}`])), [employees]);
  const storeName = useMemo(() => new Map(stores.map((store) => [store.id, store.name])), [stores]);
  const typeName = useMemo(() => new Map(absenceTypes.data?.map((type) => [type.id, type.name]) ?? []), [absenceTypes.data]);
  const pending = (absenceRequests.data ?? []).filter((request) => request.status === "pending");

  const activeStaffByStore = useMemo(() => {
    const result = new Map<string, number>();
    employments.filter((employment) => employment.is_active && employment.store_id).forEach((employment) => {
      result.set(employment.store_id as string, (result.get(employment.store_id as string) ?? 0) + 1);
    });
    return result;
  }, [employments]);

  const coverage = useMemo(() => stores.map((store) => {
    const storeShifts = (shifts.data ?? []).filter((shift) => shift.store_id === store.id && shift.status !== "cancelled");
    const storeTemplates = (templates.data ?? []).filter((template) => template.store_id === store.id);
    return {
      store,
      days: week.map((day) => {
        const weekday = ((new Date(`${day}T12:00:00`).getDay() + 6) % 7) + 1;
        const scheduled = storeShifts.filter((shift) => shift.date === day && shift.employee_id).length;
        const target = storeTemplates.filter((template) => template.weekday === weekday).reduce((sum, template) => sum + Math.max(1, template.count), 0);
        const effectiveTarget = target || (scheduled > 0 ? scheduled : 0);
        return { day, scheduled, target: effectiveTarget };
      }),
      hours: storeShifts.length,
    };
  }), [stores, shifts.data, templates.data, week]);

  const sharedStaff = useMemo(() => {
    const byEmployee = new Map<string, Set<string>>();
    employments.filter((employment) => employment.is_active && employment.store_id).forEach((employment) => {
      const storesForEmployee = byEmployee.get(employment.employee_id) ?? new Set<string>();
      storesForEmployee.add(employment.store_id as string);
      byEmployee.set(employment.employee_id, storesForEmployee);
    });
    return [...byEmployee.entries()]
      .filter(([, linkedStores]) => linkedStores.size > 1)
      .map(([employeeId, linkedStores]) => ({ employeeId, name: employeeName.get(employeeId) ?? employeeId, stores: [...linkedStores].map((id) => storeName.get(id) ?? id) }))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  }, [employments, employeeName, storeName]);

  const setPeriodLock = async (targetStoreId: string, locked: boolean) => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (locked) {
        const { error } = await supabase.from("period_locks").upsert({ store_id: targetStoreId, period, locked_by: auth.user?.id ?? null, unlocked_at: null, unlocked_by: null, unlock_reason: null }, { onConflict: "store_id,period" });
        if (error) throw error;
        toast.success(`Perioden ${period} är låst för ${storeName.get(targetStoreId) ?? "enheten"}`);
      } else {
        const reason = window.prompt("Ange skäl för upplåsning");
        if (!reason?.trim()) return;
        const { error } = await supabase.from("period_locks").update({ unlocked_at: new Date().toISOString(), unlocked_by: auth.user?.id ?? null, unlock_reason: reason.trim() }).eq("store_id", targetStoreId).eq("period", period);
        if (error) throw error;
        toast.success(`Perioden ${period} är upplåst med loggat skäl`);
      }
      await locks.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte ändra periodlåset");
    }
  };

  const decide = async (requestId: string, decision: "approved" | "rejected", hasConflicts = false) => {
    if (decision === "rejected" && !rejectReason.trim()) return;
    try {
      await decideAbsence.mutateAsync({
        requestId,
        decision,
        note: decision === "rejected" ? rejectReason.trim() : undefined,
        conflictAction: decision === "approved" && hasConflicts ? conflictAction : "none",
      });
      setAbsenceReviewId(null);
      setRejectReason("");
      setConflictAction("open_shift");
      toast.success(decision === "approved" ? "Frånvaro godkänd" : "Frånvaro avslagen");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Kunde inte besluta om frånvaron");
    }
  };

  const selectedRequest = pending.find((request) => request.id === absenceReviewId) ?? null;
  const lockedFor = new Map((locks.data ?? []).map((lock) => [lock.store_id, lock]));

  /** Bemanning per krockdag så chefen ser talet före och efter beslutet. */
  const hasConflicts = (conflicts.data ?? []).length > 0;
  const conflictDates = (conflicts.data ?? []).map((conflict) => conflict.shift_date);
  const conflictStaffing = useQuery({
    queryKey: ["hr-control-conflict-staffing", absenceReviewId, conflictDates.join(",")],
    enabled: conflictDates.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("store_id, date, employee_id, status")
        .in("date", conflictDates)
        .eq("status", "published");
      if (error) throw error;
      const counts = new Map<string, number>();
      (data ?? []).forEach((shift) => {
        if (!shift.employee_id) return;
        const mapKey = `${shift.store_id}:${shift.date}`;
        counts.set(mapKey, (counts.get(mapKey) ?? 0) + 1);
      });
      return counts;
    },
  });

  return (
    <IndustryFrame className="ind-page space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SectionLabel>Personal · kontroll</SectionLabel>
          <h1 className="ind-h1">Bemanning & frånvaro</h1>
          <p className="ind-muted mt-1 text-sm">Besluta frånvaro, se bemanningsläget och kontrollera delad personal från samma arbetsyta.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><SectionLabel>Enhet</SectionLabel><Select value={activeStoreId} onValueChange={setStoreId}><SelectTrigger className="w-[220px]"><SelectValue placeholder="Alla enheter" /></SelectTrigger><SelectContent>{stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}</SelectContent></Select></div>
          <IndustryButton variant="secondary" size="touch" onClick={() => { void absenceRequests.refetch(); void shifts.refetch(); void locks.refetch(); }}><RefreshCw className="h-4 w-4" /> Uppdatera</IndustryButton>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="absence">Frånvarokö {pending.length > 0 && `(${pending.length})`}</TabsTrigger>
          <TabsTrigger value="coverage">Täckningskarta</TabsTrigger>
          <TabsTrigger value="shared">Delad personal</TabsTrigger>
          <TabsTrigger value="locks">Periodlås</TabsTrigger>
        </TabsList>
        <TabsContent value="absence" className="mt-5">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-2">
              <div className="flex items-center justify-between"><SectionLabel>Äldst först · idag och imorgon överst</SectionLabel><StatusLabel tone={pending.length ? "progress" : "ok"}>{pending.length} väntar</StatusLabel></div>
              {absenceRequests.isLoading ? <p className="ind-muted text-sm">Läser frånvaro…</p> : pending.length === 0 ? <IndustryRow edge="neutral"><p className="ind-muted text-sm">Inga ansökningar att behandla.</p></IndustryRow> : pending.map((request) => <IndustryRow key={request.id} edge="accent-2" className="flex-wrap gap-3"><div className="min-w-[220px] flex-1"><p className="font-medium">{employeeName.get(request.employee_id) ?? "Okänd medarbetare"}</p><p className="ind-muted text-sm">{typeName.get(request.absence_type_id) ?? "Frånvaro"} · {swedishDate(request.start_date)}{request.end_date ? ` – ${swedishDate(request.end_date)}` : ""} · {request.extent_pct}%</p>{request.note && <p className="ind-muted mt-1 text-xs">{request.note}</p>}</div><div className="flex flex-wrap gap-2"><IndustryButton variant="primary" size="touch" onClick={() => { setRejectReason(""); setConflictAction("open_shift"); setAbsenceReviewId(request.id); }} disabled={decideAbsence.isPending}><Check className="h-4 w-4" /> Granska & besluta</IndustryButton></div></IndustryRow>)}
            </section>
            <SideQueue label="Beslutsstöd" empty="Välj en ansökan för att se krockar och konsekvenser.">
              <p className="ind-muted text-sm">Frånvaro visas utan hälsodetaljer i listor och notiser. Krockar granskas innan beslut.</p>
              <p className="ind-muted mt-3 text-sm">Nästa deadline: periodlåset för {period} behöver vara klart innan löneunderlaget beräknas.</p>
            </SideQueue>
          </div>
        </TabsContent>
        <TabsContent value="coverage" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><SectionLabel>Vecka</SectionLabel><Input type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} /></div><p className="ind-muted text-sm">Tal visar schemalagd bemanning mot mål från aktiva passmallar.</p></div>
          <div className="overflow-x-auto"><table className="min-w-[780px] w-full"><thead><tr><th>Enhet</th>{week.map((day, index) => <th key={day}>{DAY_NAMES[index]}<br /><span className="ind-muted font-normal">{day.slice(5)}</span></th>)}<th>Veckans pass</th></tr></thead><tbody>{coverage.map(({ store, days, hours }) => <tr key={store.id}><td className="font-medium">{store.name}</td>{days.map(({ day, scheduled, target }) => { const isShort = target > 0 && scheduled < target; return <td key={day} className={isShort ? "border-l-2 border-[var(--color-alert-600)]" : ""}><span className={isShort ? "ind-status--alert ind-mono font-semibold" : "ind-mono"}>{scheduled}/{target}</span>{isShort && <span className="block text-[10px] text-[var(--color-alert-800)]">{target - scheduled} saknas</span>}</td>; })}<td className="ind-mono">{hours}</td></tr>)}</tbody></table></div>
          <p className="ind-muted text-xs">ADM visas inte som bemannad enhet eftersom administration inte stämplar. Klicka på enheten i schemaplaneringen för att ändra pass.</p>
        </TabsContent>
        <TabsContent value="shared" className="mt-5 space-y-2">
          <SectionLabel>Personer med aktiva anställningar på flera enheter</SectionLabel>
          {sharedStaff.length === 0 ? <IndustryRow edge="neutral"><p className="ind-muted text-sm">Ingen delad personal hittades bland aktiva anställningar.</p></IndustryRow> : sharedStaff.map((person) => <IndustryRow key={person.employeeId} edge="accent" className="flex-wrap"><Users className="h-4 w-4" /><span className="min-w-[220px] font-medium">{person.name}</span><span className="ind-muted text-sm">{person.stores.join(" · ")}</span><StatusLabel tone="ok">Kontering per pass</StatusLabel></IndustryRow>)}
        </TabsContent>
        <TabsContent value="locks" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-end gap-3"><div><SectionLabel>Period</SectionLabel><Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></div><p className="ind-muted text-sm">Upplåsning kräver skäl och sparas i historiken.</p></div>
          {stores.map((store) => { const lock = lockedFor.get(store.id); const isLocked = Boolean(lock && !lock.unlocked_at); return <IndustryRow key={store.id} edge={isLocked ? "accent" : "alert"} className="flex-wrap"><div className="flex-1"><p className="font-medium">{store.name}</p><p className="ind-muted text-xs">{isLocked ? `Låst ${new Date(lock.locked_at).toLocaleString("sv-SE")}` : lock?.unlock_reason ? `Upplåst: ${lock.unlock_reason}` : "Inte låst"}</p></div><StatusLabel tone={isLocked ? "ok" : "alert"}>{isLocked ? "Låst" : "Öppen"}</StatusLabel><IndustryButton variant={isLocked ? "secondary" : "primary"} size="touch" onClick={() => void setPeriodLock(store.id, !isLocked)}>{isLocked ? <><Unlock className="h-4 w-4" /> Lås upp</> : <><Lock className="h-4 w-4" /> Lås enhet</>}</IndustryButton></IndustryRow>; })}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedRequest)} onOpenChange={(open) => !open && setAbsenceReviewId(null)}>
        <DialogContent className="ind max-w-lg">
          <DialogHeader><DialogTitle className="ind-h2">{hasConflicts ? "Passen blir obemannade" : "Granska frånvaro"}</DialogTitle></DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="ind-note--warn">
                <p className="font-medium">{employeeName.get(selectedRequest.employee_id) ?? "Okänd medarbetare"}</p>
                <p>{typeName.get(selectedRequest.absence_type_id) ?? "Frånvaro"} · {swedishDate(selectedRequest.start_date)}{selectedRequest.end_date ? ` – ${swedishDate(selectedRequest.end_date)}` : ""} · {selectedRequest.extent_pct} %</p>
              </div>
              <div>
                <SectionLabel>Pass som påverkas</SectionLabel>
                {conflicts.isLoading ? <p className="ind-muted text-sm">Kontrollerar…</p> : hasConflicts ? (
                  <div className="space-y-1">
                    {conflicts.data?.map((conflict) => {
                      const before = conflictStaffing.data?.get(`${conflict.store_id}:${conflict.shift_date}`) ?? 1;
                      return (
                        <IndustryRow key={conflict.shift_id} edge="alert" className="flex-wrap gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          <span className="min-w-[220px] flex-1">{storeName.get(conflict.store_id) ?? "Enhet"} · {swedishDate(conflict.shift_date)} <span className="ind-mono">{conflict.start_time.slice(0, 5)}–{conflict.end_time.slice(0, 5)}</span></span>
                          <StatusLabel tone="alert">Bemanning <span className="ind-mono">{before} → {Math.max(0, before - 1)}</span></StatusLabel>
                        </IndustryRow>
                      );
                    })}
                  </div>
                ) : <p className="ind-note--ok">Inga schemakrockar hittades.</p>}
              </div>
              {hasConflicts && (
                <div className="space-y-2">
                  <SectionLabel>Vad ska hända med passet?</SectionLabel>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="radio" name="conflict-action" className="mt-1" checked={conflictAction === "open_shift"} onChange={() => setConflictAction("open_shift")} />
                    <span><strong>Öppna passet för anmälan</strong><span className="ind-muted block text-xs">Passet blir synligt för kollegor i enheten som kan ta det.</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="radio" name="conflict-action" className="mt-1" checked={conflictAction === "cancel_shift"} onChange={() => setConflictAction("cancel_shift")} />
                    <span><strong>Avboka passet</strong><span className="ind-muted block text-xs">Bemanningen sänks och ingen ersättare söks.</span></span>
                  </label>
                </div>
              )}
              <div><SectionLabel>Skäl vid avslag</SectionLabel><Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Krävs om ansökan avslås" /></div>
            </div>
          )}
          <DialogFooter>
            <IndustryButton variant="ghost" onClick={() => setAbsenceReviewId(null)}>Avbryt</IndustryButton>
            <IndustryButton variant="secondary" disabled={!rejectReason.trim() || decideAbsence.isPending} onClick={() => selectedRequest && void decide(selectedRequest.id, "rejected", hasConflicts)}>Avslå</IndustryButton>
            <IndustryButton variant="primary" disabled={decideAbsence.isPending} onClick={() => selectedRequest && void decide(selectedRequest.id, "approved", hasConflicts)}>Godkänn frånvaron</IndustryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </IndustryFrame>
  );
}
