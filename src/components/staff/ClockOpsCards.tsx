import { Link } from "react-router-dom";
import { IndustryRow, SectionLabel, StatusLabel, DecisionBar, DecisionMetric } from "@/components/industry";
import { useClockOpsDay } from "@/hooks/useClockOps";
import { laggTillSvenskaDagar, svenskDatum } from "@/lib/swedishTime";
import { SWITCHOVER_DATE } from "@/lib/payrollPeriod";

const TONE_TEXT: Record<string, string> = {
  green: "Stämplat",
  yellow: "Fel system",
  red: "Inga stämplingar",
  pending: "Ej växlad",
  none: "Inga pass",
};

const tone = (t: string): "ok" | "progress" | "alert" | "neutral" =>
  t === "green" ? "ok" : t === "yellow" ? "progress" : t === "red" ? "alert" : "neutral";

/**
 * Daglig driftbevakning från växlingen 2026-09-16: per svensk enhet visas
 * igårs stämplingar, varningar om stämpling i fel system och röd flagg när
 * enheten hade schemalagda pass men noll stämplingar.
 */
export function ClockOpsCards() {
  const igar = laggTillSvenskaDagar(svenskDatum(), -1);
  const { data: rows = [], isLoading } = useClockOpsDay(igar);

  const red = rows.filter((r) => r.tone === "red").length;
  const warnings = rows.reduce((s, r) => s + r.warnings, 0);
  const punches = rows.reduce((s, r) => s + r.punches, 0);
  const pending = rows.filter((r) => r.tone === "pending").length;

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <SectionLabel>Driftbevakning</SectionLabel>
          <h2 className="ind-h1 text-lg">Stämpelklockan igår ({igar})</h2>
        </div>
        <Link to="/clock-vs-pk" className="text-sm underline">
          Historik
        </Link>
      </div>

      <DecisionBar>
        <DecisionMetric label="Stämplingar" value={String(punches)} />
        <DecisionMetric label="Fel system" value={String(warnings)} tone={warnings > 0 ? "progress" : "ok"} />
        <DecisionMetric label="Enheter utan stämpling" value={String(red)} tone={red > 0 ? "alert" : "ok"} />
        <DecisionMetric label="Väntar på växling" value={String(pending)} />
      </DecisionBar>

      {isLoading ? (
        <p className="ind-muted text-sm">Hämtar gårdagens läge…</p>
      ) : rows.length === 0 ? (
        <p className="ind-muted text-sm">Inga svenska enheter med växlingsdatum.</p>
      ) : (
        rows.map((r) => (
          <IndustryRow key={r.store_id} edge={r.tone === "red" ? "strong" : "none"} className="flex-wrap gap-3">
            <span className="min-w-[200px]">{r.store_name}</span>
            <StatusLabel tone={tone(r.tone)}>{TONE_TEXT[r.tone] ?? r.tone}</StatusLabel>
            <span className="ind-mono text-sm">
              {r.punches} stämplingar · {r.employees_punched} personer
            </span>
            <span className="ind-mono text-sm">{r.scheduled_shifts} schemalagda pass</span>
            <span className="ml-auto ind-mono text-sm ind-muted">
              {r.warnings > 0 ? `${r.warnings} varningar fel system` : `klocka från ${r.clock_active_from ?? SWITCHOVER_DATE}`}
            </span>
          </IndustryRow>
        ))
      )}
    </section>
  );
}
