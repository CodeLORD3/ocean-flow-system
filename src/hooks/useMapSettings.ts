import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MapSettings {
  id: string;
  center_longitude: number;
  center_latitude: number;
  scale: number;
}

const DEFAULTS: Omit<MapSettings, "id"> = {
  center_longitude: 15,
  center_latitude: 54,
  scale: 320,
};

export function useMapSettings() {
  return useQuery({
    queryKey: ["map-settings"],
    queryFn: async (): Promise<MapSettings> => {
      const { data, error } = await supabase
        .from("map_settings" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return { id: "", ...DEFAULTS };
      return data as unknown as MapSettings;
    },
    staleTime: 60_000,
  });
}

export function useUpdateMapSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Partial<Omit<MapSettings, "id">>) => {
      // Get existing row id first
      const { data: existing } = await supabase
        .from("map_settings" as any)
        .select("id")
        .limit(1)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("map_settings" as any)
          .update({ ...values, updated_at: new Date().toISOString() } as any)
          .eq("id", (existing as any).id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["map-settings"] }),
  });
}
