import { AlertTriangle, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PAYMENT_LABEL, type PosDaySummary } from "@/hooks/usePosLive";

const kr = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\u00a0/g, " ");

function minutesSince(iso: string | null) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

/** Ett butikskort i livevyn: omsättning, köp, snittköp och betalsätt. */
export function PosStoreCard({
  name,
  summary,
  isToday,
  selected,
  onSelect,
  currency = "SEK",
  sekRate = null,
}: {
  name: string;
  summary: PosDaySummary;
  isToday: boolean;
  /** Butikens valuta — Zollikon redovisas i CHF och blandas aldrig med SEK. */
  currency?: string;
  /** Livekurs butikens valuta → SEK. CHF visas först, SEK som växling under. */
  sekRate?: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  const unit = currency.toUpperCase() === "SEK" ? "kr" : currency.toUpperCase();
  const idle = minutesSince(summary.last_receipt_at);
  // Informationslarm, inget kapacitetstak: kassan har varit tyst länge under öppettid.
  const silent = isToday && summary.receipt_count > 0 && idle != null && idle >= 45;
  const noData = summary.receipt_count === 0;

  return (
    <Card
      onClick={onSelect}
      className={cn(
        "shadow-card cursor-pointer transition-colors",
        selected ? "border-primary" : "hover:border-primary/40",
      )}
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-foreground font-medium leading-tight">{name}</p>
          {isToday && !noData && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px]",
                silent ? "text-warning" : "text-success",
              )}
            >
              <Radio className="h-3 w-3" />
              {idle != null ? `${idle} min` : "live"}
            </span>
          )}
        </div>

        <div>
          <p className="font-mono tabular-nums text-xl text-foreground">
            {kr(summary.gross_sales)} <span className="text-xs text-muted-foreground">{unit}</span>
          </p>
          {sekRate ? (
            <p className="font-mono tabular-nums text-[11px] text-muted-foreground">
              ≈ {kr(summary.gross_sales * sekRate)} kr
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
          <div>
            <p>Köp</p>
            <p className="font-mono tabular-nums text-foreground">{summary.receipt_count}</p>
          </div>
          <div>
            <p>Snittköp</p>
            <p className="font-mono tabular-nums text-foreground">{kr(summary.avg_receipt)}</p>
          </div>
          <div>
            <p>Största</p>
            <p className="font-mono tabular-nums text-foreground">{kr(summary.largest_sale)}</p>
          </div>
        </div>

        {summary.payments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {summary.payments.map((p) => (
              <Badge key={p.method} variant="secondary" className="text-[10px] font-normal">
                {PAYMENT_LABEL[p.method] ?? p.method} {kr(p.amount)}
              </Badge>
            ))}
          </div>
        )}

        {noData && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Ingen kassadata
          </p>
        )}
        {silent && (
          <p className="text-[11px] text-warning flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Inget kvitto på {idle} min
          </p>
        )}
      </CardContent>
    </Card>
  );
}
