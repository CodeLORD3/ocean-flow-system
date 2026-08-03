import { speciesKey } from "@/lib/asciiFold";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface MissingRow {
  species_group: string;
  products: { sku: string; name: string }[];
}

/**
 * Kontrollerar utbytestäckning mot VERKLIG produktdata, inte mot förslagslistan.
 * Listar alla aktiva produkter vars species_group saknar rad i yields, samt
 * aktiva produkter som helt saknar species_group.
 */
export function YieldCoverageCheck() {
  const [running, setRunning] = useState(false);
  const [missing, setMissing] = useState<MissingRow[] | null>(null);
  const [noGroup, setNoGroup] = useState<{ sku: string; name: string }[]>([]);

  const run = async () => {
    setRunning(true);
    try {
      const [{ data: products, error: pErr }, { data: yields, error: yErr }] = await Promise.all([
        supabase
          .from("products")
          .select("sku, name, species_group, active, parent_product_id")
          .eq("active", true),
        supabase.from("yields").select("species_group"),
      ]);
      if (pErr) throw pErr;
      if (yErr) throw yErr;

      const covered = new Set((yields ?? []).map((y) => speciesKey(y.species_group)));
      const map = new Map<string, { sku: string; name: string }[]>();
      const without: { sku: string; name: string }[] = [];

      for (const p of products ?? []) {
        const g = speciesKey((p as any).species_group);
        const entry = { sku: p.sku as string, name: p.name as string };
        if (!g) {
          without.push(entry);
          continue;
        }
        if (!covered.has(g)) {
          const arr = map.get(g) ?? [];
          arr.push(entry);
          map.set(g, arr);
        }
      }

      const rows = [...map.entries()]
        .map(([species_group, prods]) => ({ species_group, products: prods }))
        .sort((a, b) => b.products.length - a.products.length);

      setMissing(rows);
      setNoGroup(without);
      toast({
        title: rows.length === 0 ? "Full täckning" : `${rows.length} artgrupper saknar utbyte`,
        description:
          rows.length === 0
            ? "Alla aktiva produkter med artgrupp har minst en rad i utbytesregistret."
            : `${rows.reduce((s, r) => s + r.products.length, 0)} aktiva produkter påverkas.`,
        variant: rows.length === 0 ? undefined : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Kontrollen misslyckades", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const downloadCsv = () => {
    const lines = ["species_group,sku,namn"];
    for (const r of missing ?? []) for (const p of r.products) lines.push(`${r.species_group},${p.sku},"${p.name}"`);
    for (const p of noGroup) lines.push(`(saknar artgrupp),${p.sku},"${p.name}"`);
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `utbytestackning_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <ShieldCheck className="h-4 w-4" />
          Utbytestäckning
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Kontrollen körs mot verkliga produkter i registret — inte mot förslagslistan — och listar aktiva
          produkter vars artgrupp saknar rad i utbytesregistret.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={run} disabled={running}>
            {running && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            Kontrollera utbytestäckning
          </Button>
          {missing && (missing.length > 0 || noGroup.length > 0) && (
            <Button size="sm" variant="outline" onClick={downloadCsv}>
              Ladda ner CSV
            </Button>
          )}
        </div>

        {missing && missing.length === 0 && noGroup.length === 0 && (
          <div className="flex items-center gap-2 rounded-md border border-emerald-600/40 bg-emerald-600/5 p-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            Alla aktiva produkter har artgrupp med minst ett utbyte.
          </div>
        )}

        {missing && missing.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {missing.length} artgrupper utan utbyte
            </div>
            <div className="max-h-64 space-y-1 overflow-auto">
              {missing.map((r) => (
                <div key={r.species_group} className="rounded-md border p-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.species_group}</span>
                    <Badge variant="destructive" className="text-[10px]">
                      {r.products.length} produkter
                    </Badge>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {r.products.slice(0, 8).map((p) => `${p.sku} ${p.name}`).join(" · ")}
                    {r.products.length > 8 && ` … +${r.products.length - 8}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {missing && noGroup.length > 0 && (
          <div className="rounded-md border border-amber-600/40 bg-amber-600/5 p-2 text-[11px] text-amber-700">
            {noGroup.length} aktiva produkter saknar artgrupp helt och kan därför inte kopplas till ett utbyte.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
