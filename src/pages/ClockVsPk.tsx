/**
 * Parallellkörningsvy: egen klocka mot Personalkollen.
 *
 * Beviset som avgör när en butik kan växlas över: per person och dag jämförs
 * tid in/ut och timmar mot pk_logged_times, med differens i minuter.
 */
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { useTimeEntries, usePkLoggedTimes } from "@/hooks/useClock";
import { useEmployees } from "@/hooks/useEmployees";
import { useStores } from "@/hooks/useStores";
import { summarizeDays, hhmm, durationLabel } from "@/lib/timeEntries";

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000).toISOString().slice(0, 10);

interface Row {
  key: string;
  day: string;
  employee_id: string;
  clockIn: string | null;
  clockOut: string | null;
  clockSeconds: number | null;
  pkIn: string | null;
  pkOut: string | null;
  pkSeconds: number | null;
  diffMinutes: number | null;
}

export default function ClockVsPk() {
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(today());
  const [storeId, setStoreId] = useState<string>("");

  const { data: stores = [] } = useStores();
  const { data: employees = [] } = useEmployees(true);
  const { data: entries = [], isLoading: loadingClock } = useTimeEntries(from, to, storeId || null);
  const { data: pkRows = [], isLoading: loadingPk } = usePkLoggedTimes(from, to, storeId || null);

  const employeeName = useMemo(
    () => new Map(employees.map((e) => [e.id, `${e.first_name} ${e.last_name}`])),
    [employees],
  );

  const rows = useMemo<Row[]>(() => {
    const clock = summarizeDays(entries);
    const map = new Map<string, Row>();

    for (const c of clock) {
      const key = `${c.employee_id}|${c.day}`;
      map.set(key, {
        key,
        day: c.day,
        employee_id: c.employee_id,
        clockIn: c.first_in,
        clockOut: c.last_out,
        clockSeconds: c.work_seconds,
        pkIn: null,
        pkOut: null,
        pkSeconds: null,
        diffMinutes: null,
      });
    }

    for (const p of pkRows) {
      if (!p.employee_id) continue;
      const key = `${p.employee_id}|${p.day}`;
      const existing = map.get(key);
      if (existing) {
        existing.pkIn = existing.pkIn ?? p.start;
        existing.pkOut = p.stop ?? existing.pkOut;
        existing.pkSeconds = (existing.pkSeconds ?? 0) + p.seconds;
      } else {
        map.set(key, {
          key,
          day: p.day,
          employee_id: p.employee_id,
          clockIn: null,
          clockOut: null,
          clockSeconds: null,
          pkIn: p.start,
          pkOut: p.stop,
          pkSeconds: p.seconds,
          diffMinutes: null,
        });
      }
    }

    const list = [...map.values()].map((r) => ({
      ...r,
      diffMinutes:
        r.clockSeconds != null && r.pkSeconds != null
          ? Math.round((r.clockSeconds - r.pkSeconds) / 60)
          : null,
    }));
    return list.sort((a, b) => b.day.localeCompare(a.day) || a.employee_id.localeCompare(b.employee_id));
  }, [entries, pkRows]);

  const deviations = rows.filter((r) => r.diffMinutes != null && Math.abs(r.diffMinutes) > 5);
  const totalDiff = rows.reduce((sum, r) => sum + Math.abs(r.diffMinutes ?? 0), 0);
  const missingPk = rows.filter((r) => r.clockSeconds != null && r.pkSeconds == null).length;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Klocka vs Personalkollen</h1>
        <p className="text-sm text-muted-foreground">
          Parallellkörning per person och dag. Differens över 5 minuter markeras rött.
        </p>
      </div>

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

      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Jämförda rader</p>
          <p className="text-2xl font-mono tabular-nums">{rows.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Dagar med avvikelse &gt; 5 min</p>
          <p className="text-2xl font-mono tabular-nums text-destructive">{deviations.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total differens (min)</p>
          <p className="text-2xl font-mono tabular-nums">{totalDiff}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Saknas i Personalkollen</p>
          <p className="text-2xl font-mono tabular-nums">{missingPk}</p>
        </Card>
      </div>

      <Card className="overflow-x-auto">
        {loadingClock || loadingPk ? (
          <div className="p-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Ingen jämförbar tid i perioden.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="p-2">Datum</th>
                <th className="p-2">Person</th>
                <th className="p-2">Klocka in</th>
                <th className="p-2">Klocka ut</th>
                <th className="p-2">Klocka tid</th>
                <th className="p-2">PK in</th>
                <th className="p-2">PK ut</th>
                <th className="p-2">PK tid</th>
                <th className="p-2">Diff (min)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bad = r.diffMinutes != null && Math.abs(r.diffMinutes) > 5;
                return (
                  <tr key={r.key} className={`border-b ${bad ? "bg-destructive/10" : ""}`}>
                    <td className="p-2 font-mono">{r.day}</td>
                    <td className="p-2">{employeeName.get(r.employee_id) ?? r.employee_id}</td>
                    <td className="p-2 font-mono tabular-nums">{hhmm(r.clockIn)}</td>
                    <td className="p-2 font-mono tabular-nums">{hhmm(r.clockOut)}</td>
                    <td className="p-2 font-mono tabular-nums">
                      {r.clockSeconds != null ? durationLabel(r.clockSeconds) : "–"}
                    </td>
                    <td className="p-2 font-mono tabular-nums">{hhmm(r.pkIn)}</td>
                    <td className="p-2 font-mono tabular-nums">{hhmm(r.pkOut)}</td>
                    <td className="p-2 font-mono tabular-nums">
                      {r.pkSeconds != null ? durationLabel(r.pkSeconds) : "–"}
                    </td>
                    <td className="p-2 font-mono tabular-nums">
                      {r.diffMinutes == null ? (
                        <Badge variant="outline" className="text-[10px]">
                          endast en källa
                        </Badge>
                      ) : (
                        <span className={bad ? "text-destructive font-semibold" : ""}>
                          {r.diffMinutes > 0 ? "+" : ""}
                          {r.diffMinutes}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
