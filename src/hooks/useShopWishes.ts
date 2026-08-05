import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ShopWish {
  id: string;
  store_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  category: string;
  status: string;
  archived: boolean;
  published_to_wholesale: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useShopWishes(storeId: string | null) {
  const qc = useQueryClient();
  const key = ["shop_wishes", storeId];

  const query = useQuery({
    queryKey: key,
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_wishes" as any)
        .select("*")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as ShopWish[];
    },
  });

  const addWish = useMutation({
    mutationFn: async (wish: { title: string; description?: string; due_date?: string; category: string; store_id: string }) => {
      const { error } = await supabase.from("shop_wishes" as any).insert(wish as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("shop_wishes" as any).update({ status, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const archiveWish = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shop_wishes" as any).update({ archived: true, updated_at: new Date().toISOString() } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const setPublished = useMutation({
    mutationFn: async ({ id, published }: { id: string; published: boolean }) => {
      const { error } = await supabase
        .from("shop_wishes" as any)
        .update({
          published_to_wholesale: published,
          published_at: published ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["shop_wishes_published"] });
    },
  });

  return { wishes: query.data ?? [], isLoading: query.isLoading, addWish, updateStatus, archiveWish, setPublished };
}

export interface PublishedWish extends ShopWish {
  storeName: string;
}

/** Alla butikers publicerade önskemål — för grossistportalen. */
export function usePublishedWishes() {
  const query = useQuery({
    queryKey: ["shop_wishes_published"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shop_wishes" as any)
        .select("*, stores(name)")
        .eq("published_to_wholesale", true)
        .eq("archived", false)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return ((data as any[]) ?? []).map((w) => ({
        ...w,
        storeName: w.stores?.name ?? "Butik",
      })) as PublishedWish[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("shop_wishes" as any)
        .update({ status, updated_at: new Date().toISOString() } as any)
        .eq("id", id);
      if (error) throw error;
    },
  });

  return { wishes: query.data ?? [], isLoading: query.isLoading, updateStatus };
}
