/**
 * Mina pass (etapp 3 C) — mobilanpassad anställdvy.
 *
 * Visar egna publicerade pass, öppna pass i egen enhet med "Ta pass" och
 * byte/överlämning av egna pass. Godkännandet följer enhetens cutoff-regel:
 * beslut tidigare än cutoff före passtart auto-godkänns, inom cutoff går
 * ärendet till chefen.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, CalendarDays, ChevronLeft, ChevronRight, HandHelping, Plus } from "lucide-react";
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
  const [anchor, setAnchor] = useState(dateKey(new Date()));
  const [swapFor, setSwapFor] = useState<Shift | null>(null);
  const [swapTo, setSwapTo] = useState<string>("");
  const [availOpen, setAvailOpen] = useState(false);
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
  const { data: myRequests = [] } = useMyShiftRequests(myId);
  const { data: cutoff = DEFAULT_CUTOFF } = useScheduleCutoff(storeId);
  const { data: myAvailability = [] } = useAvailability(myId);

  const createRequest = useCreateShiftRequest();
  const saveAvailability = useSaveAvailability();
  const deleteAvailability = useDeleteAvailability();

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
        <DecisionMetric label="Beslutsgräns" value={`${cutoff} h`} />
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
