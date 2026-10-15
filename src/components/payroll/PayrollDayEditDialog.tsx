/**
 * Ändra en dag i efterhand från Granska lön: justera godkänd tid eller gör om
 * dagen till frånvaro (sjuk, semester, VAB …). Frånvaron registreras via
 * admin_register_absence och dagens attest beslutas om med journalrad, så att
 * stämplingarna ligger kvar orörda men inte räknas som arbetad tid.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { IndustryButton, IndustryInput } from "@/components/industry";
import { useAbsenceTypes, useAdminRegisterAbsence } from "@/hooks/useAbsence";
import { useDecideAttestations } from "@/hooks/useAttest";

const WORK = "__arbete";

export function PayrollDayEditDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  minDate,
  maxDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  date: string;
  minDate?: string;
  maxDate?: string;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { data: types = [] } = useAbsenceTypes();
  const register = useAdminRegisterAbsence();
  const decide = useDecideAttestations();
  const [kind, setKind] = useState(WORK);
  const [extent, setExtent] = useState("100");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const isRange = to !== from;

  const att = useQuery({
    queryKey: ["payroll-day-attest", employeeId, from, to],
    enabled: open && !!from && !!to && to >= from,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attestations")
        .select("id, date, approved_minutes, computed, status")
        .eq("employee_id", employeeId)
        .gte("date", from)
        .lte("date", to)
        .order("date");
      if (error) throw error;
      return data ?? [];
    },
  });
  const current = useMemo(
    () =>
      (att.data ?? []).reduce((s, r) => {
        if (r.status === "rejected") return s;
        const c = (r.computed ?? {}) as { clocked_minutes?: number };
        return s + Number(r.approved_minutes ?? c.clocked_minutes ?? 0);
      }, 0),
    [att.data],
  );

  useEffect(() => {
    if (!open) return;
    setKind(WORK);
    setExtent("100");
    setNote("");
    setFrom(date);
    setTo(date);
  }, [open, date, employeeId]);
  useEffect(() => {
    if (isRange && kind === WORK && types[0]) setKind(types[0].id);
  }, [isRange, kind, types]);
  useEffect(() => {
    if (open && !isRange) setHours(String(Math.round((current / 60) * 100) / 100).replace(".", ","));
  }, [open, current, isRange]);
  useEffect(() => {
    if (kind !== WORK && extent.trim() === "100") setHours("0");
  }, [kind, extent]);

  const type = types.find((t) => t.id === kind);
  const extentNum = Number(extent.replace(",", "."));
  const hoursNum = Number(hours.replace(",", "."));
  const valid =
    !!from && !!to && to >= from &&
    (!minDate || from >= minDate) && (!maxDate || to <= maxDate) &&
    Number.isFinite(hoursNum) && hoursNum >= 0 && hoursNum <= 24 &&
    (kind === WORK || (extentNum > 0 && extentNum <= 100)) &&
    (kind !== WORK || (att.data?.length ?? 0) > 0);
  const busy = register.isPending || decide.isPending;

  const save = async () => {
    if (!valid) return;
    try {
      if (type) {
        await register.mutateAsync({
          employeeId,
          typeId: type.id,
          startDate: from,
          endDate: to,
          extentPct: extentNum,
          note: note || `Ändrad i Granska lön`,
          conflictAction: "keep",
        });
      }
      // Gruppera per dag: hela tiden på dagens första rad, övriga rader samma dag sätts till 0.
      const byDay = new Map<string, { id: string; min: number }[]>();
      for (const r of att.data ?? []) {
        const c = (r.computed ?? {}) as { clocked_minutes?: number };
        const list = byDay.get(r.date) ?? [];
        list.push({ id: r.id, min: r.status === "rejected" ? 0 : Number(r.approved_minutes ?? c.clocked_minutes ?? 0) });
        byDay.set(r.date, list);
      }
      const minutes = Math.round(hoursNum * 60);
      const why = note.trim() || (type ? `Ändrad till ${type.name} i Granska lön` : "Tid justerad i Granska lön");
      for (const list of byDay.values()) {
        await decide.mutateAsync({
          ids: [list[0].id],
          approve: minutes > 0,
          basis: minutes > 0 ? "justerad" : null,
          minutes: minutes > 0 ? minutes : null,
          minutesBefore: list.reduce((t, x) => t + x.min, 0),
          note: why,
        });
        if (list.length > 1) {
          await decide.mutateAsync({ ids: list.slice(1).map((x) => x.id), approve: false, basis: null, note: why });
        }
      }
      qc.invalidateQueries({ queryKey: ["payroll-fixed-clocked"] });
      qc.invalidateQueries({ queryKey: ["payroll-day-attest"] });
      toast.success((isRange ? "Perioden" : "Dagen") + " är ändrad. Tryck Beräkna för att uppdatera löneunderlaget.");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    }
  };

  const sv = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
  const svDate = isRange ? `${sv(from)} – ${sv(to)}` : sv(from);
  const days = new Set((att.data ?? []).map((r) => r.date)).size;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ind max-w-md">
        <DialogHeader>
          <DialogTitle className="ind-h2">{isRange ? "Ändra period" : "Ändra dag"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm">
            <span className="ind-strong">{employeeName}</span> · {svDate}
            <br />
            <span className="ind-muted">
              Godkänd tid nu: {(current / 60).toLocaleString("sv-SE", { maximumFractionDigits: 2 })} h{isRange ? ` på ${days} stämplade dagar` : ""}
            </span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Från</Label>
              <IndustryInput type="date" min={minDate} max={maxDate} value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
            </div>
            <div className="space-y-1">
              <Label>Till och med</Label>
              <IndustryInput type="date" min={from} max={maxDate} value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>{isRange ? "Vad gäller perioden?" : "Vad var dagen?"}</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="ind-input"><SelectValue /></SelectTrigger>
              <SelectContent>
                {!isRange && <SelectItem value={WORK}>Arbete (ändra tiden)</SelectItem>}
                {types.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {kind !== WORK && (
            <div className="space-y-1">
              <Label>Omfattning (%)</Label>
              <IndustryInput inputMode="decimal" value={extent} onChange={(e) => setExtent(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>{isRange ? "Arbetad tid som ska räknas per stämplad dag (timmar)" : "Arbetad tid som ska räknas (timmar)"}</Label>
            <IndustryInput inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            {kind === WORK && (att.data?.length ?? 0) === 0 && (
              <p className="text-xs text-destructive">Det finns ingen stämplad tid den här dagen att ändra.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Kommentar</Label>
            <IndustryInput value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="ind-muted text-xs">Gäller även dagar som redan är attesterade. Stämplingarna ligger kvar i historiken. Ändringen sparas med ditt namn och tid.</p>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <IndustryButton variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</IndustryButton>
          <IndustryButton variant="primary" disabled={!valid || busy} onClick={save}>Spara</IndustryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
