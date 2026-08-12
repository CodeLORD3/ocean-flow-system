import { Activity, Coins, FileText, Lock, Percent } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatMinutes } from "@/lib/liveStaff";
import { MISSING_COST_HINT, formatSek, type CityKpi, type StoreKpi } from "@/lib/staffKpi";

function Missing() {
  return <span className="text-[10px] font-normal text-muted-foreground">{MISSING_COST_HINT}</span>;
}

/**
 * Dagsrapport för personal.
 *
 * Löper live under dagen på samma data som resten av sidan och blir en låst
 * sammanfattning när dagen är passerad. Nyckeltal utan datakälla visas som
 * platshållare i stället för uppskattningar.
 */
export function LiveDailyReport({
  day,
  live,
  stores,
  cities,
  totals,
  overheadPct,
}: {
  day: string;
  live: boolean;
  stores: StoreKpi[];
  cities: CityKpi[];
  totals: CityKpi;
  overheadPct: number;
}) {
  const withCost = stores.filter((s) => s.laborCost !== null);

  return (
    <Card className="shadow-card">
      <CardContent className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-heading font-bold text-foreground">
            <FileText className="h-3.5 w-3.5 text-primary" /> Dagsrapport personal — {day}
          </p>
          {live ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 text-[10px] text-emerald-600">
              <Activity className="h-3 w-3" /> Löper live
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <Lock className="h-3 w-3" /> Låst sammanfattning
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-md border border-border p-2">
            <p className="text-[10px] text-muted-foreground">Total arbetad tid</p>
            <p className="text-lg font-heading font-bold tabular-nums text-foreground">
              {formatMinutes(totals.workedMinutes)}
            </p>
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Coins className="h-3 w-3" /> Personalkostnad
            </p>
            {totals.laborCost === null ? (
              <Missing />
            ) : (
              <p className="text-lg font-heading font-bold tabular-nums text-foreground">
                {formatSek(totals.laborCost)}
              </p>
            )}
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="text-[10px] text-muted-foreground">Omsättning</p>
            {totals.revenue === null ? (
              <Missing />
            ) : (
              <p className="text-lg font-heading font-bold tabular-nums text-foreground">
                {formatSek(totals.revenue)}
              </p>
            )}
          </div>
          <div className="rounded-md border border-border p-2">
            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Percent className="h-3 w-3" /> Kostnad av omsättning
            </p>
            {totals.costRatioPct === null ? (
              <Missing />
            ) : (
              <p className="text-lg font-heading font-bold tabular-nums text-foreground">
                {totals.costRatioPct.toFixed(1)} %
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="py-1 pr-2 font-medium">Enhet</th>
                <th className="py-1 pr-2 font-medium">Stad</th>
                <th className="py-1 pr-2 text-right font-medium">Arbetad tid</th>
                <th className="py-1 pr-2 text-right font-medium">Personalkostnad</th>
                <th className="py-1 text-right font-medium">Andel av omsättning</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.storeId} className="border-b border-border/60 last:border-0">
                  <td className="py-1 pr-2 text-foreground">{s.name}</td>
                  <td className="py-1 pr-2 text-muted-foreground">{s.city}</td>
                  <td className="py-1 pr-2 text-right tabular-nums text-foreground">
                    {formatMinutes(s.workedMinutes)}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {s.laborCost === null ? (
                      <span className="text-[10px] text-muted-foreground">Lön saknas</span>
                    ) : (
                      <span className="text-foreground">{formatSek(s.laborCost)}</span>
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {s.costRatioPct === null ? (
                      <span className="text-[10px] text-muted-foreground">Omsättning saknas</span>
                    ) : (
                      <span className="text-foreground">{s.costRatioPct.toFixed(1)} %</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cities.length > 0 && (
          <div className="overflow-x-auto">
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Per stad</p>
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Stad</th>
                  <th className="py-1 pr-2 text-right font-medium">Enheter</th>
                  <th className="py-1 pr-2 text-right font-medium">Arbetad tid</th>
                  <th className="py-1 pr-2 text-right font-medium">Personalkostnad</th>
                  <th className="py-1 text-right font-medium">Andel av omsättning</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((c) => (
                  <tr key={c.city} className="border-b border-border/60 last:border-0">
                    <td className="py-1 pr-2 text-foreground">{c.city}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{c.stores}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-foreground">{formatMinutes(c.workedMinutes)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {c.laborCost === null ? (
                        <span className="text-[10px] text-muted-foreground">Lön saknas</span>
                      ) : (
                        <span className="text-foreground">{formatSek(c.laborCost)}</span>
                      )}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {c.costRatioPct === null ? (
                        <span className="text-[10px] text-muted-foreground">Omsättning saknas</span>
                      ) : (
                        <span className="text-foreground">{c.costRatioPct.toFixed(1)} %</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          {withCost.length === 0
            ? `${MISSING_COST_HINT}. Lön sätts per person på Personal, omsättning hämtas från kassan eller butikens dagsrapport.`
            : `Kostnad = arbetad tid × timlön (månadslön fördelas per timme)${overheadPct > 0 ? ` + ${overheadPct} % påslag` : ""}. Personer utan lön räknas inte in.`}
        </p>
      </CardContent>
    </Card>
  );
}
