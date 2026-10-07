/**
 * "Ej tillgänglig" — adminnivå markerar när en anställd inte kan arbeta.
 * En dag, en period (en rad per dag) eller återkommande veckodag.
 */
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { IndustryButton, IndustryInput } from "@/components/industry";
import { DAY_NAMES, weekdayOf, type Availability } from "@/lib/schedule";

type Mode = "day" | "period" | "weekday";

const addDays = (d: string, n: number) => {
  const x = new Date(`${d}T12:00:00`);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
};

export const isWholeDay = (a: Pick<Availability, "from_time" | "to_time">) =>
  a.from_time.slice(0, 5) === "00:00" && a.to_time.slice(0, 5) >= "23:59";

export function UnavailableDialog({
  open,
  onOpenChange,
  employeeId,
  employeeName,
  date,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  date: string;
  /** Befintlig rad — dialogen öppnas för ändring. */
  row?: Availability | null;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>("day");
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [weekday, setWeekday] = useState(1);
  const [wholeDay, setWholeDay] = useState(true);
  const [fromTime, setFromTime] = useState("08:00");
  const [toTime, setToTime] = useState("17:00");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (row) {
      setMode(row.weekday && !row.date ? "weekday" : "day");
      setFrom(row.date ?? date);
      setTo(row.date ?? date);
      setWeekday(row.weekday ?? weekdayOf(date));
      setWholeDay(isWholeDay(row));
      setFromTime(row.from_time.slice(0, 5));
      setToTime(row.to_time.slice(0, 5));
      setNote(row.note ?? "");
    } else {
      setMode("day");
      setFrom(date);
      setTo(date);
      setWeekday(weekdayOf(date));
      setWholeDay(true);
      setFromTime("08:00");
      setToTime("17:00");
      setNote("");
    }
  }, [open, row, date]);

  const times = wholeDay ? { from_time: "00:00", to_time: "23:59" } : { from_time: fromTime, to_time: toTime };
  const valid =
    (wholeDay || fromTime < toTime) &&
    (mode === "weekday" || (from && (mode === "day" || (to >= from && to <= addDays(from, 366)))));

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["availability"] });
    toast.success(msg);
    onOpenChange(false);
  };

  const save = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const base = { employee_id: employeeId, type: "otillganglig", note: note || null, ...times };
      if (row) {
        const { error } = await supabase
          .from("availability")
          .update({
            ...base,
            date: mode === "weekday" ? null : from,
            weekday: mode === "weekday" ? weekday : null,
          })
          .eq("id", row.id);
        if (error) throw error;
        return done("Ej tillgänglig ändrad");
      }
      const rows: Record<string, unknown>[] = [];
      if (mode === "weekday") rows.push({ ...base, weekday, date: null });
      else if (mode === "day") rows.push({ ...base, date: from, weekday: null });
      else for (let d = from; d <= to; d = addDays(d, 1)) rows.push({ ...base, date: d, weekday: null });
      const { error } = await supabase.from("availability").insert(rows as never);
      if (error) throw error;
      done(rows.length > 1 ? `${rows.length} dagar markerade som ej tillgänglig` : "Markerad som ej tillgänglig");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte spara");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!row) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("availability").delete().eq("id", row.id);
      if (error) throw error;
      done("Ej tillgänglig borttagen");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunde inte ta bort");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="ind max-w-md">
        <DialogHeader>
          <DialogTitle className="ind-h2">{row ? "Ändra ej tillgänglig" : "Ej tillgänglig"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="ind-strong">{employeeName}</p>
          <div className="space-y-1">
            <Label>Gäller</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">En dag</SelectItem>
                {!row && <SelectItem value="period">En period</SelectItem>}
                <SelectItem value="weekday">Återkommande veckodag</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "weekday" ? (
            <div className="space-y-1">
              <Label>Veckodag</Label>
              <Select value={String(weekday)} onValueChange={(v) => setWeekday(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAY_NAMES.map((n, i) => (
                    <SelectItem key={n} value={String(i + 1)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{mode === "period" ? "Från" : "Datum"}</Label>
                <IndustryInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              {mode === "period" && (
                <div className="space-y-1">
                  <Label>Till</Label>
                  <IndustryInput type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
                </div>
              )}
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={wholeDay} onCheckedChange={(c) => setWholeDay(Boolean(c))} /> Hela dagen
          </label>
          {!wholeDay && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Från kl.</Label>
                <IndustryInput type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Till kl.</Label>
                <IndustryInput type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
              </div>
            </div>
          )}
          <div className="space-y-1">
            <Label>Notering</Label>
            <IndustryInput value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          {row && (
            <IndustryButton variant="ghost" disabled={busy} onClick={remove}>
              Ta bort
            </IndustryButton>
          )}
          <IndustryButton variant="ghost" onClick={() => onOpenChange(false)}>
            Avbryt
          </IndustryButton>
          <IndustryButton variant="primary" disabled={!valid || busy} onClick={save}>
            Spara
          </IndustryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
