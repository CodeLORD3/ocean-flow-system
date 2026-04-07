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

  return { wishes: query.data ?? [], isLoading: query.isLoading, addWish, updateStatus, archiveWish };
}
