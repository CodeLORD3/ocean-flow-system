import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { movementLabel } from "@/hooks/useStockMovements";

const nf = (n: number, d = 1) =>
  Number(n || 0).toLocaleString("sv-SE", { maximumFractionDigits: d });

const dt = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString("sv-SE", {
        timeZone: "Europe/Stockholm",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";

type Status = "ok" | "warn" | "fail";

function StatusIcon({ status }: { status: Status }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 text-amber-600" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

function CheckCard({
  title,
  status,
  headline,
  explanation,
  children,
}: {
  title: string;
  status: Status;
  headline: string;
  explanation: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="p-3 pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-2">
            <StatusIcon status={status} />
            {title}
          </span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">{headline}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 text-xs">
        <p className="text-muted-foreground">{explanation}</p>
        {children}
      </CardContent>
    </Card>
  );
}

/**
 * Spårbarhetskontroll: körs mot databasen och visar om kedjan
 * lager → parti → fångst faktiskt håller, inte bara att den borde göra det.
 */
export default function TraceabilityCheck() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");

  const report = useQuery({
    queryKey: ["traceability-report"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("traceability_report" as any);
      if (error) throw error;
      return data as any;
    },
  });

  const lookup = useQuery({
    queryKey: ["traceability-lookup", submitted],
    enabled: submitted.trim().length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("traceability_lookup" as any, {
        _query: submitted,
      });
      if (error) throw error;
      return data as any;
    },
  });

  const r = report.data;
  const bal = r?.balance;
  const noLot: any[] = r?.movements_without_lot ?? [];
  const noRef: any[] = r?.movements_without_reference ?? [];
  const lots = r?.lots;
  const neg = r?.negative_stock;
  const samples: any[] = r?.sample_chains ?? [];

  const balStatus: Status = !bal ? "warn" : bal.mismatched > 0 ? "fail" : "ok";
  const lotStatus: Status = noLot.length === 0 ? "ok" : "warn";
  const refStatus: Status = noRef.length === 0 ? "ok" : "warn";
  const lotDataStatus: Status = !lots ? "warn" : lots.incomplete > 0 ? "warn" : "ok";
  const negStatus: Status = !neg ? "warn" : neg.count > 0 ? "fail" : "ok";
  const sampleStatus: Status = samples.length
    ? samples.every((s) => s.ok)
      ? "ok"
      : "warn"
    : "warn";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Kontrollen körs mot lagrets rörelser just nu. Senast körd: {dt(r?.generated_at)}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs print:hidden"
          onClick={() => report.refetch()}
          disabled={report.isFetching}
        >
          {report.isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Kör kontrollen
        </Button>
      </div>

      {report.isError && (
        <Card className="border-destructive/50">
          <CardContent className="p-3 text-xs text-destructive">
            Kontrollen kunde inte köras: {(report.error as any)?.message}
          </CardContent>
        </Card>
      )}

      {report.isLoading && (
        <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Räknar igenom lagret …
        </div>
      )}

      {r && (
        <div className="grid gap-3 lg:grid-cols-2">
          <CheckCard
            title="Saldo stämmer med rörelserna"
            status={balStatus}
            headline={`${nf(bal?.mismatched ?? 0, 0)} avvikelser av ${nf(bal?.rows ?? 0, 0)}`}
            explanation="Varje saldo ska vara exakt summan av alla in- och utflöden. Avviker något har saldot skrivits utanför rörelserna."
          >
            {(bal?.items ?? []).slice(0, 10).map((i: any, n: number) => (
              <div key={n} className="flex justify-between gap-2">
                <span className="truncate">
                  {i.product} · {i.location}
                </span>
                <span className="font-mono tabular-nums">
                  {nf(i.saldo)} / {nf(i.movements)}
                </span>
              </div>
            ))}
          </CheckCard>

          <CheckCard
            title="Uttag är kopplade till parti"
            status={lotStatus}
            headline={`${noLot.reduce((a, x) => a + Number(x.without_lot || 0), 0)} utan parti`}
            explanation="Ett uttag utan parti går inte att följa bakåt till fångst och leverantör. Varor utan partier (t.ex. emballage) räknas också här."
          >
            {noLot.map((x: any) => (
              <div key={x.movement_type} className="flex justify-between gap-2">
                <span>{movementLabel(x.movement_type)}</span>
                <span className="font-mono tabular-nums">
                  {nf(x.without_lot, 0)} av {nf(x.total, 0)} · {nf(x.kg_without_lot)} kg
                </span>
              </div>
            ))}
          </CheckCard>

          <CheckCard
            title="Rörelser har underlag"
            status={refStatus}
            headline={`${noRef.reduce((a, x) => a + Number(x.without_reference || 0), 0)} utan underlag`}
            explanation="Underlaget visar varför lagret ändrades: order, faktura, kvitto, överföring eller inventering."
          >
            {noRef.map((x: any) => (
              <div key={x.movement_type} className="flex justify-between gap-2">
                <span>{movementLabel(x.movement_type)}</span>
                <span className="font-mono tabular-nums">{nf(x.without_reference, 0)}</span>
              </div>
            ))}
          </CheckCard>

          <CheckCard
            title="Partierna har fullständigt ursprung"
            status={lotDataStatus}
            headline={`${nf(lots?.incomplete ?? 0, 0)} av ${nf(lots?.total ?? 0, 0)} ofullständiga`}
            explanation="Ett intyg kräver art, fångstområde, metod, leverantör och bäst före. Saknas något går intyget inte att skriva ut komplett."
          >
            <div className="flex flex-wrap gap-1">
              {[
                ["art", lots?.missing_latin],
                ["fångstområde", lots?.missing_area],
                ["metod", lots?.missing_method],
                ["leverantör", lots?.missing_supplier],
                ["bäst före", lots?.missing_best_before],
              ].map(([label, n]) => (
                <Badge key={String(label)} variant="outline" className="text-[10px]">
                  {String(label)}: {nf(Number(n) || 0, 0)}
                </Badge>
              ))}
            </div>
            <div className="max-h-32 space-y-0.5 overflow-y-auto">
              {(lots?.items ?? []).slice(0, 20).map((i: any, n: number) => (
                <div key={n} className="flex justify-between gap-2">
                  <span className="truncate font-mono">{i.lot_number}</span>
                  <span className="text-muted-foreground">{(i.missing ?? []).join(", ")}</span>
                </div>
              ))}
            </div>
          </CheckCard>

          <CheckCard
            title="Inga negativa saldon"
            status={negStatus}
            headline={`${nf(neg?.count ?? 0, 0)} rader`}
            explanation="Ett negativt saldo betyder att mer sålts än som levererats in — då saknas en inleverans i kedjan."
          >
            {(neg?.items ?? []).slice(0, 10).map((i: any, n: number) => (
              <div key={n} className="flex justify-between gap-2">
                <span className="truncate">
                  {i.product} · {i.location}
                </span>
                <span className="font-mono tabular-nums text-destructive">{nf(i.quantity)}</span>
              </div>
            ))}
          </CheckCard>

          <CheckCard
            title="Stickprov följt bakåt"
            status={sampleStatus}
            headline={`${samples.filter((s) => s.ok).length} av ${samples.length} hela`}
            explanation="De fem senaste försäljningarna följs bakåt till parti, leverantör och fångstområde."
          >
            {samples.map((s: any, n: number) => (
              <div key={n} className="rounded border border-border/60 p-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {s.product} · {nf(s.quantity)} kg
                  </span>
                  <StatusIcon status={s.ok ? "ok" : "warn"} />
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {dt(s.created_at)} · {movementLabel(s.movement_type)} · {s.location}
                </div>
                <div className="text-[11px]">
                  {s.ok ? (
                    <>
                      <span className="font-mono">{s.lot_number}</span> · {s.catch_area}
                      {s.vessel ? ` · ${s.vessel}` : ""} · {s.supplier}
                    </>
                  ) : (
                    <span className="text-amber-700">Kedjan bryts: {s.broken_at}</span>
                  )}
                </div>
              </div>
            ))}
          </CheckCard>
        </div>
      )}

      <Card>
        <CardHeader className="p-3 pb-2">
          <CardTitle className="text-sm">Sök kedjan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-0 text-xs">
          <form
            className="flex gap-2 print:hidden"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmitted(query);
            }}
          >
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Partinummer, ordernummer eller fakturanummer"
              className="h-8 text-xs"
            />
            <Button type="submit" size="sm" className="h-8 gap-1 text-xs">
              <Search className="h-3 w-3" /> Sök
            </Button>
          </form>

          {lookup.isFetching && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Söker …
            </div>
          )}

          {lookup.data && !lookup.data.found && (
            <p className="text-muted-foreground">Ingen träff på ”{submitted}”.</p>
          )}

          {lookup.data?.found && (
            <div className="space-y-3">
              {(lookup.data.orders ?? []).length > 0 && (
                <div className="space-y-1">
                  <div className="font-medium">Beställningar</div>
                  {lookup.data.orders.map((o: any, n: number) => (
                    <div key={n} className="flex flex-wrap justify-between gap-2">
                      <span>
                        <span className="font-mono">{o.order_number}</span> · {o.customer} ·{" "}
                        {o.store}
                      </span>
                      <span className="text-muted-foreground">
                        {o.wanted_date} · {o.status}
                        {o.invoice ? ` · faktura ${o.invoice}` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {(lookup.data.lots ?? []).length > 0 && (
                <div className="space-y-1">
                  <div className="font-medium">Partier</div>
                  {lookup.data.lots.map((l: any, n: number) => (
                    <div key={n} className="rounded border border-border/60 p-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="font-mono">{l.lot_number}</span>
                        <span>{l.product}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {[l.latin_name, l.catch_area, l.production_method, l.vessel, l.supplier]
                          .filter(Boolean)
                          .join(" · ")}
                        {l.best_before ? ` · bäst före ${l.best_before}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {(lookup.data.movements ?? []).length > 0 && (
                <div className="space-y-0.5">
                  <div className="font-medium">Rörelser</div>
                  <div className="max-h-64 overflow-y-auto">
                    {lookup.data.movements.map((m: any, n: number) => (
                      <div key={n} className="flex flex-wrap justify-between gap-2 py-0.5">
                        <span className="truncate">
                          {dt(m.created_at)} · {movementLabel(m.movement_type)} · {m.product} ·{" "}
                          {m.location}
                        </span>
                        <span className="font-mono tabular-nums">
                          {nf(m.quantity)} {m.lot_number ? `· ${m.lot_number}` : "· utan parti"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
