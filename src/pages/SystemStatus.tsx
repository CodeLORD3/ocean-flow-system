import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Wrench } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import ShopifyWebhookStatus from "@/components/shopify/ShopifyWebhookStatus";
import BookingStatusCard from "@/components/booking/BookingStatusCard";
import ImageCompressionCard from "@/components/admin/ImageCompressionCard";
import { PosHealthCard } from "@/components/poslive/PosHealthCard";
import { PosLineReview } from "@/components/poslive/PosLineReview";

interface ReconRun {
  id: string;
  ran_at: string;
  diff_count: number;
  checked_rows: number;
  source: string;
  details: any;
}

interface NegFlag {
  id: string;
  created_at: string;
  resulting_qty: number;
  movement_qty: number | null;
  movement_type: string | null;
  driver_note: string | null;
  acknowledged_at: string | null;
  ack_note: string | null;
  products?: { name: string; sku: string } | null;
  storage_locations?: { name: string; stores?: { name: string } | null } | null;
  lots?: { lot_number: string } | null;
}

const fmtTime = (v: string) =>
  new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

const fmtQty = (n: number) =>
  Number(n || 0).toLocaleString("sv-SE", { minimumFractionDigits: 3, maximumFractionDigits: 3 });


export default function SystemStatus() {
  const qc = useQueryClient();
  const [ackNotes, setAckNotes] = useState<Record<string, string>>({});

  const flags = useQuery({
    queryKey: ["stock_negative_flags"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_negative_flags" as any)
        .select(
          "id, created_at, resulting_qty, movement_qty, movement_type, driver_note, acknowledged_at, ack_note, products(name, sku), storage_locations(name, stores(name)), lots:suggested_lot_id(lot_number)"
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as unknown as NegFlag[];
    },
  });

  const ack = useMutation({
    mutationFn: async (id: string) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("stock_negative_flags" as any)
        .update({
          acknowledged_at: new Date().toISOString(),
          acknowledged_by: u.user?.id ?? null,
          ack_note: ackNotes[id]?.trim() || null,
        } as any)
        .eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast({ title: "Avvikelsen kvitterad" });
      qc.invalidateQueries({ queryKey: ["stock_negative_flags"] });
    },
    onError: (e: any) =>
      toast({ title: "Kunde inte kvittera", description: e.message, variant: "destructive" }),
  });


  const runs = useQuery({
    queryKey: ["stock_reconciliation_runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_reconciliation_runs" as any)
        .select("*")
        .order("ran_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as ReconRun[];
    },
  });

  const check = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("stock_reconciliation_check" as any, {
        _source: "manuell",
      } as any);
      if (error) throw new Error(error.message);
      return data as any;
    },
    onSuccess: (data: any) => {
      const diff = Number(data?.diff_count ?? 0);
      toast({
        title: diff === 0 ? "Avstämning klar — inga avvikelser" : `Avstämning klar — ${diff} avvikelser`,
      });
      qc.invalidateQueries({ queryKey: ["stock_reconciliation_runs"] });
    },
    onError: (e: any) => toast({ title: "Avstämningen misslyckades", description: e.message, variant: "destructive" }),
  });

  const rebuild = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("rebuild_stock_from_movements" as any);
      if (error) throw new Error(error.message);
      const after = await supabase.rpc("stock_reconciliation_check" as any, { _source: "omräkning" } as any);
      if (after.error) throw new Error(after.error.message);
      return data as any;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Saldon omräknade från rörelseloggen",
        description: `${Number(data?.rebuilt_rows ?? 0)} rader omräknade, ${Number(data?.zeroed_rows ?? 0)} nollställda.`,
      });
      qc.invalidateQueries({ queryKey: ["stock_reconciliation_runs"] });
      qc.invalidateQueries({ queryKey: ["product_stock_locations"] });
      qc.invalidateQueries({ queryKey: ["all_stock_locations"] });
    },
    onError: (e: any) => toast({ title: "Omräkningen misslyckades", description: e.message, variant: "destructive" }),
  });

  const latest = runs.data?.[0];
  const hasDiff = (latest?.diff_count ?? 0) > 0;
  const details: any[] = Array.isArray(latest?.details) ? latest!.details : [];
  const openFlags = (flags.data ?? []).filter((f) => !f.acknowledged_at);
  const ackedFlags = (flags.data ?? []).filter((f) => f.acknowledged_at);


  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold">Systemstatus</h1>
          <p className="text-xs text-muted-foreground">
            Rörelseloggen är enda sanning. Saldotabellen stäms av mot loggen varje natt kl. 03:15.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => check.mutate()} disabled={check.isPending}>
            {check.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Stäm av nu
          </Button>
          <Button size="sm" onClick={() => rebuild.mutate()} disabled={rebuild.isPending}>
            {rebuild.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
            Räkna om saldon
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <PosHealthCard />

        <PosLineReview />

        <BookingStatusCard />

        <ImageCompressionCard />
        <ShopifyWebhookStatus />
        <Card className={hasDiff ? "border-destructive" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {hasDiff ? (
                <AlertTriangle className="h-4 w-4 text-destructive" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              Lagersaldo mot rörelselogg
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {runs.isLoading ? (
              <p className="text-muted-foreground">Läser avstämningar…</p>
            ) : !latest ? (
              <p className="text-muted-foreground">Ingen avstämning har körts ännu.</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant={hasDiff ? "destructive" : "secondary"}>
                    {hasDiff ? `${latest.diff_count} avvikelser` : "Inga avvikelser"}
                  </Badge>
                  <span className="text-muted-foreground">
                    {latest.checked_rows} kontrollerade kombinationer · senast {fmtTime(latest.ran_at)} ({latest.source})
                  </span>
                </div>

                {hasDiff && (
                  <div className="overflow-auto rounded-md border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-2 py-1">Produkt</th>
                          <th className="px-2 py-1">Lagerplats</th>
                          <th className="px-2 py-1 text-right tabular-nums">Logg</th>
                          <th className="px-2 py-1 text-right tabular-nums">Saldo</th>
                          <th className="px-2 py-1 text-right tabular-nums">Diff</th>
                        </tr>
                      </thead>
                      <tbody>
                        {details.slice(0, 100).map((d, i) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-1 font-mono">{d.product_id}</td>
                            <td className="px-2 py-1 font-mono">{d.location_id}</td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtQty(d.ledger_qty)}</td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums">{fmtQty(d.balance_qty)}</td>
                            <td className="px-2 py-1 text-right font-mono tabular-nums text-destructive">
                              {fmtQty(d.diff)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card className={openFlags.length ? "border-amber-500/60" : undefined}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {openFlags.length ? (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              )}
              Inventeringsavvikelser att kvittera
              {openFlags.length > 0 && <Badge variant="destructive">{openFlags.length}</Badge>}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Försäljning blockeras aldrig av saldo — disken går alltid först. När ett uttag drar ett saldo
              under noll loggas det här som inventeringsavvikelse att kvittera.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0 text-sm">
            {flags.isLoading ? (
              <p className="text-muted-foreground">Läser avvikelser…</p>
            ) : !openFlags.length ? (
              <p className="text-muted-foreground">Inga öppna avvikelser.</p>
            ) : (
              openFlags.map((f) => (
                <div key={f.id} className="rounded-md border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-medium">{f.products?.name ?? "Okänd produkt"}</span>{" "}
                      <span className="font-mono text-xs text-muted-foreground">{f.products?.sku}</span>
                    </div>
                    <span className="font-mono tabular-nums text-destructive">{fmtQty(f.resulting_qty)} kg</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.storage_locations?.stores?.name ? `${f.storage_locations.stores.name} · ` : ""}
                    {f.storage_locations?.name} · {fmtTime(f.created_at)} · {f.movement_type ?? "uttag"}
                  </p>
                  <p className="mt-1 text-xs">
                    Drevs av: <span className="text-muted-foreground">{f.driver_note ?? "okänt uttag"}</span>
                    {f.movement_qty != null && (
                      <span className="font-mono tabular-nums"> ({fmtQty(f.movement_qty)} kg)</span>
                    )}
                  </p>
                  <p className="text-xs">
                    Borde ha burits av parti:{" "}
                    <span className="font-mono">{f.lots?.lot_number ?? "inget aktivt parti hittat"}</span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Input
                      className="h-8 max-w-sm text-xs"
                      placeholder="Kommentar (våg, spill, delad förpackning…)"
                      value={ackNotes[f.id] ?? ""}
                      onChange={(e) => setAckNotes((p) => ({ ...p, [f.id]: e.target.value }))}
                    />
                    <Button size="sm" onClick={() => ack.mutate(f.id)} disabled={ack.isPending}>
                      Kvittera
                    </Button>
                  </div>
                </div>
              ))
            )}
            {ackedFlags.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className="cursor-pointer">Kvitterade avvikelser ({ackedFlags.length})</summary>
                <ul className="mt-2 space-y-1">
                  {ackedFlags.map((f) => (
                    <li key={f.id}>
                      {fmtTime(f.acknowledged_at!)} · {f.products?.name} · {fmtQty(f.resulting_qty)} kg
                      {f.ack_note ? ` — ${f.ack_note}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </CardContent>
        </Card>



        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Avstämningshistorik</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {!runs.data?.length ? (
              <p className="p-4 text-sm text-muted-foreground">Historiken är tom.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs">
                  <tr className="text-left">
                    <th className="px-3 py-2">Tidpunkt</th>
                    <th className="px-3 py-2">Källa</th>
                    <th className="px-3 py-2 text-right">Kontrollerade</th>
                    <th className="px-3 py-2 text-right">Avvikelser</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.data.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 font-mono text-xs tabular-nums">{fmtTime(r.ran_at)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.source}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{r.checked_rows}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge variant={r.diff_count > 0 ? "destructive" : "secondary"}>{r.diff_count}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
