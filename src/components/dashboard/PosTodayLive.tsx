import { Radio } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PosHourChart } from "@/components/poslive/PosHourChart";
import {
  posDateIso,
  usePosDaySummary,
  usePosLiveSummary,
  usePosRealtime,
} from "@/hooks/usePosLive";

const kr = (n: number) => Math.round(n || 0).toLocaleString("sv-SE").replace(/\u00a0/g, " ");

/**
 * Dagens försäljning direkt från kassan på Översikt. Uppdateras i realtid när
 * nya kvitton bokförs, så butiken ser läget utan att öppna en extern portal.
 */
export function PosTodayLive({ storeId }: { storeId: string | null }) {
  const date = posDateIso();
  usePosRealtime(true);
  const { data: storeSummary } = usePosDaySummary(storeId, date);
  const { data: liveAll } = usePosLiveSummary(storeId ? undefined : date);

  const agg = (liveAll?.stores ?? []).reduce(
    (a, s) => ({
      gross: a.gross + (s.summary?.gross_sales ?? 0),
      net: a.net + (s.summary?.net_sales ?? 0),
      receipts: a.receipts + (s.summary?.receipt_count ?? 0),
    }),
    { gross: 0, net: 0, receipts: 0 },
  );

  const receipts = storeId ? storeSummary?.receipt_count ?? 0 : agg.receipts;
  const gross = storeId ? storeSummary?.gross_sales ?? 0 : agg.gross;
  const net = storeId ? storeSummary?.net_sales ?? 0 : agg.net;
  const avg = receipts > 0 ? gross / receipts : 0;
  const hours = liveAll?.hours ?? [];

  return (
    <Card className="shadow-card border-primary/30">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-heading flex items-center gap-1.5">
          <Radio className="h-4 w-4 text-primary" /> Kassan idag
        </CardTitle>
        <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
          live
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {receipts === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga kvitton idag ännu — siffrorna fylls på när kassan säljer.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Kpi label="Omsättning" value={`${kr(gross)} kr`} />
              <Kpi label="Ex moms" value={`${kr(net)} kr`} />
              <Kpi label="Antal köp" value={String(receipts)} />
              <Kpi label="Snittköp" value={`${kr(avg)} kr`} />
            </div>
            {hours.length > 0 && (
              <PosHourChart hours={hours} currentHour={new Date().getHours()} />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="font-mono tabular-nums text-lg text-foreground">{value}</p>
    </div>
  );
}

export default PosTodayLive;
