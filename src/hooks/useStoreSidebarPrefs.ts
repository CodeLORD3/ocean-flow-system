import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSite } from "@/contexts/SiteContext";

export type SectionPref = { section_key: string; label: string | null; sort_order: number | null };

export function useStoreSidebarPrefs() {
  const { activeStoreId } = useSite();
  const queryClient = useQueryClient();
  const queryKey = ["store-sidebar-prefs", activeStoreId];
  const sectionsKey = ["store-sidebar-sections", activeStoreId];

  const { data: prefs = [], isLoading } = useQuery({
    queryKey,
    enabled: !!activeStoreId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_sidebar_prefs")
        .select("nav_url, hidden, sort_order")
        .eq("store_id", activeStoreId!);
      if (error) throw error;
      return (data ?? []) as { nav_url: string; hidden: boolean; sort_order: number | null }[];
    },
  });

  const { data: sectionPrefs = [] } = useQuery({
    queryKey: sectionsKey,
    enabled: !!activeStoreId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_sidebar_sections")
        .select("section_key, label, sort_order")
        .eq("store_id", activeStoreId!);
      if (error) throw error;
      return (data ?? []) as SectionPref[];
    },
  });

  const hiddenUrls = prefs.filter((p) => p.hidden).map((p) => p.nav_url);
  const itemOrder = new Map(
    prefs.filter((p) => p.sort_order != null).map((p) => [p.nav_url, p.sort_order as number])
  );
  const sectionLabels = new Map(
    sectionPrefs.filter((s) => s.label).map((s) => [s.section_key, s.label as string])
  );
  const sectionOrder = new Map(
    sectionPrefs.filter((s) => s.sort_order != null).map((s) => [s.section_key, s.sort_order as number])
  );

  const setHidden = useMutation({
    mutationFn: async ({ navUrl, hidden }: { navUrl: string; hidden: boolean }) => {
      if (!activeStoreId) throw new Error("Ingen aktiv butik");
      const existing = prefs.find((p) => p.nav_url === navUrl);
      const { error } = await supabase
        .from("store_sidebar_prefs")
        .upsert(
          { store_id: activeStoreId, nav_url: navUrl, hidden, sort_order: existing?.sort_order ?? null },
          { onConflict: "store_id,nav_url" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  /** Persist the full order of nav urls (index = sort_order). */
  const setItemOrder = useMutation({
    mutationFn: async (urls: string[]) => {
      if (!activeStoreId) throw new Error("Ingen aktiv butik");
      const rows = urls.map((url, i) => ({
        store_id: activeStoreId,
        nav_url: url,
        hidden: prefs.find((p) => p.nav_url === url)?.hidden ?? false,
        sort_order: i,
      }));
      const { error } = await supabase
        .from("store_sidebar_prefs")
        .upsert(rows, { onConflict: "store_id,nav_url" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const upsertSection = useMutation({
    mutationFn: async (rows: { section_key: string; label?: string | null; sort_order?: number | null }[]) => {
      if (!activeStoreId) throw new Error("Ingen aktiv butik");
      const payload = rows.map((r) => {
        const existing = sectionPrefs.find((s) => s.section_key === r.section_key);
        return {
          store_id: activeStoreId,
          section_key: r.section_key,
          label: r.label !== undefined ? r.label : existing?.label ?? null,
          sort_order: r.sort_order !== undefined ? r.sort_order : existing?.sort_order ?? null,
        };
      });
      const { error } = await supabase
        .from("store_sidebar_sections")
        .upsert(payload, { onConflict: "store_id,section_key" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sectionsKey }),
  });

  return {
    hiddenUrls,
    isHidden: (url: string) => hiddenUrls.includes(url),
    itemOrder,
    sectionLabels,
    sectionOrder,
    isLoading,
    setHidden,
    setItemOrder,
    upsertSection,
    hasStore: !!activeStoreId,
  };
}
