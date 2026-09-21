import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Standardtiden bor på standarduppgiften, delad i fem delar:
 * hämta, förbereda, utföra, kontrollera och återställa.
 */
export type StandardTimeRow = {
  std_fetch_minutes: number | null;
  std_prepare_minutes: number | null;
  std_do_minutes: number | null;
  std_check_minutes: number | null;
  std_restore_minutes: number | null;
  auto_start: boolean;
  estimated_minutes: number | null;
};

export function useStandardTime(templateItemId?: string | null) {
  return useQuery({
    queryKey: ["standard-time", templateItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_template_items")
        .select(
          "std_fetch_minutes, std_prepare_minutes, std_do_minutes, std_check_minutes, std_restore_minutes, auto_start, estimated_minutes",
        )
        .eq("id", templateItemId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as StandardTimeRow | null;
    },
    enabled: !!templateItemId,
  });
}

export function useSaveStandardTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ templateItemId, ...patch }: { templateItemId: string } & Partial<StandardTimeRow>) => {
      const { error } = await supabase.from("checklist_template_items").update(patch).eq("id", templateItemId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["standard-time"] });
      qc.invalidateQueries({ queryKey: ["standard-tasks"] });
    },
  });
}
