import { useRef, useState } from "react";
import { Download, FileUp, Loader2, Tags } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  buildSumupCatalogCsv,
  diffCatalog,
  downloadCsv,
  parseSumupCatalogFile,
  type CatalogDiff,
} from "@/lib/sumupCatalog";
import {
  useChCatalog,
  useSaveCatalogAudit,
  useSumupCatalogAudits,
} from "@/hooks/useSumupCatalog";
import { useSumupHealth } from "@/hooks/useSumupHealth";

const money = (n: number | null | undefined, cur: string) =>
  n == null
    ? "—"
    : `${n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;

const KIND_LABEL: Record<string, string> = {
  ok: "Stämmer",
  pris: "Prisavvikelse",
  saknas_i_kassan: "Saknas i kassan",
  saknas_i_erp: "Saknas i Makrilltrade",
};

/**
 * Katalog och CHF-priser för Zollikon. SumUp har inget katalog-API, så
 * sortimentet exporteras i SumUps CSV-format och SumUps egen katalogexport
 * laddas upp tillbaka för avstämning av namn, pris och moms.
 */
export function SumupCatalogPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [diff, setDiff] = useState<(CatalogDiff & { filename: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: catalog, isLoading } = useChCatalog();
  const { data: health } = useSumupHealth();
  const { data: audits = [] } = useSumupCatalogAudits();
  const saveAudit = useSaveCatalogAudit();

  const rows = catalog?.rows ?? [];
  const currency = catalog?.currency ?? "CHF";
  const merchant = (health?.merchants ?? [])[0] as any;

  const onExport = () => {
    if (rows.length === 0) {
      toast({
        title: "Inget sortiment att exportera",
        description: "Markera en CHF-prislista för Componia AG som \"gäller i kassan\".",
        variant: "destructive",
      });
      return;
    }
    downloadCsv(
      `sumup-katalog-zollikon-${new Date().toISOString().slice(0, 10)}.csv`,
      buildSumupCatalogCsv(rows, currency),
    );
  };

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const pos = await parseSumupCatalogFile(file);
      if (pos.length === 0) {
        toast({
          title: "Hittade inga artiklar",
          description: "Filen ska vara SumUps katalogexport (CSV eller XLSX).",
          variant: "destructive",
        });
        return;
      }
      const d = diffCatalog(rows, pos);
      setDiff({ ...d, filename: file.name });
      if (merchant?.merchant_code) {
        await saveAudit.mutateAsync({
          merchantCode: merchant.merchant_code,
          storeId: merchant.store_id ?? null,
          currency,
          filename: file.name,
          diff: d,
        });
      }
      toast({
        title: "Katalogen avstämd",
        description: `${d.matched} stämmer · ${d.priceDiff} prisavvikelser · ${d.missingInPos + d.missingInErp} saknas`,
      });
    } catch (e: any) {
      toast({ title: "Kunde inte läsa filen", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const problems = (diff?.rows ?? []).filter((r) => r.kind !== "ok");

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          <Tags className="h-4 w-4 text-primary" /> Katalog Zollikon ({currency})
          <Badge variant="outline" className="text-[10px]">
            {rows.length} artiklar
          </Badge>
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onExport}>
            <Download className="mr-1 h-3.5 w-3.5" /> Exportera CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            {busy ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileUp className="mr-1 h-3.5 w-3.5" />
            )}
            Stäm av kassans export
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        <p className="text-muted-foreground">
          Moms sätts per kategori: 2,6 % livsmedel och 8,1 % emballage och servering. Artikelnamnet
          är matchnyckeln mot kassan — namnen måste vara identiska.
          {catalog?.listName ? ` Prislista: ${catalog.listName}.` : ""}
        </p>

        {isLoading ? (
          <p className="text-muted-foreground">Hämtar sortiment…</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground">
            Ingen CHF-prislista markerad som "gäller i kassan" för Componia AG.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1.5 text-left font-normal">Artikel</th>
                  <th className="py-1.5 text-left font-normal">Kategori</th>
                  <th className="py-1.5 text-right font-normal">Pris</th>
                  <th className="py-1.5 text-right font-normal">Moms</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.slice(0, 200).map((r, i) => (
                  <tr key={`${r.product_id ?? r.name}-${i}`}>
                    <td className="py-1.5 text-foreground">{r.name}</td>
                    <td className="py-1.5 text-muted-foreground">{r.category ?? "—"}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-foreground">
                      {money(r.price, currency)}
                      {r.unit ? <span className="text-muted-foreground">/{r.unit}</span> : null}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                      {r.vat_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 200 && (
              <p className="pt-2 text-[10px] text-muted-foreground">
                Visar 200 av {rows.length} artiklar — hela sortimentet följer med i exporten.
              </p>
            )}
          </div>
        )}

        {diff && (
          <div className="space-y-1 border-t border-border/60 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Avstämning {diff.filename}</span>
              <Badge variant="outline" className="text-[10px]">
                {diff.matched} stämmer
              </Badge>
              {diff.priceDiff > 0 && (
                <Badge variant="destructive" className="text-[10px]">
                  {diff.priceDiff} prisavvikelser
                </Badge>
              )}
              {diff.missingInPos > 0 && (
                <Badge
                  variant="outline"
                  className="border-warning/40 text-[10px] text-warning"
                >
                  {diff.missingInPos} saknas i kassan
                </Badge>
              )}
              {diff.missingInErp > 0 && (
                <Badge
                  variant="outline"
                  className="border-warning/40 text-[10px] text-warning"
                >
                  {diff.missingInErp} saknas i Makrilltrade
                </Badge>
              )}
            </div>
            {problems.length === 0 ? (
              <p className="text-muted-foreground">Katalogerna är identiska.</p>
            ) : (
              <div className="divide-y divide-border/60">
                {problems.slice(0, 100).map((r, i) => (
                  <div key={`${r.name}-${i}`} className="flex items-center justify-between gap-2 py-1">
                    <span className="min-w-0 truncate text-foreground">{r.name}</span>
                    <span className="shrink-0 font-mono tabular-nums text-muted-foreground">
                      {money(r.erp_price, currency)} → {money(r.pos_price, currency)}
                    </span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      {KIND_LABEL[r.kind]}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {audits.length > 0 && (
          <div className="space-y-0.5 border-t border-border/60 pt-2">
            <div className="font-medium">Tidigare avstämningar</div>
            {audits.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 tabular-nums text-muted-foreground"
              >
                <span className="font-mono">
                  {new Date(a.created_at).toLocaleString("sv-SE")}
                </span>
                <span className="min-w-0 truncate">{a.source_filename ?? "—"}</span>
                <span>
                  {a.matched_count} ok · {a.price_diff_count} pris ·{" "}
                  {a.missing_in_pos_count + a.missing_in_erp_count} saknas
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
