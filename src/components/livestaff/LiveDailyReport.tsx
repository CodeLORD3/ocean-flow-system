import { Activity, Building2, Coins, FileText, Lock, Percent } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatMinutes } from "@/lib/liveStaff";
import { formatMoney, type CityKpi, type PkOverheadRow, type StoreKpi } from "@/lib/staffKpi";

function Dash() {
  return <span className="text-[10px] text-muted-foreground">—</span>;
}

function Money({ value, currency }: { value: number | null; currency: string }) {
  if (value === null) return <Dash />;
  return <span className="text-foreground">{formatMoney(value, currency)}</span>;
}

/**
 * Dagsrapport för personal.
 *
 * Personalkostnaden kommer från Personalkollen för svenska enheter (rörlig +
 * fast kostnad, plus uppskattning för pass som pågår). Zollikon och Morges
 * saknar Personalkollen och räknas lokalt — de raderna märks "beräknad".
 * Omsättningen är exkl. moms från kassan (Nimpos/Zettle/SumUp) eller
 * butikens dagsrapport. Overhead redovisas som egna rader per bolag och
 * ingår inte i butikernas tal.
 */
export function LiveDailyReport({
  day,
  live,
  stores,
  cities,
  currencyTotals,
  overheadRows,
  entityNames,
}: {
  day: string;
  live: boolean;
  stores: StoreKpi[];
  cities: CityKpi[];
  currencyTotals: CityKpi[];
  overheadRows: PkOverheadRow[];
  entityNames: Map<string, string>;
}) {
  return (
    <TooltipProvider>
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

          {/* Totalt per valuta — ingen omräkning mellan SEK och CHF. */}
          <div className="grid gap-2 md:grid-cols-2">
            {currencyTotals.map((t) => (
              <div key={t.city} className="rounded-md border border-border p-2">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t.city} · {t.stores} enheter
                </p>
                <div className="grid grid-cols-4 gap-1">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Arbetad tid</p>
                    <p className="text-sm font-heading font-bold tabular-nums text-foreground">
                      {formatMinutes(t.costMinutes)}
                    </p>
                  </div>
                  <div>
                    <p className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Coins className="h-3 w-3" /> Personalkostnad
                    </p>
                    <p className="text-sm font-heading font-bold tabular-nums text-foreground">
                      {t.laborCost === null ? "—" : formatMoney(t.laborCost, t.currency ?? "SEK")}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">Omsättning exkl. moms</p>
                    <p className="text-sm font-heading font-bold tabular-nums text-foreground">
                      {t.revenue === null ? "—" : formatMoney(t.revenue, t.currency ?? "SEK")}
                    </p>
                  </div>
                  <div>
                    <p className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                      <Percent className="h-3 w-3" /> Kostnad av oms.
                    </p>
                    <p className="text-sm font-heading font-bold tabular-nums text-foreground">
                      {t.costRatioPct === null ? "—" : `${t.costRatioPct.toFixed(1)} %`}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 pr-2 font-medium">Enhet</th>
                  <th className="py-1 pr-2 font-medium">Stad</th>
                  <th className="py-1 pr-2 text-right font-medium">Arbetad tid</th>
                  <th className="py-1 pr-2 text-right font-medium">Rörlig</th>
                  <th className="py-1 pr-2 text-right font-medium">Fast</th>
                  <th className="py-1 pr-2 text-right font-medium">Schemalagd</th>
                  <th className="py-1 pr-2 text-right font-medium">Personalkostnad</th>
                  <th className="py-1 pr-2 text-right font-medium">Per timme</th>
                  <th className="py-1 pr-2 text-right font-medium">Omsättning</th>
                  <th className="py-1 text-right font-medium">Kostnad av oms.</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.storeId} className="border-b border-border/60 last:border-0">
                    <td className="py-1 pr-2 text-foreground">
                      <span className="flex flex-wrap items-center gap-1">
                        {s.name}
                        {s.costSource === "beräknad" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="secondary" className="text-[9px]">
                                {s.currency === "SEK" ? "ej i Personalkollen" : "beräknad"}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[260px] text-xs">
                              {s.currency === "SEK"
                                ? "Enheten saknar mappning mot Personalkollen. Mappa kostnadsgruppen under Personalkollen → Butiksmappning för att få riktig kostnad."
                                : `Enheten saknar Personalkollen. Kostnaden räknas som arbetad tid × timlön från personalkortet, i ${s.currency}.`}
                            </TooltipContent>
                          </Tooltip>
                        ) : s.ongoingCount > 0 ? (

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant="outline"
                                className="border-emerald-500/30 text-[9px] text-emerald-600"
                              >
                                {s.ongoingCount} pågår
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[240px] text-xs">
                              {s.ongoingCount} pass är instämplade men inte utstämplade. Deras tid och
                              kostnad ({formatMoney(s.ongoingCost ?? 0, s.currency)}) är uppskattade fram
                              till nu och blir exakta vid utstämpling.
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-muted-foreground">{s.city}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-foreground">
                      {formatMinutes(s.costMinutes)}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <Money value={s.variableCost} currency={s.currency} />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <Money value={s.fixedCost} currency={s.currency} />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <Money value={s.scheduledCost} currency={s.currency} />
                    </td>
                    <td className="py-1 pr-2 text-right font-medium tabular-nums">
                      <Money value={s.laborCost} currency={s.currency} />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <Money value={s.costPerHour} currency={s.currency} />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {s.revenue === null ? (
                        <span className="text-[10px] text-muted-foreground">Omsättning saknas</span>
                      ) : (
                        <span className="text-foreground">
                          {formatMoney(s.revenue, s.currency)}
                          {!s.revenueExVat && <span className="text-[9px] text-muted-foreground"> inkl moms</span>}
                        </span>
                      )}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {s.costRatioPct === null ? <Dash /> : `${s.costRatioPct.toFixed(1)} %`}
                    </td>
                  </tr>
                ))}

                {overheadRows.map((o) => (
                  <tr key={o.unitId} className="border-b border-border/60 bg-muted/30 last:border-0">
                    <td className="py-1 pr-2 text-foreground">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-muted-foreground" />
                        {o.unitName}
                        <Badge variant="secondary" className="text-[9px]">overhead</Badge>
                      </span>
                    </td>
                    <td className="py-1 pr-2 text-muted-foreground">
                      {o.legalEntityId ? entityNames.get(o.legalEntityId) ?? o.legalEntityId : "—"}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums text-foreground">
                      {formatMinutes(Math.round(o.workSec / 60))}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <Money value={o.variable} currency="SEK" />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <Money value={o.fixed} currency="SEK" />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <Money value={o.scheduled} currency="SEK" />
                    </td>
                    <td className="py-1 pr-2 text-right font-medium tabular-nums">
                      <Money value={o.actual} currency="SEK" />
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      <Money
                        value={o.workSec > 0 ? o.actual / (o.workSec / 3600) : null}
                        currency="SEK"
                      />
                    </td>
                    <td className="py-1 pr-2 text-right text-[10px] text-muted-foreground">Ingår ej</td>
                    <td className="py-1 text-right text-[10px] text-muted-foreground">Ingår ej</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {cities.length > 0 && (
            <div className="overflow-x-auto">
              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Per stad</p>
              <table className="w-full min-w-[640px] text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Stad</th>
                    <th className="py-1 pr-2 text-right font-medium">Enheter</th>
                    <th className="py-1 pr-2 text-right font-medium">Arbetad tid</th>
                    <th className="py-1 pr-2 text-right font-medium">Rörlig</th>
                    <th className="py-1 pr-2 text-right font-medium">Fast</th>
                    <th className="py-1 pr-2 text-right font-medium">Schemalagd</th>
                    <th className="py-1 pr-2 text-right font-medium">Personalkostnad</th>
                    <th className="py-1 pr-2 text-right font-medium">Per timme</th>
                    <th className="py-1 pr-2 text-right font-medium">Omsättning</th>
                    <th className="py-1 text-right font-medium">Kostnad av oms.</th>
                  </tr>
                </thead>
                <tbody>
                  {cities.map((c) => (
                    <tr key={`${c.city}-${c.currency}`} className="border-b border-border/60 last:border-0">
                      <td className="py-1 pr-2 text-foreground">
                        {c.city} <span className="text-[9px] text-muted-foreground">{c.currency}</span>
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums text-muted-foreground">{c.stores}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-foreground">
                        {formatMinutes(c.costMinutes)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        <Money value={c.variableCost} currency={c.currency ?? "SEK"} />
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        <Money value={c.fixedCost} currency={c.currency ?? "SEK"} />
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        <Money value={c.scheduledCost} currency={c.currency ?? "SEK"} />
                      </td>
                      <td className="py-1 pr-2 text-right font-medium tabular-nums">
                        <Money value={c.laborCost} currency={c.currency ?? "SEK"} />
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        <Money value={c.costPerHour} currency={c.currency ?? "SEK"} />
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        <Money value={c.revenue} currency={c.currency ?? "SEK"} />
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {c.costRatioPct === null ? <Dash /> : `${c.costRatioPct.toFixed(1)} %`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground">
            Personalkostnad = rörlig + fast kostnad från Personalkollen, inklusive uppskattning för pass
            som pågår. Enheter märkta "beräknad" (Zollikon, Morges) saknar Personalkollen och räknas som
            arbetad tid × timlön i CHF. Kostnad av omsättning = personalkostnad / omsättning exkl. moms.
            Overhead visas som egen rad per bolag och ingår inte i butikernas tal.
          </p>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
