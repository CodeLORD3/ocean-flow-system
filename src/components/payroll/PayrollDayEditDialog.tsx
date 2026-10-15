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
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employeeId: string;
  employeeName: string;
  date: string;
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

  const att = useQuery({
    queryKey: ["payroll-day-attest", employeeId, date],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attestations")
        .select("id, approved_minutes, computed, status")
        .eq("employee_id", employeeId)
        .eq("date", date);
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
  }, [open, date, employeeId]);
  useEffect(() => {
    if (open) setHours(String(Math.round((current / 60) * 100) / 100).replace(".", ","));
  }, [open, current]);
  useEffect(() => {
    if (kind !== WORK && extent.trim() === "100") setHours("0");
  }, [kind, extent]);

  const type = types.find((t) => t.id === kind);
  const extentNum = Number(extent.replace(",", "."));
  const hoursNum = Number(hours.replace(",", "."));
  const valid =
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
          startDate: date,
          endDate: date,
          extentPct: extentNum,
          note: note || `Ändrad i Granska lön`,
          conflictAction: "keep",
        });
      }
      const ids = (att.data ?? []).map((r) => r.id);
      if (ids.length) {
        const minutes = Math.round(hoursNum * 60);
        const why = note.trim() || (type ? `Ändrad till ${type.name} i Granska lön` : "Tid justerad i Granska lön");
        // Hela tiden läggs på första raden, övriga rader samma dag sätts till 0.
        await decide.mutateAsync({
          ids: [ids[0]],
          approve: minutes > 0,
          basis: minutes > 0 ? "justerad" : null,
          minutes: minutes > 0 ? minutes : null,
          minutesBefore: current,
          note: why,
        });
        if (ids.length > 1) {
          await decide.mutateAsync({ ids: ids.slice(1), approve: false, basis: null, note: why });
        }
      }
      qc.invalidateQueries({ queryKey: ["payroll-fixed-clocked"] });
      qc.invalidateQueries({ queryKey: ["payroll-day-attest"] });
      toast.success("Dagen är ändrad. Tryck Beräkna för att uppdatera löneunderlaget.");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    }
  };

  const svDate = new Date(`${date}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ind max-w-md">
        <DialogHeader>
          <DialogTitle className="ind-h2">Ändra dag</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm">
            <span className="ind-strong">{employeeName}</span> · {svDate}
            <br />
            <span className="ind-muted">Godkänd tid nu: {(current / 60).toLocaleString("sv-SE", { maximumFractionDigits: 2 })} h</span>
          </p>
          <div className="space-y-1">
            <Label>Vad var dagen?</Label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="ind-input"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={WORK}>Arbete (ändra tiden)</SelectItem>
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
            <Label>Arbetad tid som ska räknas (timmar)</Label>
            <IndustryInput inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} />
            {kind === WORK && (att.data?.length ?? 0) === 0 && (
              <p className="text-xs text-destructive">Det finns ingen stämplad tid den här dagen att ändra.</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Kommentar</Label>
            <IndustryInput value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="ind-muted text-xs">Stämplingarna ligger kvar i historiken. Ändringen sparas med ditt namn och tid.</p>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <IndustryButton variant="ghost" onClick={() => onOpenChange(false)}>Avbryt</IndustryButton>
          <IndustryButton variant="primary" disabled={!valid || busy} onClick={save}>Spara</IndustryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
