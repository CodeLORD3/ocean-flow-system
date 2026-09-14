import { Link } from "react-router-dom";
import { IndustryRow, SectionLabel, StatusLabel } from "@/components/industry";
import { useStores } from "@/hooks/useStores";
import { useParallelRun } from "@/hooks/useParallelRun";
import { STREAK_TARGET_DAYS, TONE_LABEL, type DayTone } from "@/lib/parallelRun";
import { laggTillSvenskaDagar, svenskDatum } from "@/lib/swedishTime";

const tone = (t: DayTone): "ok" | "progress" | "alert" | "neutral" =>
  t === "green" ? "ok" : t === "yellow" ? "progress" : t === "red" ? "alert" : "neutral";

/**
 * Kort på adminstartsidan: dagens läge per butik i parallellkörningen mot
 * Personalkollen, plus hur många sammanhängande stämmande dagar butiken har.
 */
export function ParallelRunCards() {
  const to = svenskDatum();
  const from = laggTillSvenskaDagar(to, -STREAK_TARGET_DAYS);
  const { storeStatus, isLoading } = useParallelRun(from, to);
  const { data: stores = [] } = useStores();
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  const ordered = [...storeStatus].sort((a, b) => b.streak - a.streak);

  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <SectionLabel>Parallellkörning</SectionLabel>
          <h2 className="ind-h1 text-lg">Klocka mot Personalkollen</h2>
        </div>
        <Link to="/clock-vs-pk" className="text-sm underline">
          Öppna vyn
        </Link>
      </div>

      {isLoading ? (
        <p className="ind-muted text-sm">Hämtar dagens jämförelse…</p>
      ) : ordered.length === 0 ? (
        <p className="ind-muted text-sm">Ingen jämförbar tid ännu. Stationerna behöver aktiveras i butikerna.</p>
      ) : (
        ordered.map((s) => (
          <IndustryRow key={s.store_id} edge={s.latest?.tone === "red" ? "strong" : "none"} className="flex-wrap gap-3">
            <span className="min-w-[200px]">{storeName.get(s.store_id) ?? "Okänd enhet"}</span>
            <StatusLabel tone={tone(s.latest?.tone ?? "none")}>
              {TONE_LABEL[s.latest?.tone ?? "none"]}
              {s.latest ? ` · ${s.latest.worstDiff} min` : ""}
            </StatusLabel>
            <span className="ind-mono text-sm">
              {s.streak} / {STREAK_TARGET_DAYS} sammanhängande stämmande dagar
            </span>
            <span className="ml-auto ind-mono text-sm ind-muted">
              {s.greenDays} gröna · {s.yellowDays} gula · {s.redDays} röda
            </span>
          </IndustryRow>
        ))
      )}
    </section>
  );
}
