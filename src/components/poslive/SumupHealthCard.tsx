import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, FlaskConical } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  isOpenNow,
  useSumupHealth,
  useSumupPoll,
  useSumupProbe,
  useSumupProcess,
  useSumupReconcile,
  useSumupReconciliations,
} from "@/hooks/useSumupHealth";

const fmtTime = (v: string | null) =>
  v
    ? new Date(v).toLocaleString("sv-SE", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const minutesSince = (v: string | null) =>
  v ? Math.floor((Date.now() - new Date(v).getTime()) / 60000) : null;

/**
 * Kortet Kassa (SumUp) — Zollikon. Två larm enligt specen:
 * pollning misslyckad tre gånger i rad, och tyst kassa över 60 minuter
 * under butikens öppettid.
 */
export function SumupHealthCard() {
  const { data, isLoading, refetch, isFetching } = useSumupHealth();
  const poll = useSumupPoll();
  const probe = useSumupProbe();
  const process = useSumupProcess();
  const reconcile = useSumupReconcile();
  const { data: recons } = useSumupReconciliations();
  const [txId, setTxId] = useState("");
  const [raw, setRaw] = useState<string | null>(null);

  const merchants = data?.merchants ?? [];
  const runs = data?.runs ?? [];
  const hours = data?.hours ?? [];

  const alarms = useMemo(() => {
    const list: { code: string; text: string }[] = [];
    for (const m of merchants) {
      if (!m.active) continue;
      if ((m.fail_streak ?? 0) >= 3) {
        list.push({
          code: `fail-${m.merchant_code}`,
          text: `Pollningen har misslyckats ${m.fail_streak} gånger i rad (${m.merchant_code})${
            m.last_error ? ` — ${m.last_error}` : ""
          }`,
        });
      }
      const silent = minutesSince(m.last_transaction_at);
      const open = isOpenNow(hours.filter((h) => h.store_id === m.store_id));
      if (open && (silent === null || silent > 60)) {
        list.push({
          code: `silent-${m.merchant_code}`,
          text: `Tyst kassa under öppettid — ${
            silent === null ? "inget kvitto hämtat ännu" : `${silent} min sedan senaste kvitto`
          }`,
        });
      }
    }
    if ((data?.queue.fel ?? 0) > 0) {
      list.push({
        code: "queue-fel",
        text: `${data?.queue.fel} kvitton kunde inte bearbetas — se felkön nedan`,
      });
    }
    const latest = recons?.[0];
    if (latest && latest.status !== "ok") {
      list.push({
        code: `recon-${latest.recon_date}`,
        text: `Avstämningen ${latest.recon_date} visar avvikelse — ${latest.message ?? ""}`,
      });
    }
    return list;
  }, [merchants, hours, data?.queue.fel, recons]);

  const runPoll = async (code?: string) => {
    try {
      const res = await poll.mutateAsync(code);
      const queued = (res?.results ?? []).reduce((a, r) => a + (r.queued_count ?? 0), 0);
      toast.success(`Hämtning klar — ${queued} nya kvitton i kön`);
    } catch (e: any) {
      toast.error(e.message ?? "Hämtningen misslyckades");
    }
  };

  const runProcess = async () => {
    try {
      const res = await process.mutateAsync(undefined);
      toast.success(
        `Bearbetning klar — ${res.bearbetade} kvitton, ${res.rorelser} lagerrörelser${
          res.omatchade ? `, ${res.omatchade} omatchade rader` : ""
        }`,
      );
    } catch (e: any) {
      toast.error(e.message ?? "Bearbetningen misslyckades");
    }
  };

  const runReconcile = async () => {
    try {
      const res = await reconcile.mutateAsync({});
      const bad = (res?.results ?? []).filter((r) => r.status !== "ok").length;
      toast[bad ? "warning" : "success"](
        bad ? `Avstämning klar med ${bad} avvikelse(r)` : `Avstämning klar för ${res.date}`,
      );
    } catch (e: any) {
      toast.error(e.message ?? "Avstämningen misslyckades");
    }
  };

  const runProbe = async () => {
    const code = merchants[0]?.merchant_code;
    if (!code || !txId.trim()) return;
    try {
      const res = await probe.mutateAsync({ merchantCode: code, transactionId: txId.trim() });
      setRaw(JSON.stringify(res, null, 2));
      toast.success("Rått svar hämtat — inget bokfört");
    } catch (e: any) {
      toast.error(e.message ?? "Kunde inte hämta transaktionen");
    }
  };

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-heading flex items-center gap-2">
          Kassa SumUp (Zollikon)
          {isLoading ? null : alarms.length ? (
            <Badge variant="destructive" className="h-5">
              {alarms.length} larm
            </Badge>
          ) : (
            <Badge variant="outline" className="h-5 gap-1">
              <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Utan anmärkning
            </Badge>
          )}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={() => runPoll()}
            disabled={poll.isPending}
          >
            Hämta nu
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={runProcess}
            disabled={process.isPending}
          >
            Bearbeta kön
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            onClick={runReconcile}
            disabled={reconcile.isPending}
          >
            Avstäm i natt
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {alarms.map((a) => (
          <div
            key={a.code}
            className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5"
          >
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
            <span>{a.text}</span>
          </div>
        ))}

        {merchants.length === 0 && !isLoading && (
          <p className="text-muted-foreground">Ingen SumUp-kassa är kopplad ännu.</p>
        )}

        {merchants.map((m) => (
          <div key={m.merchant_code} className="rounded-md border border-border/60 p-2 space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {m.label ?? m.merchant_code}{" "}
                <span className="text-muted-foreground font-mono">{m.merchant_code}</span>
              </span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="h-5">
                  {m.currency}
                </Badge>
                {m.test_mode && (
                  <Badge variant="secondary" className="h-5">
                    Testläge
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5 text-muted-foreground tabular-nums">
              <span>Senaste hämtning: {fmtTime(m.last_polled_at)}</span>
              <span>Senast lyckad: {fmtTime(m.last_success_at)}</span>
              <span>Senaste kvitto: {fmtTime(m.last_transaction_at)}</span>
              <span>Fel i rad: {m.fail_streak ?? 0}</span>
            </div>
          </div>
        ))}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground tabular-nums">
          <span>Köade: {data?.queue.koad ?? 0}</span>
          <span>Bearbetade: {data?.queue.bearbetad ?? 0}</span>
          <span>Fel: {data?.queue.fel ?? 0}</span>
          <span>Omatchade artikelnamn: {data?.unmatched.length ?? 0}</span>
        </div>

        <div className="space-y-1.5 border-t border-border/60 pt-2">
          <div className="flex items-center gap-1.5 font-medium">
            <FlaskConical className="h-3.5 w-3.5" /> Viktvarutest — rått svar
          </div>
          <p className="text-muted-foreground">
            Hämtar transaktionen och kvittot precis som SumUp svarar, utan att bokföra något. Kör
            1,24 kg, 2 st och en retur.
          </p>
          <div className="flex gap-2">
            <Input
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="SumUp transaction id"
              className="h-8 text-xs font-mono"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={runProbe}
              disabled={probe.isPending || !txId.trim() || !merchants.length}
            >
              Hämta
            </Button>
          </div>
          {raw && (
            <pre className="max-h-72 overflow-auto rounded-md bg-muted/50 p-2 font-mono text-[11px] leading-relaxed">
              {raw}
            </pre>
          )}
        </div>

        {runs.length > 0 && (
          <div className="border-t border-border/60 pt-2 space-y-0.5">
            <div className="font-medium">Senaste körningar</div>
            {runs.slice(0, 8).map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-2 tabular-nums text-muted-foreground"
              >
                <span>{fmtTime(r.started_at)}</span>
                <span className="font-mono">{r.merchant_code}</span>
                <span>
                  {r.fetched_count} hämtade / {r.queued_count} nya / {r.duplicate_count} dubbletter
                </span>
                <Badge
                  variant={r.status === "ok" ? "outline" : "destructive"}
                  className="h-5 shrink-0"
                >
                  {r.status === "ok" ? "ok" : r.error_code || r.http_status || "fel"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
