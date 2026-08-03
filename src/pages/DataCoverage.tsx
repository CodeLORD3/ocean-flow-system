import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Download, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import {
  CHECK_LABELS,
  CheckId,
  CoverageFinding,
  CoverageInput,
  findingsToCsv,
  runCoverageChecks,
  summarize,
} from "@/lib/coverageChecks";

const CHECK_ORDER: CheckId[] = ["yields", "cut_models", "cut_splits", "detail_prices", "margins_vat"];

async function loadCoverageInput(): Promise<CoverageInput> {
  const [products, yields, cutModels, cutSplits, detailPrices, marginTargets, vatRates] = await Promise.all([
    supabase.from("products").select("sku, name, species_group, active").eq("active", true),
    supabase.from("yields").select("species_group"),
    supabase.from("species_cut_models").select("species_group, cut_model"),
    supabase
      .from("cut_model_splits")
      .select("cut_model, detail_form, detail_name, pct_of_fillet, role, is_optional"),
    supabase.from("detail_prices").select("species_group, detail_form, price_list, price_incl_vat, last_set_price"),
    supabase.from("margin_targets").select("price_list, target_pct"),
    supabase.from("vat_rates").select("category, rate, valid_from, valid_to"),
  ]);

  for (const res of [products, yields, cutModels, cutSplits, detailPrices, marginTargets, vatRates]) {
    if (res.error) throw res.error;
  }

  return {
    products: (products.data ?? []) as any,
    yields: (yields.data ?? []) as any,
    cutModels: (cutModels.data ?? []) as any,
    cutSplits: (cutSplits.data ?? []) as any,
    detailPrices: (detailPrices.data ?? []) as any,
    marginTargets: (marginTargets.data ?? []) as any,
    vatRates: (vatRates.data ?? []) as any,
  };
}

export default function DataCoverage() {
  const [ranAt, setRanAt] = useState<Date | null>(null);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["coverage-checks"],
    queryFn: async () => {
      const input = await loadCoverageInput();
      setRanAt(new Date());
      return runCoverageChecks(input);
    },
    enabled: false,
  });

  const findings = data ?? [];
  const totals = useMemo(() => summarize(findings), [findings]);

  const grouped = useMemo(() => {
    const map = new Map<CheckId, CoverageFinding[]>();
    for (const id of CHECK_ORDER) map.set(id, []);
    for (const f of findings) map.get(f.check)!.push(f);
    return map;
  }, [findings]);

  const downloadCsv = () => {
    const url = URL.createObjectURL(new Blob([findingsToCsv(findings)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `datakvalitet_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="px-4 pt-4">
        <h1 className="text-lg font-semibold">Datakvalitet & täckning</h1>
        <p className="text-xs text-muted-foreground">
          Kontrollerar hela kedjan artgrupp → styckningsmodell → detaljer → referenspriser → marginalmål och moms.
          Endast läsning, inget ändras.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <Button size="sm" className="min-h-[44px]" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Kör alla kontroller
        </Button>
        {findings.length > 0 && (
          <Button size="sm" variant="outline" className="min-h-[44px]" onClick={downloadCsv}>
            <Download className="mr-2 h-4 w-4" /> Ladda ner CSV
          </Button>
        )}
        {data && (
          <div className="flex items-center gap-2 text-xs">
            <Badge variant={totals.blocking > 0 ? "destructive" : "outline"}>
              {totals.blocking} blockerande
            </Badge>
            <Badge variant="outline" className={totals.warnings > 0 ? "border-amber-500 text-amber-600" : ""}>
              {totals.warnings} varningar
            </Badge>
            {ranAt && (
              <span className="text-muted-foreground">
                Kördes {ranAt.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            Kontrollen misslyckades: {(error as any).message}
          </div>
        )}

        {!data && !isFetching && (
          <Card>
            <CardContent className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              Kör kontrollerna för att se vilka artgrupper, modeller och priser som saknas.
            </CardContent>
          </Card>
        )}

        {data &&
          CHECK_ORDER.map((id) => {
            const rows = grouped.get(id) ?? [];
            const blocking = rows.filter((r) => r.severity === "blocking").length;
            const warnings = rows.length - blocking;
            const tone =
              blocking > 0
                ? "border-destructive/40 bg-destructive/5"
                : warnings > 0
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-emerald-600/40 bg-emerald-600/5";
            return (
              <Card key={id} className={tone}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      {rows.length === 0 ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                      {CHECK_LABELS[id]}
                    </span>
                    <span className="flex items-center gap-2">
                      {blocking > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {blocking} blockerande
                        </Badge>
                      )}
                      {warnings > 0 && (
                        <Badge variant="outline" className="border-amber-500 text-[10px] text-amber-600">
                          {warnings} varningar
                        </Badge>
                      )}
                      {rows.length === 0 && (
                        <Badge variant="outline" className="border-emerald-600 text-[10px] text-emerald-700">
                          Full täckning
                        </Badge>
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                {rows.length > 0 && (
                  <CardContent className="space-y-1">
                    <div className="max-h-72 space-y-1 overflow-auto">
                      {rows.slice(0, 200).map((f, i) => (
                        <div
                          key={`${f.group}-${f.subject}-${i}`}
                          className="flex flex-wrap items-baseline gap-x-2 rounded-md border bg-background p-2 text-[11px]"
                        >
                          <span className="font-medium">{f.group}</span>
                          <span className="text-muted-foreground">{f.subject}</span>
                          <span
                            className={
                              f.severity === "blocking" ? "text-destructive" : "text-amber-600"
                            }
                          >
                            {f.message}
                          </span>
                        </div>
                      ))}
                    </div>
                    {rows.length > 200 && (
                      <p className="text-[11px] text-muted-foreground">
                        Visar 200 av {rows.length} — ladda ner CSV för hela listan.
                      </p>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
      </div>
    </div>
  );
}
