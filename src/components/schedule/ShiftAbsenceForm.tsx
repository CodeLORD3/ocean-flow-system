/**
 * Frånvaro, semester och VAB valda under "Skifttyp" i passdialogen.
 * Inga riktiga skifttyper: allt sparas via admin_schedule_absence
 * (frånvaro via admin_register_absence, Ej tillgänglig i availability).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { IndustryButton, IndustryInput } from "@/components/industry";
import { useAbsenceTypes, absenceKeys } from "@/hooks/useAbsence";

export type ShiftAbsenceMode = "unavail" | "semester" | "vab";
export const SHIFT_ABSENCE_OPTIONS: { value: `__${ShiftAbsenceMode}`; mode: ShiftAbsenceMode; label: string }[] = [
  { value: "__unavail", mode: "unavail", label: "Frånvaro / Ej tillgänglig" },
  { value: "__semester", mode: "semester", label: "Semester" },
  { value: "__vab", mode: "vab", label: "VAB" },
];

const UNAVAIL = "__ej_tillganglig";
type Conflict = "keep" | "open_shift" | "cancel_shift";

export function ShiftAbsenceForm({
  mode,
  employeeId,
  date,
  shiftId,
  onCancel,
  onSaved,
}: {
  mode: ShiftAbsenceMode;
  employeeId: string | null;
  date: string;
  /** Befintligt pass som byter typ. */
  shiftId?: string | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { data: types = [] } = useAbsenceTypes();
  const [reason, setReason] = useState(UNAVAIL);
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState("");
  const [extent, setExtent] = useState("100");
  const [note, setNote] = useState("");
  const [wholeDay, setWholeDay] = useState(true);
  const [fromTime, setFromTime] = useState("08:00");
  const [toTime, setToTime] = useState("17:00");
  const [conflict, setConflict] = useState<Conflict>("keep");
  const [shiftAction, setShiftAction] = useState<"" | "open_shift" | "cancel_shift">("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { setFrom(date); setTo(""); }, [date]);
  useEffect(() => { setReason(UNAVAIL); }, [mode]);

  const byCode = (c: string) => types.find((t) => t.code.toLowerCase() === c);
  const otherTypes = useMemo(() => types.filter((t) => !["semester", "vab"].includes(t.code.toLowerCase())), [types]);
  const type = mode === "semester" ? byCode("semester") : mode === "vab" ? byCode("vab") : reason === UNAVAIL ? null : types.find((t) => t.id === reason);
  const isUnavail = mode === "unavail" && reason === UNAVAIL;
  const isExisting = Boolean(shiftId);
  const fromDate = isExisting ? date : from;
  const endDate = isExisting ? date : to || (type?.is_sick ? null : from);

  const conflicts = useQuery({
    queryKey: ["shift-absence-conflicts", employeeId, fromDate, endDate, shiftId],
    enabled: Boolean(employeeId && fromDate),
    queryFn: async () => {
      let q = supabase.from("shifts").select("id, date").eq("employee_id", employeeId!).eq("status", "published").gte("date", fromDate);
      q = endDate ? q.lte("date", endDate) : q;
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).filter((s) => s.id !== shiftId);
    },
  });

  const extentNum = Number(extent.replace(",", "."));
  const valid =
    Boolean(employeeId) && Boolean(fromDate) && (!to || to >= from) &&
    (isUnavail ? wholeDay || fromTime < toTime : Boolean(type) && extentNum > 0 && extentNum <= 100) &&
    (!isExisting || Boolean(shiftAction));

  const save = async () => {
    if (!valid || !employeeId) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("admin_schedule_absence" as never, {
        _employee_id: employeeId,
        _kind: isUnavail ? "unavailable" : "absence",
        _start_date: fromDate,
        _end_date: isUnavail ? (isExisting ? date : to || from) : endDate,
        _absence_type_id: isUnavail ? null : type!.id,
        _extent_pct: extentNum || 100,
        _note: note || null,
        _from_time: isUnavail && !wholeDay ? fromTime : "00:00",
        _to_time: isUnavail && !wholeDay ? toTime : "23:59",
        _conflict_action: conflict,
        _shift_id: shiftId ?? null,
        _shift_action: shiftAction || null,
      } as never);
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; error?: string };
      if (r.ok === false) throw new Error(r.error || "Kunde inte spara");
      qc.invalidateQueries({ queryKey: absenceKeys.all });
      qc.invalidateQueries({ queryKey: ["availability"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
      toast.success(isUnavail ? "Markerad som ej tillgänglig" : `${type?.name} registrerad`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setBusy(false);
    }
  };

  const conflictCount = conflicts.data?.length ?? 0;

  return (
    <div className="space-y-3">
      {mode === "unavail" && (
        <div>
          <Label className="ind-label">Orsak</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="ind-input"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={UNAVAIL}>Ej tillgänglig</SelectItem>
              {otherTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {!isExisting && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="ind-label">Från</Label>
            <IndustryInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="ind-label">Till och med</Label>
            <IndustryInput type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            <p className="mt-1 text-[11px] text-muted-foreground">{to ? "" : type?.is_sick ? "Tomt = pågående" : "Tomt = en dag"}</p>
          </div>
        </div>
      )}
      {isExisting && <p className="text-sm text-muted-foreground">Gäller passets dag, {date}.</p>}

      {isUnavail ? (
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={wholeDay} onCheckedChange={(v) => setWholeDay(!!v)} /> Hela dagen</label>
          {!wholeDay && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="ind-label">Från kl.</Label><IndustryInput type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} /></div>
              <div><Label className="ind-label">Till kl.</Label><IndustryInput type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} /></div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <Label className="ind-label">Omfattning (%)</Label>
          <IndustryInput inputMode="decimal" value={extent} onChange={(e) => setExtent(e.target.value)} />
        </div>
      )}

      <div>
        <Label className="ind-label">Notering</Label>
        <IndustryInput value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {isExisting && (
        <div>
          <Label className="ind-label">Vad ska hända med passet?</Label>
          <div className="flex flex-wrap gap-2">
            <IndustryButton variant={shiftAction === "open_shift" ? "primary" : "secondary"} onClick={() => setShiftAction("open_shift")}>Öppna passet för anmälan</IndustryButton>
            <IndustryButton variant={shiftAction === "cancel_shift" ? "primary" : "secondary"} onClick={() => setShiftAction("cancel_shift")}>Avboka passet</IndustryButton>
          </div>
        </div>
      )}

      {conflictCount > 0 && (
        <div>
          <Label className="ind-label">{isExisting ? "Fler" : "Personen har"} {conflictCount} publicerade pass under perioden</Label>
          <Select value={conflict} onValueChange={(v) => setConflict(v as Conflict)}>
            <SelectTrigger className="ind-input"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="keep">Behåll passen</SelectItem>
              <SelectItem value="open_shift">Öppna passen för anmälan</SelectItem>
              <SelectItem value="cancel_shift">Avboka passen</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <IndustryButton variant="ghost" onClick={onCancel}>Avbryt</IndustryButton>
        <IndustryButton variant="primary" corners disabled={!valid || busy} onClick={save}>Spara</IndustryButton>
      </div>
    </div>
  );
}
