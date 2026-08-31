/**
 * Parallellkörningsvy: egen klocka mot Personalkollen.
 *
 * Beviset som avgör när en butik kan växlas över: per person och dag jämförs
 * tid in/ut och timmar mot pk_logged_times, med differens i minuter.
 */
import { useMemo, useState } from "react";
import {
  IndustryFrame,
  IndustryRow,
  SectionLabel,
  StatusLabel,
  DecisionBar,
  DecisionMetric,
} from "@/components/industry";
import { Input } from "@/components/ui/input";
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
import { laggTillSvenskaDagar, svenskDatum } from "@/lib/swedishTime";
import { summarizeDays, hhmm, durationLabel } from "@/lib/timeEntries";

const today = () => svenskDatum();
const daysAgo = (n: number) => laggTillSvenskaDagar(today(), -n);

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

  const TOLERANCE = 5;
  const compared = rows.filter((r) => r.diffMinutes != null);
  const singleSource = rows.filter((r) => r.diffMinutes == null);
  const deviations = compared.filter((r) => Math.abs(r.diffMinutes!) > TOLERANCE);
  const totalDiff = rows.reduce((sum, r) => sum + Math.abs(r.diffMinutes ?? 0), 0);
  // Beslutsordning: störst differens överst.
  const ordered = [...compared].sort(
    (a, b) => Math.abs(b.diffMinutes!) - Math.abs(a.diffMinutes!) || b.day.localeCompare(a.day),
  );

  return (
    <IndustryFrame className="p-4 sm:p-6">
      <DecisionBar>
        <div className="mr-auto">
          <SectionLabel>Parallellkörning</SectionLabel>
          <h1 className="ind-h1">Klocka vs Personalkollen</h1>
          <p className="ind-muted text-sm">
            {deviations.length} dagar med avvikelse över {TOLERANCE} min · total differens {totalDiff} min
          </p>
        </div>
        <DecisionMetric
          label="Dagar med avvikelse"
          value={deviations.length}
          tone={deviations.length > 0 ? "progress" : "ok"}
        />
        <DecisionMetric label="Total differens (min)" value={totalDiff} />
        <DecisionMetric label="Jämförda rader" value={compared.length} />
      </DecisionBar>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <SectionLabel>Från</SectionLabel>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <SectionLabel>Till</SectionLabel>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
        </div>
        <div className="space-y-1">
          <SectionLabel>Enhet</SectionLabel>
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

      <section className="mt-6">
        <SectionLabel className="mb-2">Jämförelse — störst differens överst</SectionLabel>
        {loadingClock || loadingPk ? (
          <Loader2 className="h-5 w-5 animate-spin ind-muted" />
        ) : ordered.length === 0 ? (
          <p className="ind-muted text-sm">Ingen jämförbar tid i perioden.</p>
        ) : (
          ordered.map((r) => {
            const diff = r.diffMinutes!;
            const outside = Math.abs(diff) > TOLERANCE;
            return (
              <IndustryRow key={r.key} edge={outside ? "strong" : "none"} muted={!outside} className="flex-wrap">
                <span className="ind-mono min-w-[100px]">{r.day}</span>
                <span className="min-w-[180px]">{employeeName.get(r.employee_id) ?? r.employee_id}</span>
                <span className="ind-mono">
                  Klocka {hhmm(r.clockIn)}–{hhmm(r.clockOut)}{" "}
                  {r.clockSeconds != null ? durationLabel(r.clockSeconds) : "–"}
                </span>
                <span className="ind-mono">
                  PK {hhmm(r.pkIn)}–{hhmm(r.pkOut)}{" "}
                  {r.pkSeconds != null ? durationLabel(r.pkSeconds) : "–"}
                </span>
                <span className="ml-auto">
                  {outside ? (
                    <StatusLabel tone="progress">
                      Differens {diff > 0 ? "+" : ""}
                      {diff} min
                    </StatusLabel>
                  ) : (
                    <StatusLabel tone="neutral">Inom tolerans</StatusLabel>
                  )}
                </span>
              </IndustryRow>
            );
          })
        )}
      </section>

      {singleSource.length > 0 && (
        <section className="mt-8">
          <details>
            <summary className="ind-label cursor-pointer">
              Endast en källa ({singleSource.length})
            </summary>
            <div className="mt-2">
              {singleSource.map((r) => (
                <IndustryRow key={r.key} edge="neutral" muted className="flex-wrap">
                  <span className="ind-mono min-w-[100px]">{r.day}</span>
                  <span className="min-w-[180px]">{employeeName.get(r.employee_id) ?? r.employee_id}</span>
                  <StatusLabel tone="neutral">
                    {r.clockSeconds != null ? "Endast klocka" : "Endast Personalkollen"}
                  </StatusLabel>
                </IndustryRow>
              ))}
            </div>
          </details>
        </section>
      )}
    </IndustryFrame>
  );
}

