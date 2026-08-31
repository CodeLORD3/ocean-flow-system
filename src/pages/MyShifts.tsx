/**
 * Mina pass (etapp 3 C) — mobilanpassad anställdvy.
 *
 * Visar egna publicerade pass, öppna pass i egen enhet med "Ta pass" och
 * byte/överlämning av egna pass. Godkännandet följer enhetens cutoff-regel:
 * beslut tidigare än cutoff före passtart auto-godkänns, inom cutoff går
 * ärendet till chefen.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, HandHelping, Plus, Stethoscope, Undo2 } from "lucide-react";
import {
  DecisionBar,
  DecisionMetric,
  IndustryButton,
  IndustryFrame,
  IndustryInput,
  IndustryRow,
  SectionLabel,
  StatusLabel,
} from "@/components/industry";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useEmployees, useAllEmployments } from "@/hooks/useEmployees";
import {
  useShiftTypes,
  useShifts,
  useEmployeeShifts,
  useMyShiftRequests,
  useCreateShiftRequest,
  useAvailability,
  useSaveAvailability,
  useDeleteAvailability,
} from "@/hooks/useSchedule";
import {
  useAbsenceRequests,
  useAbsenceTypes,
  useCreateAbsenceRequest,
  useRegisterSickDay,
  useActiveSickPeriod,
  useUndoSickPeriod,
  useEndSickPeriod,
  useVacationBalances,
} from "@/hooks/useAbsence";
import {
  DAY_NAMES,
  dateKey,
  formatMinutes,
  isoWeek,
  mondayOf,
  shiftMinutes,
  weekDates,
  type Shift,
} from "@/lib/schedule";

const DEFAULT_CUTOFF = 48;

/** Lokal kö för sjukanmälningar som inte kunde nå servern. */
const SICK_QUEUE_KEY = (employeeId: string) => `makrilltrade.sick_queue.${employeeId}`;

