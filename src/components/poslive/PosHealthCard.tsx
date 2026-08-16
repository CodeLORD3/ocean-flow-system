import { AlertTriangle, CheckCircle2, RefreshCw, Radio, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useNimposHealth,
  useNimposReconcile,
  useNimposReplay,
} from "@/hooks/useNimposHealth";

const kr = (ore: number) =>
  Math.round((ore || 0) / 100)
    .toLocaleString("sv-SE")
    .replace(/\u00a0/g, " ");

const fmtTime = (v: string | null) =>
  v ? new Date(v).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }) : "—";

const REJECT_LABEL: Record<string, string> = {
  stale_timestamp: "Gammal tidsstämpel",
  bad_signature: "Fel signatur",
  unmapped_store: "Okänd kassa",
  failed: "Bearbetningsfel",
};

/**
 * Kortet Kassa på Systemstatus: tyst kassa mitt på dagen betyder att
 * integrationen står still, därför larmar vi på 60 minuter utan kvitto.
 */
export function PosHealthCard() {
  const { data, isLoading, refetch, isFetching } = useNimposHealth();
  const replay = useNimposReplay();
  const reconcile = useNimposReconcile();

  const stores = data?.stores ?? [];
  const rejects = data?.rejects ?? [];
  const silent = stores.filter((s) => (s.silent_minutes ?? 0) > 60);
  const issues =
    silent.length +
    rejects.reduce((a, r) => a + r.count, 0) +
    (data?.unmatched_lines ?? 0) +
    (data?.unit_mismatches ?? 0) +
    (data?.parked ?? 0);

  const runReplay = async () => {
    try {
      const res = await replay.mutateAsync({ statuses: ["koad", "failed", "unmapped_store"] });
      toast.success(`${res.replayed} kassahändelser spelades upp igen`);
    } catch (e: any) {
      toast.error(e.message ?? "Kunde inte spela upp händelser");
    }
  };

  const runReconcile = async () => {
    try {
      await reconcile.mutateAsync(undefined);
      toast.success("Avstämning mot Nimpos klar");
    } catch (e: any) {
      toast.error(e.message ?? "Avstämningen misslyckades");
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-heading flex items-center gap-1.5">
          <Radio className="h-4 w-4 text-primary" /> Kassa (Nimpos)
          {issues === 0 ? (
            <Badge variant="outline" className="text-[10px] text-success border-success/40">
              OK
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-warning border-warning/40">
              {issues} att titta på
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={runReplay}
            disabled={replay.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Spela upp kön
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={runReconcile}
            disabled={reconcile.isPending}
          >
            Stäm av natt
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Hämtar kassastatus…</p>
        ) : stores.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Inga kvitton idag ännu — kassorna skickar när första köpet slås in.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {stores.map((s) => {
              const isSilent = (s.silent_minutes ?? 0) > 60;
              return (
                <div key={s.store_id} className="flex flex-wrap items-center gap-2 py-1.5 text-xs">
                  <span className="flex-1 min-w-[9rem] truncate text-foreground">{s.name}</span>
                  {s.store_code && (
                    <span className="font-mono text-[11px] text-muted-foreground">{s.store_code}</span>
                  )}
                  <span className="font-mono tabular-nums w-16 text-right text-muted-foreground">
                    {s.receipts} kv
                  </span>
                  <span className="font-mono tabular-nums w-24 text-right text-foreground">
                    {kr(s.total_ore)} kr
                  </span>
                  <span className="font-mono tabular-nums w-12 text-right text-muted-foreground">
                    {fmtTime(s.last_receipt_at)}
                  </span>
                  {isSilent ? (
                    <Badge variant="outline" className="text-[10px] text-destructive border-destructive/40">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      tyst {s.silent_minutes} min
                    </Badge>
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Metric label="Omatchade rader" value={data?.unmatched_lines ?? 0} warn />
          <Metric label="Enhetsavvikelser" value={data?.unit_mismatches ?? 0} warn />
          <Metric label="Returer idag" value={data?.returns ?? 0} />
          <Metric label="Parkerade/köade" value={(data?.parked ?? 0) + (data?.queued ?? 0)} warn />
        </div>

        {rejects.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Avvisade anrop</p>
            <div className="flex flex-wrap gap-1.5">
              {rejects.map((r, i) => (
                <Badge
                  key={`${r.reason}-${r.store_code}-${i}`}
                  variant="outline"
                  className="text-[10px] text-warning border-warning/40"
                >
                  {REJECT_LABEL[r.reason] ?? r.reason}
                  {r.store_code ? ` · ${r.store_code}` : ""} · {r.count}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Nattavstämning
          </p>
          {(data?.reconciliations ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">Ingen avstämning körd ännu.</p>
          ) : (
            <div className="divide-y divide-border">
              {data!.reconciliations.map((r, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 py-1 text-xs">
                  <span className="font-mono text-muted-foreground w-24">{r.business_date}</span>
                  <span className="font-mono text-muted-foreground w-28 truncate">
                    {r.store_code ?? "—"}
                  </span>
                  <span className="text-foreground">
                    {r.local_count} lokalt / {r.external_count ?? "—"} hos Nimpos
                  </span>
                  {r.missing > 0 && (
                    <Badge variant="outline" className="text-[10px] text-warning border-warning/40">
                      {r.missing} saknade
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      r.status === "ok"
                        ? "text-success border-success/40"
                        : "text-destructive border-destructive/40"
                    }`}
                  >
                    {r.status}
                  </Badge>
                  {r.message && (
                    <span className="flex-1 min-w-[8rem] truncate text-muted-foreground">
                      {r.message}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  const bad = warn && value > 0;
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p
        className={`font-mono tabular-nums text-lg ${bad ? "text-warning" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

export default PosHealthCard;
