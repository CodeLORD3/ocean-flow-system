import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";

export function useStoreSidebarPrefs() {
  const { activeStoreId } = useSite();
  const queryClient = useQueryClient();
  const queryKey = ["store-sidebar-prefs", activeStoreId];

  const { data: hiddenUrls = [], isLoading } = useQuery({
    queryKey,
    enabled: !!activeStoreId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_sidebar_prefs")
        .select("nav_url, hidden")
        .eq("store_id", activeStoreId!);
      if (error) throw error;
      return (data ?? []).filter((r) => r.hidden).map((r) => r.nav_url as string);
    },
  });

  const setHidden = useMutation({
    mutationFn: async ({ navUrl, hidden }: { navUrl: string; hidden: boolean }) => {
      if (!activeStoreId) throw new Error("Ingen aktiv butik");
      if (hidden) {
        const { error } = await supabase
          .from("store_sidebar_prefs")
          .upsert(
            { store_id: activeStoreId, nav_url: navUrl, hidden: true },
            { onConflict: "store_id,nav_url" }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("store_sidebar_prefs")
          .delete()
          .eq("store_id", activeStoreId)
          .eq("nav_url", navUrl);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    hiddenUrls,
    isHidden: (url: string) => hiddenUrls.includes(url),
    isLoading,
    setHidden,
    hasStore: !!activeStoreId,
  };
}
