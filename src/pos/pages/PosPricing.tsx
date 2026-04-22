import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useCashier } from "../store/cashier";
import { useNavigate } from "react-router-dom";
import { scomberClient, type MorningSuggestion } from "../adapters/scomberClient";
import { formatSek } from "../lib/money";
import { TrendingDown, TrendingUp, Minus, Lock } from "lucide-react";

interface Store { id: string; name: string }

export default function PosPricing() {
  const { toast } = useToast();
  const cashier = useCashier((s) => s.cashier);
  const nav = useNavigate();
  const qc = useQueryClient();

  const [edits, setEdits] = useState<Record<string, number>>({});
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  const isManager = cashier?.role === "manager" || cashier?.role === "shift_lead";

  const { data: stores = [] } = useQuery({
    queryKey: ["pos_pricing_stores"],
    queryFn: async (): Promise<Store[]> => {
      const { data, error } = await supabase.from("stores").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as Store[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const storeIds = useMemo(() => stores.map((s) => s.id), [stores]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["morning_suggest", storeIds],
    enabled: storeIds.length > 0 && isManager,
    queryFn: () => scomberClient.morningSuggest({ store_ids: storeIds }),
    staleTime: 60_000,
  });

  // Pivot: rows = articles, cols = stores
  const grid = useMemo(() => {
    const byArticle = new Map<string, { name: string; sku: string | null; cells: Record<string, MorningSuggestion> }>();
    for (const s of data?.suggestions ?? []) {
      if (!byArticle.has(s.article_id)) {
        byArticle.set(s.article_id, { name: s.name, sku: s.sku, cells: {} });
      }
      byArticle.get(s.article_id)!.cells[s.store_id] = s;
    }
    return Array.from(byArticle.entries()).map(([article_id, v]) => ({ article_id, ...v }));
  }, [data]);

  const cellKey = (a: string, s: string) => `${a}::${s}`;

  const apply = useMutation({
    mutationFn: async () => {
      const overrides: Array<{ article_id: string; store_id: string; price_ore: number; channel: string }> = [];
      for (const row of grid) {
        for (const storeId of storeIds) {
          const k = cellKey(row.article_id, storeId);
          const cell = row.cells[storeId];
          if (!cell) continue;
          if (!accepted[k]) continue;
          const price = edits[k] ?? cell.suggested_price_ore;
          overrides.push({
            article_id: row.article_id,
            store_id: storeId,
            price_ore: price,
            channel: "pos",
          });
        }
      }
      if (overrides.length === 0) throw new Error("Inga rader markerade");
      return scomberClient.setOverrides({ overrides, set_by: cashier?.display_name ?? undefined });
    },
    onSuccess: (r) => {
      toast({ title: "Priser uppdaterade", description: `${r.inserted} override(s) sparade` });
      setAccepted({});
      setEdits({});
      qc.invalidateQueries({ queryKey: ["morning_suggest"] });
      qc.invalidateQueries({ queryKey: ["pos_products"] });
    },
    onError: (e: any) => toast({ title: "Fel", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const bulkAccept = (mode: "all" | "increases" | "none") => {
    const next: Record<string, boolean> = {};
    if (mode !== "none") {
      for (const row of grid) {
        for (const storeId of storeIds) {
          const cell = row.cells[storeId];
          if (!cell) continue;
          if (mode === "all" && cell.change_ore !== 0) next[cellKey(row.article_id, storeId)] = true;
          if (mode === "increases" && cell.change_ore > 0) next[cellKey(row.article_id, storeId)] = true;
        }
      }
    }
    setAccepted(next);
  };

  if (!isManager) {
    return (
      <div className="p-6 max-w-md mx-auto mt-12 text-center space-y-3">
        <Lock className="h-8 w-8 mx-auto text-muted-foreground" />
        <h1 className="text-lg font-semibold">Endast skiftledare/manager</h1>
        <p className="text-sm text-muted-foreground">Logga in med en konto-PIN som har rollen <strong>shift_lead</strong> eller <strong>manager</strong>.</p>
        <Button variant="outline" onClick={() => nav("/pos/login")}>Tillbaka till inloggning</Button>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold">Morgonpriser</h1>
          <p className="text-xs text-muted-foreground">
            {data ? `Genererat ${new Date(data.generated_at).toLocaleString("sv-SE")}` : "Hämtar förslag…"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => bulkAccept("all")}>Acceptera alla ändringar</Button>
          <Button size="sm" variant="outline" onClick={() => bulkAccept("increases")}>Bara höjningar</Button>
          <Button size="sm" variant="outline" onClick={() => bulkAccept("none")}>Avmarkera allt</Button>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Uppdatera</Button>
          <Button size="sm" onClick={() => apply.mutate()} disabled={apply.isPending || Object.values(accepted).filter(Boolean).length === 0}>
            {apply.isPending ? "Sparar…" : `Publicera (${Object.values(accepted).filter(Boolean).length})`}
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-12rem)] rounded-md border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/80 backdrop-blur">
            <tr className="text-left">
              <th className="p-2 font-medium">Artikel</th>
              {stores.map((s) => (
                <th key={s.id} className="p-2 font-medium text-center">{s.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={stores.length + 1} className="p-4">
                <Skeleton className="h-6 w-full mb-1" />
                <Skeleton className="h-6 w-full mb-1" />
                <Skeleton className="h-6 w-3/4" />
              </td></tr>
            )}
            {isError && (
              <tr><td colSpan={stores.length + 1} className="p-4 text-destructive text-center">
                Kunde inte hämta förslag. Kontrollera att artiklar finns i Makrilltrade-cachen.
              </td></tr>
            )}
            {!isLoading && grid.length === 0 && (
              <tr><td colSpan={stores.length + 1} className="p-6 text-center text-muted-foreground">
                Inga aktiva artiklar.
              </td></tr>
            )}
            {grid.map((row) => (
              <tr key={row.article_id} className="border-t border-border">
                <td className="p-2 align-top">
                  <div className="font-medium">{row.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{row.sku ?? row.article_id}</div>
                </td>
                {stores.map((s) => {
                  const cell = row.cells[s.id];
                  if (!cell) return <td key={s.id} className="p-2 text-center text-muted-foreground">—</td>;
                  const k = cellKey(row.article_id, s.id);
                  const editVal = edits[k] ?? cell.suggested_price_ore;
                  const trend = cell.change_ore < 0 ? "down" : cell.change_ore > 0 ? "up" : "same";
                  const trendCls = trend === "down" ? "text-success" : trend === "up" ? "text-warning" : "text-muted-foreground";
                  const TrendIcon = trend === "down" ? TrendingDown : trend === "up" ? TrendingUp : Minus;
                  return (
                    <td key={s.id} className="p-2 text-center align-top">
                      <div className="flex items-start gap-2 justify-center">
                        <Checkbox
                          checked={!!accepted[k]}
                          onCheckedChange={(v) => setAccepted((a) => ({ ...a, [k]: !!v }))}
                          disabled={cell.change_ore === 0 && !edits[k]}
                        />
                        <div className="space-y-0.5 min-w-0" title={cell.rationale}>
                          <div className="text-[10px] text-muted-foreground line-through tabular">
                            {formatSek(cell.current_price_ore)}
                          </div>
                          <div className={`flex items-center gap-1 justify-center font-semibold tabular ${trendCls}`}>
                            <TrendIcon className="h-3 w-3" />
                            <Input
                              type="number"
                              value={Math.round(editVal)}
                              onChange={(e) => setEdits((p) => ({ ...p, [k]: Number(e.target.value) }))}
                              className="h-7 w-20 text-center px-1 tabular"
                            />
                          </div>
                          {cell.margin_percent != null && (
                            <div className="text-[10px] text-muted-foreground">
                              {cell.margin_percent.toFixed(1)}% marginal
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
