import { useMemo, useState } from "react";
import { RefreshCw, Send, Tags } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePosPrices, usePosPush, usePosQueueHealth } from "@/hooks/usePosPrices";

const kr = (n: number) =>
  n.toLocaleString("sv-SE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ");

function useEntities() {
  return useQuery({
    queryKey: ["legal-entities-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("legal_entities")
        .select("legal_entity_id, legal_name")
        .eq("active", true)
        .order("legal_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Central prisvy per bolag med pushkö mot kassan. Prislistor markerade
 * "gäller i kassan" hamnar automatiskt i kön när priser ändras.
 */
export function PosPricePanel() {
  const [entityId, setEntityId] = useState<string | null>(null);
  const [onlyPos, setOnlyPos] = useState(true);
  const [search, setSearch] = useState("");

  const { data: entities = [] } = useEntities();
  const { data: rows = [], isLoading } = usePosPrices(entityId, onlyPos);
  const { data: queue } = usePosQueueHealth();
  const push = usePosPush();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.product_name.toLowerCase().includes(q) ||
        (r.sku ?? "").toLowerCase().includes(q) ||
        (r.store_name ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <div className="space-y-4">
      <Card className="shadow-card">
        <CardHeader className="pb-2 flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Pushkö till kassan
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={push.isPending}
              onClick={() => push.mutate({ retryFailed: true })}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${push.isPending ? "animate-spin" : ""}`} />
              Skicka nu
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              disabled={push.isPending}
              onClick={() => push.mutate({ dryRun: true })}
            >
              Testkör
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Väntande" value={String(queue?.pending ?? 0)} />
          <Stat label="Misslyckade" value={String(queue?.failed ?? 0)} warn={(queue?.failed ?? 0) > 0} />
          <Stat label="Skickade idag" value={String(queue?.sent_today ?? 0)} />
          <Stat
            label="Äldsta väntande"
            value={
              queue?.oldest_pending
                ? new Date(queue.oldest_pending).toLocaleString("sv-SE", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"
            }
          />
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-heading flex items-center gap-2">
            <Tags className="h-4 w-4 text-primary" /> Priser per bolag
            <Badge variant="outline" className="text-[10px]">{filtered.length} rader</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={entityId === null ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => setEntityId(null)}
            >
              Alla bolag
            </Button>
            {entities.map((e: any) => (
              <Button
                key={e.legal_entity_id}
                size="sm"
                variant={entityId === e.legal_entity_id ? "default" : "outline"}
                className="h-7 text-xs"
                onClick={() => setEntityId(e.legal_entity_id)}
              >
                {e.legal_name}
              </Button>
            ))}
            <Button
              size="sm"
              variant={onlyPos ? "default" : "ghost"}
              className="h-7 text-xs ml-auto"
              onClick={() => setOnlyPos(!onlyPos)}
            >
              {onlyPos ? "Endast kassapriser" : "Alla prislistor"}
            </Button>
          </div>

          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Sök produkt, SKU eller butik…"
            className="h-8 text-xs max-w-sm"
          />

          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Inga prisrader — markera en prislista som "gäller i kassan" för att fylla kön.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left py-1.5 font-normal">Produkt</th>
                    <th className="text-left py-1.5 font-normal">SKU</th>
                    <th className="text-left py-1.5 font-normal">Bolag</th>
                    <th className="text-left py-1.5 font-normal">Butik</th>
                    <th className="text-right py-1.5 font-normal">Pris</th>
                    <th className="text-right py-1.5 font-normal">Moms</th>
                    <th className="text-left py-1.5 font-normal pl-2">Från</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.slice(0, 500).map((r) => (
                    <tr key={r.item_id} className={r.item_pos_enabled ? "" : "opacity-50"}>
                      <td className="py-1.5 text-foreground">{r.product_name}</td>
                      <td className="py-1.5 font-mono text-muted-foreground">{r.sku ?? "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{r.legal_name ?? "—"}</td>
                      <td className="py-1.5 text-muted-foreground">{r.store_name ?? "—"}</td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-foreground">
                        {kr(Number(r.price))} {r.unit ? `/${r.unit}` : ""}
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                        {Number(r.vat_rate)}%
                      </td>
                      <td className="py-1.5 pl-2 font-mono tabular-nums text-muted-foreground">
                        {r.valid_from}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 500 && (
                <p className="text-[10px] text-muted-foreground pt-2">
                  Visar 500 av {filtered.length} rader — sök för att smalna av.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`font-mono tabular-nums text-lg ${warn ? "text-destructive" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}
