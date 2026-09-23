import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type PosPriceRow = {
  price_list_id: string;
  price_list_name: string;
  legal_entity_id: string | null;
  legal_name: string | null;
  store_id: string | null;
  store_name: string | null;
  pos_enabled: boolean;
  valid_from: string;
  item_id: string;
  sku: string | null;
  barcode: string | null;
  product_name: string;
  unit: string | null;
  price: number;
  vat_rate: number;
  item_pos_enabled: boolean;
  category: string | null;
};

/** Central prisvy: alla prisrader per bolag/butik, kassapriser först. */
export function usePosPrices(entityId: string | null, onlyPos: boolean) {
  return useQuery({
    queryKey: ["pos-prices", entityId, onlyPos],
    queryFn: async () => {
      let q = supabase
        .from("pos_price_overview" as any)
        .select("*")
        .order("valid_from", { ascending: false })
        .limit(2000);
      if (entityId) q = q.eq("legal_entity_id", entityId);
      if (onlyPos) q = q.eq("pos_enabled", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as PosPriceRow[];
    },
  });
}

export type PosQueueHealth = {
  pending: number;
  failed: number;
  sent_today: number;
  oldest_pending: string | null;
};

export function usePosQueueHealth() {
  return useQuery({
    queryKey: ["pos-queue-health"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("pos_queue_health" as any);
      if (error) throw error;
      return (data ?? { pending: 0, failed: 0, sent_today: 0, oldest_pending: null }) as PosQueueHealth;
    },
    refetchInterval: 30_000,
  });
}

/** Tömmer pushkön mot Nimpos artikel-/pris-API. */
export function usePosPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts: { retryFailed?: boolean; dryRun?: boolean } = {}) => {
      const { data, error } = await supabase.functions.invoke("nimpos-push", {
        body: { retry_failed: opts.retryFailed === true, dry_run: opts.dryRun === true },
      });
      if (error) throw error;
      return data as { sent?: number; failed?: number; would_send?: number; error?: string };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["pos-queue-health"] });
      if (res?.error) {
        toast({ title: "Push misslyckades", description: res.error, variant: "destructive" });
      } else if (res?.would_send !== undefined) {
        toast({ title: "Testkörning", description: `${res.would_send} rader skulle skickas` });
      } else {
        toast({
          title: "Priser skickade",
          description: `${res?.sent ?? 0} rader till kassan${res?.failed ? `, ${res.failed} fel` : ""}`,
        });
      }
    },
    onError: (e: any) =>
      toast({ title: "Push misslyckades", description: e?.message ?? String(e), variant: "destructive" }),
  });
}
