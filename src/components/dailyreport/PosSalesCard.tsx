import { AlertTriangle, Download, Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_LABEL, type PosDaySummary } from "@/hooks/usePosLive";

const kr = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\u00a0/g, " ");

/**
 * Livekassan som grund för stängningsrapporten. Fälten fylls i automatiskt
 * men kan alltid skrivas över manuellt i formuläret nedan.
 */
export function PosSalesCard({
  summary,
  onApply,
  diff,
}: {
  summary: PosDaySummary;
  onApply: () => void;
  diff: { field: string; report: number | null; pos: number }[];
}) {
  const hasData = summary.receipt_count > 0;

  return (
    <Card className="shadow-card border-primary/30">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-heading flex items-center gap-1.5">
          <Radio className="h-4 w-4 text-primary" />
          Kassan live
        </CardTitle>
        {hasData && (
          <Button size="sm" variant="outline" className="h-8" onClick={onApply}>
            <Download className="h-3.5 w-3.5 mr-1" /> Fyll i från kassan
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!hasData ? (
          <p className="text-sm text-muted-foreground">
            Ingen kassadata för dagen ännu — fyll i siffrorna manuellt nedan.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground">Brutto</p>
                <p className="font-mono tabular-nums text-base text-foreground">{kr(summary.gross_sales)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Netto ex moms</p>
                <p className="font-mono tabular-nums text-base text-foreground">{kr(summary.net_sales)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Antal köp</p>
                <p className="font-mono tabular-nums text-base text-foreground">{summary.receipt_count}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Största köp</p>
                <p className="font-mono tabular-nums text-base text-foreground">{kr(summary.largest_sale)}</p>
              </div>
            </div>

            {summary.payments.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {summary.payments.map((p) => (
                  <Badge key={p.method} variant="secondary" className="text-[10px] font-normal">
                    {PAYMENT_LABEL[p.method] ?? p.method} {kr(p.amount)} kr
                  </Badge>
                ))}
              </div>
            )}

            {summary.vat_breakdown.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {summary.vat_breakdown.map((v) => (
                  <Badge key={v.rate} variant="outline" className="text-[10px] font-normal">
                    Moms {v.rate}%: {kr(v.vat)} kr
                  </Badge>
                ))}
              </div>
            )}

            {diff.length > 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-2 space-y-1">
                <p className="text-[11px] text-warning flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> Rapporten avviker från kassan
                </p>
                {diff.map((d) => (
                  <p key={d.field} className="text-[11px] text-muted-foreground font-mono tabular-nums">
                    {d.field}: rapport {d.report != null ? kr(d.report) : "—"} · kassa {kr(d.pos)}
                  </p>
                ))}
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Källa: {summary.sources.join(", ") || "kassa"}
              {summary.last_receipt_at
                ? ` · senaste kvitto ${new Date(summary.last_receipt_at).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