function readSickQueue(employeeId: string): string[] {
  try {
    const raw = window.localStorage.getItem(SICK_QUEUE_KEY(employeeId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeSickQueue(employeeId: string, dates: string[]) {
  try {
    if (dates.length) window.localStorage.setItem(SICK_QUEUE_KEY(employeeId), JSON.stringify([...new Set(dates)]));
    else window.localStorage.removeItem(SICK_QUEUE_KEY(employeeId));
  } catch {
    /* lagring kan vara blockerad — anmälan görs då direkt mot servern */
  }
}

/** Mina employee_id enligt databasens säkra hjälpfunktion. */
function useMyEmployeeIds() {
  return useQuery({
    queryKey: ["my_employee_ids"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_employee_ids");
      if (error) throw error;
      return ((data ?? []) as unknown as string[]).filter(Boolean);
    },
  });
}

function useScheduleCutoff(storeId: string | null) {
  return useQuery({
    queryKey: ["schedule_cutoff", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data } = await supabase
        .from("store_order_settings")
        .select("approval_cutoff_hours")
        .eq("store_id", storeId!)
        .maybeSingle();
      return (data as { approval_cutoff_hours?: number } | null)?.approval_cutoff_hours ?? DEFAULT_CUTOFF;
    },
  });
}

export default function MyShifts() {
  const today = dateKey(new Date());
  const [anchor, setAnchor] = useState(today);
  const [swapFor, setSwapFor] = useState<Shift | null>(null);
  const [sickUndoUntil, setSickUndoUntil] = useState<number | null>(null);
  const [sickUndoDate, setSickUndoDate] = useState<string | null>(null);
  const [sickQueue, setSickQueue] = useState<string[]>([]);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [swapTo, setSwapTo] = useState<string>("");
  const [availOpen, setAvailOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [otherAbsenceOpen, setOtherAbsenceOpen] = useState(false);
  const [absenceDraft, setAbsenceDraft] = useState({
    absenceTypeId: "",
    startDate: dateKey(new Date()),
    endDate: "",
    extentPct: "100",
    basis: "enligt_schema" as "enligt_schema" | "halvdag" | "egen",
    note: "",
  });
  const [availDraft, setAvailDraft] = useState({ date: dateKey(new Date()), from_time: "08:00", to_time: "17:00", type: "onskar" });

  const week = useMemo(() => weekDates(anchor), [anchor]);
  const { data: myIds = [] } = useMyEmployeeIds();
  const myId = myIds[0] ?? null;

  const { data: employees = [] } = useEmployees(false);
  const { data: employments = [] } = useAllEmployments();
  const { data: shiftTypes = [] } = useShiftTypes();
  const myEmployment = employments.find((e) => e.employee_id === myId && e.is_active);
  const storeId = myEmployment?.store_id ?? null;

  const { data: myShifts = [] } = useEmployeeShifts(myIds, week[0], week[6]);
  const { data: storeShifts = [] } = useShifts(storeId, week[0], week[6]);
  const { data: absenceShifts = [] } = useEmployeeShifts(myIds, absenceDraft.startDate, absenceDraft.endDate || absenceDraft.startDate);
  const { data: myRequests = [] } = useMyShiftRequests(myId);
  const { data: cutoff = DEFAULT_CUTOFF } = useScheduleCutoff(storeId);
  const { data: myAvailability = [] } = useAvailability(myId);
  const { data: absenceTypes = [] } = useAbsenceTypes();
  const { data: absenceRequests = [] } = useAbsenceRequests(myId, storeId);
  const { data: vacationBalances = [] } = useVacationBalances(myId);
  const { data: activeSickPeriod } = useActiveSickPeriod(myId);

  const createRequest = useCreateShiftRequest();
  const saveAvailability = useSaveAvailability();
  const deleteAvailability = useDeleteAvailability();
  const createAbsenceRequest = useCreateAbsenceRequest();
  const registerSickDay = useRegisterSickDay();
  const undoSickPeriod = useUndoSickPeriod();
  const endSickPeriod = useEndSickPeriod();

  const absenceTypeById = useMemo(() => new Map(absenceTypes.map((type) => [type.id, type])), [absenceTypes]);
  const quickAbsenceTypes = useMemo(() => {
    const preferredCodes = ["semester", "sjuk", "vab", "komp"];
    const preferred = preferredCodes
      .map((code) => absenceTypes.find((type) => type.code === code))
      .filter((type): type is (typeof absenceTypes)[number] => Boolean(type));
    const fallback = absenceTypes.filter((type) => !preferred.some((quick) => quick.id === type.id));
    return [...preferred, ...fallback].slice(0, 4);
  }, [absenceTypes]);
  const otherAbsenceTypes = useMemo(
    () => absenceTypes.filter((type) => !quickAbsenceTypes.some((quick) => quick.id === type.id)),
    [absenceTypes, quickAbsenceTypes],
  );
  const selectedAbsenceType = absenceTypeById.get(absenceDraft.absenceTypeId);
  const currentBalance = vacationBalances[0] ?? null;
  const remainingVacation = currentBalance
    ? currentBalance.earned_days + currentBalance.saved_days + currentBalance.manual_adjustment_days - currentBalance.used_days
    : null;

  const published = myShifts.filter((s) => s.status === "published");
  const openShifts = storeShifts.filter((s) => !s.employee_id && s.status === "published");
  const typeById = useMemo(() => new Map(shiftTypes.map((t) => [t.id, t])), [shiftTypes]);
  const colleagues = useMemo(
    () =>
      employments
        .filter((e) => e.store_id === storeId && e.is_active && e.employee_id !== myId)
        .map((e) => {
          const emp = employees.find((x) => x.id === e.employee_id);
          return emp ? { id: emp.id, name: `${emp.first_name} ${emp.last_name}` } : null;
        })
        .filter(Boolean) as { id: string; name: string }[],
    [employments, employees, storeId, myId],
  );

  const totalMinutes = published.reduce((sum, s) => sum + shiftMinutes(s), 0);
  const todayShifts = published.filter((shift) => shift.date === today);
  const scheduledWorkDays = new Set(absenceShifts.filter((shift) => shift.status === "published").map((shift) => shift.date)).size;
  const calendarDays = absenceDraft.endDate && absenceDraft.endDate >= absenceDraft.startDate
    ? Math.floor((new Date(`${absenceDraft.endDate}T12:00:00`).getTime() - new Date(`${absenceDraft.startDate}T12:00:00`).getTime()) / 86_400_000) + 1
    : absenceDraft.startDate ? 1 : 0;
  const scheduledAbsenceShifts = useMemo(
    () => absenceShifts.filter((shift) => shift.status === "published"),
    [absenceShifts],
  );
  const requestedVacationDays = selectedAbsenceType?.affects_vacation_balance
    ? scheduledWorkDays * (Number(absenceDraft.extentPct) / 100)
    : 0;
  const balanceAfterRequest = remainingVacation === null ? null : remainingVacation - requestedVacationDays;

  useEffect(() => {
    if (sickUndoUntil === null) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sickUndoUntil]);
  const sickUndoSeconds = sickUndoUntil === null ? 0 : Math.max(0, Math.ceil((sickUndoUntil - clockNow) / 1000));

  /**
   * Offlinekö för sjukanmälan: anmälan får aldrig tappas när nätet är nere.
   * Kön ligger lokalt per anställd och skickas om så snart appen är online.
   */
  const flushSickQueue = async () => {
    if (!myId || !navigator.onLine) return;
    const queued = readSickQueue(myId);
    if (!queued.length) return;
    const failed: string[] = [];
    for (const date of queued) {
      try {
        await registerSickDay.mutateAsync({ employeeId: myId, date });
      } catch {
        failed.push(date);
      }
    }
    writeSickQueue(myId, failed);
    setSickQueue(failed);
    if (failed.length < queued.length) toast.success("Köad sjukanmälan skickad");
  };

  useEffect(() => {
    if (!myId) return;
    setSickQueue(readSickQueue(myId));
    const onOnline = () => { void flushSickQueue(); };
    window.addEventListener("online", onOnline);
    void flushSickQueue();
    return () => window.removeEventListener("online", onOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const shiftRow = (s: Shift, mine: boolean) => {
    const type = s.shift_type_id ? typeById.get(s.shift_type_id) : null;
    const hoursUntil = (new Date(`${s.date}T${s.start_time}`).getTime() - Date.now()) / 3600_000;
    return (
      <IndustryRow key={s.id} edge={mine ? "accent" : "accent-2"}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="ind-mono text-base">
              {DAY_NAMES[(new Date(s.date).getDay() + 6) % 7]} {s.date} · {s.start_time.slice(0, 5)}–
              {s.end_time.slice(0, 5)}
            </p>
            <p className="ind-muted text-xs">
              {type?.name ?? "Pass"} · rast {s.break_minutes} min · {formatMinutes(shiftMinutes(s))}
              {s.note ? ` · ${s.note}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mine ? (
              <>
                <IndustryButton
                  size="touch"
                  variant="secondary"
                  onClick={() => {
                    setSwapFor(s);
                    setSwapTo("");
                  }}
                >
                  <ArrowLeftRight className="h-4 w-4" /> Byt
                </IndustryButton>
                <IndustryButton
                  size="touch"
                  variant="ghost"
                  onClick={async () => {
                    try {
                      await createRequest.mutateAsync({
                        shift: s,
                        type: "handover",
                        fromEmployeeId: myId,
                        toEmployeeId: null,
                        cutoffHours: cutoff,
                      });
                      toast.success(
                        hoursUntil > cutoff
                          ? "Passet är lämnat tillbaka som öppet"
                          : "Överlämning skickad till chef för beslut",
                      );
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Kunde inte lämna över passet");
                    }
                  }}
                >
                  <HandHelping className="h-4 w-4" /> Lämna över
                </IndustryButton>
              </>
            ) : (
              <IndustryButton
                size="touch"
                variant="primary"
                corners
                onClick={async () => {
                  try {
                    await createRequest.mutateAsync({
                      shift: s,
                      type: "claim_open",
                      fromEmployeeId: null,
                      toEmployeeId: myId,
                      cutoffHours: cutoff,
                    });
                    toast.success(
                      hoursUntil > cutoff ? "Passet är ditt" : "Förfrågan skickad till chef för beslut",
                    );
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Kunde inte ta passet");
                  }
                }}
              >
                Ta pass
              </IndustryButton>
            )}
          </div>
        </div>
      </IndustryRow>
    );
  };

  return (
    <IndustryFrame className="ind-page space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SectionLabel>Mitt schema</SectionLabel>
          <h1 className="ind-h1">Vecka {isoWeek(anchor)}</h1>
          <p className="ind-muted text-sm">
            {week[0]} – {week[6]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <IndustryButton
            size="touch"
            variant="ghost"
            aria-label="Föregående vecka"
            onClick={() => {
              const d = mondayOf(anchor);
              d.setDate(d.getDate() - 7);
              setAnchor(dateKey(d));
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </IndustryButton>
          <IndustryButton
            size="touch"
            variant="ghost"
            aria-label="Nästa vecka"
            onClick={() => {
              const d = mondayOf(anchor);
              d.setDate(d.getDate() + 7);
              setAnchor(dateKey(d));
            }}
          >
            <ChevronRight className="h-5 w-5" />
          </IndustryButton>
        </div>
      </div>

       <DecisionBar>
         <DecisionMetric label="Mina pass" value={published.length} />
         <DecisionMetric label="Planerad tid" value={formatMinutes(totalMinutes)} />
         <DecisionMetric label="Öppna pass" value={openShifts.length} tone={openShifts.length ? "progress" : "neutral"} />
         <DecisionMetric label="Semester kvar" value={remainingVacation === null ? "—" : `${remainingVacation.toFixed(1)} dagar`} tone={remainingVacation !== null && remainingVacation < 5 ? "progress" : "neutral"} />
       </DecisionBar>

      {!myId && (
        <IndustryRow edge="alert">
          <p className="text-sm">
            <StatusLabel tone="alert">Ingen personalkoppling</StatusLabel> Ditt konto är inte kopplat till en
            anställd — kontakta din chef.
          </p>
        </IndustryRow>
      )}

      <section className="space-y-2">
        <SectionLabel>Mina publicerade pass</SectionLabel>
        {published.length ? (
          published.map((s) => shiftRow(s, true))
        ) : (
          <IndustryRow edge="neutral">
            <p className="ind-muted text-sm">
              <CalendarDays className="mr-1 inline h-4 w-4" />
              Inga publicerade pass den här veckan.
            </p>
          </IndustryRow>
        )}
      </section>

      <section className="space-y-2">
        <SectionLabel>Öppna pass i min enhet</SectionLabel>
        {openShifts.length ? (
          openShifts.map((s) => shiftRow(s, false))
        ) : (
          <IndustryRow edge="neutral">
            <p className="ind-muted text-sm">Inga öppna pass just nu.</p>
          </IndustryRow>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Mina förfrågningar</SectionLabel>
        </div>
        {myRequests.slice(0, 8).map((r) => (
          <IndustryRow
            key={r.id}
            edge={r.status === "pending" ? "accent-2" : r.status === "rejected" ? "alert" : "neutral"}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {r.type === "swap" ? "Byte" : r.type === "handover" ? "Överlämning" : "Ta öppet pass"} ·{" "}
                {new Date(r.created_at).toLocaleString("sv-SE")}
              </p>
              <StatusLabel
                tone={
                  r.status === "pending"
                    ? "progress"
                    : r.status === "rejected"
                      ? "alert"
                      : "ok"
                }
              >
                {r.status === "pending"
                  ? "Väntar på chef"
                  : r.status === "auto_approved"
                    ? "Auto-godkänt"
                    : r.status === "approved"
                      ? "Godkänt"
                      : "Avslaget"}
              </StatusLabel>
            </div>
          </IndustryRow>
        ))}
        {!myRequests.length && (
          <IndustryRow edge="neutral">
            <p className="ind-muted text-sm">Inga förfrågningar.</p>
          </IndustryRow>
        )}
       </section>

        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <SectionLabel>Frånvaro & semester</SectionLabel>
              <p className="ind-muted text-xs">Ansök om ledighet eller registrera sjukdag. Godkännande visas här när chefen har beslutat.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              {activeSickPeriod ? (
                <IndustryButton size="touch" variant="secondary" className="min-h-14 w-full sm:w-auto" disabled={!myId || endSickPeriod.isPending} onClick={async () => {
                  if (!myId) return;
                  try { await endSickPeriod.mutateAsync({ employeeId: myId, lastDay: today }); toast.success("Friskanmälan registrerad"); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Kunde inte registrera friskanmälan"); }
                }}><Stethoscope className="h-4 w-4" /> Friskanmäl idag</IndustryButton>
              ) : todayShifts.length > 0 ? (
                <IndustryButton size="touch" variant="secondary" className="min-h-14 w-full sm:w-auto" disabled={!myId || registerSickDay.isPending} onClick={async () => {
                  if (!myId) return;
                  try { await registerSickDay.mutateAsync({ employeeId: myId, date: today }); setSickUndoDate(today); setSickUndoUntil(Date.now() + 10 * 60_000); toast.success("Sjukdag registrerad"); }
                  catch (e) {
                    const queued = [...readSickQueue(myId), today];
                    writeSickQueue(myId, queued);
                    setSickQueue([...new Set(queued)]);
                    toast.error(`${e instanceof Error ? e.message : "Kunde inte nå servern"} · anmälan köad och skickas automatiskt`);
                  }
                }}><Stethoscope className="h-4 w-4" /> Sjuk idag</IndustryButton>
              ) : null}
              {sickUndoSeconds > 0 && sickUndoDate && <IndustryButton size="touch" variant="ghost" className="min-h-14 w-full sm:w-auto" disabled={undoSickPeriod.isPending} onClick={async () => {
                if (!myId) return;
                try { await undoSickPeriod.mutateAsync({ employeeId: myId, firstDay: sickUndoDate }); setSickUndoUntil(null); setSickUndoDate(null); toast.success("Sjukanmälan ångrad"); }
                catch (e) { toast.error(e instanceof Error ? e.message : "Ångertiden har gått ut"); }
              }}><Undo2 className="h-4 w-4" /> Ångra · {Math.floor(sickUndoSeconds / 60)}:{String(sickUndoSeconds % 60).padStart(2, "0")}</IndustryButton>}
              <IndustryButton size="touch" variant="secondary" onClick={() => setAbsenceOpen(true)}><Plus className="h-4 w-4" /> Ny frånvaro</IndustryButton>
            </div>
          </div>
          {sickQueue.length > 0 && <IndustryRow edge="accent-2"><p className="text-sm"><StatusLabel tone="progress">Stämpling köad</StatusLabel> {sickQueue.length} sjukanmälan skickas automatiskt när anslutningen är tillbaka.</p></IndustryRow>}
          {activeSickPeriod && <IndustryRow edge="alert"><p className="text-sm"><StatusLabel tone="alert">Pågående sjukperiod</StatusLabel> Startad {activeSickPeriod.first_day} · karens {activeSickPeriod.karens_applied ? "uttagen" : "inte uttagen"}</p></IndustryRow>}
          {sickUndoSeconds === 0 && sickUndoDate && sickUndoUntil && <p className="ind-muted text-xs">Ångertiden för sjukanmälan har gått ut.</p>}
         {currentBalance && (
           <IndustryRow edge={currentBalance.expiry_flagged ? "alert" : "accent-2"}>
             <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
               <span><strong>{currentBalance.vacation_year}</strong> · intjänat {currentBalance.earned_days.toFixed(1)} dagar · sparat {currentBalance.saved_days.toFixed(1)} dagar</span>
               <StatusLabel tone={currentBalance.expiry_flagged ? "alert" : "ok"}>{remainingVacation?.toFixed(1)} dagar kvar</StatusLabel>
             </div>
           </IndustryRow>
         )}
         {absenceRequests.slice(0, 8).map((request) => (
           <IndustryRow key={request.id} edge={request.status === "rejected" ? "alert" : request.status === "pending" ? "accent-2" : "accent"}>
             <div className="flex flex-wrap items-start justify-between gap-2">
               <div>
                 <p className="text-sm font-medium">{absenceTypeById.get(request.absence_type_id)?.name ?? "Frånvaro"}</p>
                 <p className="ind-muted text-xs">{request.start_date}{request.end_date ? ` – ${request.end_date}` : ""} · {request.extent_pct}%</p>
                 {request.note && <p className="ind-muted mt-1 text-xs">{request.note}</p>}
               </div>
               <StatusLabel tone={request.status === "rejected" ? "alert" : request.status === "pending" ? "progress" : "ok"}>
                 {request.status === "pending" ? "Väntar på beslut" : request.status === "approved" ? "Godkänd" : request.status === "cancelled" ? "Avbruten" : "Avslagen"}
               </StatusLabel>
             </div>
             {request.decision_note && <p className="ind-muted mt-2 text-xs">Chefens kommentar: {request.decision_note}</p>}
           </IndustryRow>
         ))}
         {!absenceRequests.length && <IndustryRow edge="neutral"><p className="ind-muted text-sm">Ingen frånvaro registrerad.</p></IndustryRow>}
       </section>

       <section className="space-y-2">
         <div className="flex items-center justify-between">
           <SectionLabel>Min tillgänglighet</SectionLabel>
          <IndustryButton size="touch" variant="secondary" onClick={() => setAvailOpen(true)}>
            <Plus className="h-4 w-4" /> Lägg till
          </IndustryButton>
        </div>
        {myAvailability.map((a) => (
          <IndustryRow key={a.id} edge={a.type === "otillganglig" ? "alert" : "accent-2"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                {a.date ?? (a.weekday !== null ? `Varje ${DAY_NAMES[(a.weekday ?? 1) - 1]}` : "—")} ·{" "}
                {(a.from_time ?? "").slice(0, 5)}–{(a.to_time ?? "").slice(0, 5)}
              </p>
              <div className="flex items-center gap-2">
                <StatusLabel tone={a.type === "otillganglig" ? "alert" : "ok"}>
                  {a.type === "otillganglig" ? "Otillgänglig" : "Önskar"}
                </StatusLabel>
                <IndustryButton
                  size="touch"
                  variant="ghost"
                  onClick={async () => {
                    await deleteAvailability.mutateAsync(a.id);
                    toast.success("Borttagen");
                  }}
                >
                  Ta bort
                </IndustryButton>
              </div>
            </div>
          </IndustryRow>
        ))}
        {!myAvailability.length && (
          <IndustryRow edge="neutral">
            <p className="ind-muted text-sm">Ingen tillgänglighet registrerad.</p>
          </IndustryRow>
        )}
      </section>

      {/* Byt pass */}
      <Dialog open={Boolean(swapFor)} onOpenChange={(o) => !o && setSwapFor(null)}>
        <DialogContent className="ind max-w-md">
          <DialogHeader>
            <DialogTitle className="ind-h2">Byt pass</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="ind-muted text-sm">
              Byten avgörs alltid av chef om passet börjar inom {cutoff} timmar.
            </p>
            <div>
              <Label className="ind-label">Föreslå kollega</Label>
              <Select value={swapTo} onValueChange={setSwapTo}>
                <SelectTrigger className="ind-input">
                  <SelectValue placeholder="Välj kollega" />
                </SelectTrigger>
                <SelectContent>
                  {colleagues.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <IndustryButton variant="ghost" onClick={() => setSwapFor(null)}>
              Avbryt
            </IndustryButton>
            <IndustryButton
              variant="primary"
              corners
              disabled={!swapTo}
              onClick={async () => {
                if (!swapFor) return;
                try {
                  await createRequest.mutateAsync({
                    shift: swapFor,
                    type: "swap",
                    fromEmployeeId: myId,
                    toEmployeeId: swapTo,
                    cutoffHours: cutoff,
                  });
                  setSwapFor(null);
                  toast.success("Bytesförfrågan skickad");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Kunde inte skicka förfrågan");
                }
              }}
            >
              Skicka
            </IndustryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

       {/* Frånvaro */}
       <Dialog open={absenceOpen} onOpenChange={(open) => { setAbsenceOpen(open); if (!open) setOtherAbsenceOpen(false); }}>
         <DialogContent className="ind max-w-md">
           <DialogHeader>
             <DialogTitle className="ind-h2">Ny frånvaroanmälan</DialogTitle>
           </DialogHeader>
           <div className="space-y-3">
             <div>
               <Label className="ind-label">Typ</Label>
               <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Frånvarotyp">
                 {quickAbsenceTypes.map((type) => (
                   <IndustryButton
                     key={type.id}
                     variant={absenceDraft.absenceTypeId === type.id ? "primary" : "secondary"}
                     size="touch"
                     className="min-h-12 justify-start px-3 text-left"
                     aria-pressed={absenceDraft.absenceTypeId === type.id}
                     onClick={() => setAbsenceDraft({ ...absenceDraft, absenceTypeId: type.id })}
                   >
                     {type.name}
                   </IndustryButton>
                 ))}
               </div>
               {otherAbsenceTypes.length > 0 && (
                 <div className="mt-2">
                   <IndustryButton variant="ghost" size="touch" className="w-full justify-between" onClick={() => setOtherAbsenceOpen((open) => !open)} aria-expanded={otherAbsenceOpen}>
                     <span>Annat…</span><span aria-hidden="true">{otherAbsenceOpen ? "−" : "+"}</span>
                   </IndustryButton>
                   {otherAbsenceOpen && (
                     <div className="mt-2">
                       <Select value={otherAbsenceTypes.some((type) => type.id === absenceDraft.absenceTypeId) ? absenceDraft.absenceTypeId : ""} onValueChange={(value) => setAbsenceDraft({ ...absenceDraft, absenceTypeId: value })}>
                         <SelectTrigger className="ind-input"><SelectValue placeholder="Välj annan frånvarotyp" /></SelectTrigger>
                         <SelectContent>
                           {otherAbsenceTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>)}
                         </SelectContent>
                       </Select>
                     </div>
                   )}
                 </div>
               )}
             </div>
             {selectedAbsenceType?.is_sick && (
               <div className="ind-note--warn" role="note">
                 <strong>Sjukfrånvaro</strong><br />
                 Återinsjuknande inom 5 kalenderdagar hanteras som samma sjukperiod. Registrera friskanmälan när du är tillbaka.
               </div>
             )}
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="ind-label">Från</Label><IndustryInput type="date" value={absenceDraft.startDate} onChange={(e) => setAbsenceDraft({ ...absenceDraft, startDate: e.target.value })} /></div>
                <div><Label className="ind-label">Till</Label><IndustryInput type="date" min={absenceDraft.startDate} value={absenceDraft.endDate} onChange={(e) => setAbsenceDraft({ ...absenceDraft, endDate: e.target.value })} /></div>
              </div>
              <IndustryRow edge="accent-2" className="text-sm"><span className="ind-mono">{calendarDays} kalenderdagar</span><span className="ind-muted">·</span><span className="ind-mono">{scheduledWorkDays} arbetsdagar enligt publicerat schema</span></IndustryRow>
              <div>
                <Label className="ind-label">Omfattning (%)</Label>
                <IndustryInput type="number" min="1" max="100" step="1" value={absenceDraft.extentPct} onChange={(e) => setAbsenceDraft({ ...absenceDraft, extentPct: e.target.value })} />
              </div>
              <div>
                <Label className="ind-label">Beräkningsgrund</Label>
                <Select value={absenceDraft.basis} onValueChange={(value) => setAbsenceDraft({ ...absenceDraft, basis: value as typeof absenceDraft.basis })}>
                  <SelectTrigger className="ind-input"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enligt_schema">Enligt schema</SelectItem>
                    <SelectItem value="halvdag">Halvdag</SelectItem>
                    <SelectItem value="egen">Egen omfattning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="ind-label">Kommentar</Label><Textarea value={absenceDraft.note} onChange={(e) => setAbsenceDraft({ ...absenceDraft, note: e.target.value })} placeholder="Valfri kommentar" /></div>
           </div>
           <DialogFooter>
             <IndustryButton variant="ghost" onClick={() => setAbsenceOpen(false)}>Avbryt</IndustryButton>
             <IndustryButton
               variant="primary"
               corners
               disabled={!myId || !absenceDraft.absenceTypeId || !absenceDraft.startDate || (absenceDraft.endDate !== "" && absenceDraft.endDate < absenceDraft.startDate) || createAbsenceRequest.isPending}
               onClick={async () => {
                 if (!myId || !absenceDraft.absenceTypeId) return;
                 try {
                    await createAbsenceRequest.mutateAsync({
                      employee_id: myId,
                      absence_type_id: absenceDraft.absenceTypeId,
                      start_date: absenceDraft.startDate,
                      end_date: absenceDraft.endDate || null,
                      extent_pct: Number(absenceDraft.extentPct),
                      basis: absenceDraft.basis,
                      note: absenceDraft.note.trim() || undefined,
                      store_id: storeId,
                      legal_entity_id: myEmployment?.legal_entity_id ?? null,
                    });
                     setAbsenceOpen(false);
                    setAbsenceDraft({ absenceTypeId: "", startDate: today, endDate: "", extentPct: "100", basis: "enligt_schema", note: "" });
                   toast.success("Frånvaroanmälan skickad");
                 } catch (e) {
                   toast.error(e instanceof Error ? e.message : "Kunde inte skicka frånvaroanmälan");
                 }
               }}
             >
               Skicka anmälan
             </IndustryButton>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* Tillgänglighet */}
       <Dialog open={availOpen} onOpenChange={setAvailOpen}>
        <DialogContent className="ind max-w-md">
          <DialogHeader>
            <DialogTitle className="ind-h2">Ny tillgänglighet</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="ind-label">Datum</Label>
              <IndustryInput
                type="date"
                value={availDraft.date}
                onChange={(e) => setAvailDraft({ ...availDraft, date: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="ind-label">Från</Label>
                <IndustryInput
                  type="time"
                  value={availDraft.from_time}
                  onChange={(e) => setAvailDraft({ ...availDraft, from_time: e.target.value })}
                />
              </div>
              <div>
                <Label className="ind-label">Till</Label>
                <IndustryInput
                  type="time"
                  value={availDraft.to_time}
                  onChange={(e) => setAvailDraft({ ...availDraft, to_time: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="ind-label">Typ</Label>
              <Select value={availDraft.type} onValueChange={(v) => setAvailDraft({ ...availDraft, type: v })}>
                <SelectTrigger className="ind-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="onskar">Önskar arbeta</SelectItem>
                  <SelectItem value="otillganglig">Otillgänglig</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <IndustryButton variant="ghost" onClick={() => setAvailOpen(false)}>
              Avbryt
            </IndustryButton>
            <IndustryButton
              variant="primary"
              corners
              onClick={async () => {
                if (!myId) return;
                try {
                  await saveAvailability.mutateAsync({
                    employee_id: myId,
                    date: availDraft.date,
                    weekday: null,
                    from_time: availDraft.from_time,
                    to_time: availDraft.to_time,
                    type: availDraft.type as "onskar" | "otillganglig",
                  });
                  setAvailOpen(false);
                  toast.success("Sparad");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Kunde inte spara");
                }
              }}
            >
              Spara
            </IndustryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </IndustryFrame>
  );
}
