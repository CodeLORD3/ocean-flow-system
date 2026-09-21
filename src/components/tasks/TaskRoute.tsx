import { useState } from "react";
import { AlertTriangle, ArrowDown, Footprints, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { metersText, PURPOSE_LABEL, walkMinutes, walkText, type WorkRoute } from "@/lib/taskRoute";
import { minutesText } from "@/lib/taskStandardTime";

const PURPOSE_TONE: Record<string, string> = {
  hamta: "bg-muted text-foreground",
  utfor: "bg-primary/10 text-primary",
  kontrollera: "bg-sky-500/10 text-sky-700",
  tillbaka: "bg-muted text-foreground",
};

/**
 * Arbetsvägen som personalen ser den: plats → sak → handling → tid.
 * Ingen teknik, inga tabeller. Detaljerna ligger längre ned för den som vill.
 */
export function TaskRoute({
  route,
  alternative,
  usingStandard,
  drift,
  onShowOnMap,
  onReview,
  totals,
}: {
  route: WorkRoute;
  alternative?: WorkRoute | null;
  usingStandard?: boolean;
  drift?: string[];
  onShowOnMap?: () => void;
  onReview?: () => void;
  totals?: { work?: number | null; prepare?: number | null; check?: number | null; restore?: number | null };
}) {
  const [showAlt, setShowAlt] = useState(false);
  const walk = walkMinutes(route.walkSeconds);
  const total =
    (totals?.work ?? 0) + (totals?.prepare ?? 0) + (totals?.check ?? 0) + (totals?.restore ?? 0) + (walk ?? 0);

  if (route.stops.length === 0) {
    return (
      <Card className="p-4">
        <h3 className="mb-1 text-sm font-semibold">Arbetsväg</h3>
        <p className="text-sm text-muted-foreground">
          Lägg in uppgiftens område och vad arbetet behöver, så ritas vägen upp här.
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Arbetsväg</h3>
        {usingStandard && <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">Vår standardväg</span>}
        {onShowOnMap && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={onShowOnMap}>
            <MapIcon className="mr-1 h-4 w-4" /> Visa hela vägen på kartan
          </Button>
        )}
      </div>

      {drift && drift.length > 0 && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
          <p className="font-medium">
            <AlertTriangle className="mr-1 inline h-4 w-4" /> Arbetsvägen kan behöva uppdateras
          </p>
          {drift.map((d) => (
            <p key={d}>{d}</p>
          ))}
          {onReview && (
            <Button variant="outline" size="sm" className="mt-2" onClick={onReview}>
              Granska vägen
            </Button>
          )}
        </div>
      )}

      <ol className="space-y-1">
        {route.stops.map((stop, i) => (
          <li key={stop.key}>
            <div className="flex gap-3 rounded-lg border p-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold uppercase">{stop.zoneName ?? "Område saknas"}</p>
                {stop.place && <p className="text-xs text-muted-foreground">{stop.place}</p>}
                <span className={cn("mt-1 inline-block rounded px-2 py-0.5 text-xs", PURPOSE_TONE[stop.purpose])}>
                  {PURPOSE_LABEL[stop.purpose]}
                </span>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {stop.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
                {stop.minutes ? <p className="mt-1 text-xs text-muted-foreground">ca {minutesText(stop.minutes)}</p> : null}
              </div>
            </div>
            {i < route.legs.length && (
              <div className="flex items-center gap-2 py-1 pl-4 text-xs text-muted-foreground">
                <ArrowDown className="h-3.5 w-3.5" />
                <Footprints className="h-3.5 w-3.5" />
                <span>
                  {[metersText(route.legs[i].meters), walkText(route.legs[i].seconds)].filter(Boolean).join(" · ") ||
                    "avstånd saknas"}
                  {route.legs[i].estimated && route.legs[i].meters != null ? " (uppskattat)" : ""}
                </span>
              </div>
            )}
          </li>
        ))}
      </ol>

      <div className="space-y-1 rounded-lg bg-muted/50 p-3 font-mono text-sm tabular-nums">
        {totals?.work ? <Row label="Arbete" value={minutesText(totals.work)} /> : null}
        <Row label="Förflyttning" value={walk ? minutesText(walk) : "—"} />
        {totals?.prepare ? <Row label="Förberedelse" value={minutesText(totals.prepare)} /> : null}
        {totals?.check ? <Row label="Kontroll" value={minutesText(totals.check)} /> : null}
        {totals?.restore ? <Row label="Återställning" value={minutesText(totals.restore)} /> : null}
        <div className="flex justify-between border-t pt-1 font-semibold">
          <span className="font-sans">Beräknad totaltid</span>
          <span>{total > 0 ? `ca ${minutesText(total)}` : "—"}</span>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span className="font-sans">Förflyttning</span>
          <span>{[metersText(route.totalMeters), walkText(route.walkSeconds)].filter(Boolean).join(" · ") || "—"}</span>
        </div>
      </div>

      {usingStandard && alternative && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>
              Standardväg {[metersText(route.totalMeters), walkText(route.walkSeconds)].filter(Boolean).join(" · ")}
            </span>
            <span>
              · Systemets beräknade förslag{" "}
              {[metersText(alternative.totalMeters), walkText(alternative.walkSeconds)].filter(Boolean).join(" · ")}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setShowAlt((v) => !v)}>
              {showAlt ? "Stäng alternativ" : "Visa alternativ"}
            </Button>
          </div>
          {showAlt && (
            <ol className="space-y-1 rounded-lg border p-3 text-sm">
              {alternative.stops.map((s, i) => (
                <li key={s.key}>
                  {i + 1}. {s.zoneName ?? "Område saknas"} — {PURPOSE_LABEL[s.purpose]}: {s.items.join(", ")}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="font-sans text-muted-foreground">{label}</span>
      <span>{value ?? "—"}</span>
    </div>
  );
}
