import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const db = supabase as unknown as { from: (t: string) => any };
const NONE = "__ingen";

export function useActiveStores() {
  return useQuery({
    queryKey: ["stores", "active-min"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.from("stores").select("id, name, legal_entity_id, currency").eq("active", true).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; legal_entity_id: string | null; currency: string | null }[];
    },
  });
}

/** Välj butik för en inköpsrapport (eller en rad). Läser och sparar själv. */
export function PurchaseStorePicker({ table, id, value, onSaved }: {
  table: "purchase_reports" | "purchase_report_lines";
  id: string;
  value?: string | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const { data: stores = [] } = useActiveStores();
  const current = useQuery({
    queryKey: [table, "store", id],
    enabled: value === undefined,
    queryFn: async () => {
      const { data } = await db.from(table).select("store_id").eq("id", id).maybeSingle();
      return (data?.store_id ?? null) as string | null;
    },
  });
  const storeId = value !== undefined ? value : current.data ?? null;
  const save = useMutation({
    mutationFn: async (v: string | null) => {
      const { error } = await db.from(table).update({ store_id: v }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [table, "store", id] });
      qc.invalidateQueries({ queryKey: ["resultat"] });
      onSaved?.();
      toast.success("Butik sparad");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Select value={storeId ?? NONE} onValueChange={(v) => save.mutate(v === NONE ? null : v)}>
      <SelectTrigger className="h-7 text-xs w-44" onClick={(e) => e.stopPropagation()}>
        <SelectValue placeholder="Butik" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Ingen butik</SelectItem>
        {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
