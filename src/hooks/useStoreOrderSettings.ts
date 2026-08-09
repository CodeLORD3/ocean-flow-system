import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MajorHoliday,
  SpecialDay,
  StoreOrderSettings,
} from "@/lib/catering";

const db = supabase as any;

/** Butikens öppettider och kapacitetstak för kundbeställningar. */
export function useStoreOrderSettings(storeId?: string | null) {
  return useQuery({
    queryKey: ["store_order_settings", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("store_order_settings")
        .select("*")
        .eq("store_id", storeId)
        .maybeSingle();
      if (error) throw error;
      return (data || null) as StoreOrderSettings | null;
    },
  });
}

export function useSaveStoreOrderSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<StoreOrderSettings> & { store_id: string }) => {
      const { error } = await db
        .from("store_order_settings")
        .upsert(input, { onConflict: "store_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_order_settings"] }),
  });
}

/** Avvikande dagar (stängt eller andra tider) för en butik. */
export function useSpecialDays(storeId?: string | null) {
  return useQuery({
    queryKey: ["store_special_days", storeId],
    enabled: !!storeId,
    queryFn: async () => {
      const { data, error } = await db
        .from("store_special_days")
        .select("*")
        .eq("store_id", storeId)
        .gte("day", new Date().toISOString().slice(0, 10))
        .order("day");
      if (error) throw error;
      return (data || []) as SpecialDay[];
    },
  });
}

export function useSaveSpecialDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SpecialDay> & { store_id: string; day: string }) => {
      const { error } = await db
        .from("store_special_days")
        .upsert(input, { onConflict: "store_id,day" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_special_days"] }),
  });
}

export function useDeleteSpecialDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("store_special_days").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_special_days"] }),
  });
}

/** Storhelger. Gäller alla butiker när store_id är tomt. */
export function useMajorHolidays(storeId?: string | null) {
  return useQuery({
    queryKey: ["major_holidays", storeId],
    queryFn: async () => {
      const { data, error } = await db
        .from("major_holidays")
        .select("*")
        .order("holiday_date");
      if (error) throw error;
      const rows = (data || []) as MajorHoliday[];
      if (!storeId) return rows;
      return rows.filter((h) => !h.store_id || h.store_id === storeId);
    },
  });
}

export function useSaveMajorHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<MajorHoliday>) => {
      const { error } = input.id
        ? await db.from("major_holidays").update(input).eq("id", input.id)
        : await db.from("major_holidays").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["major_holidays"] }),
  });
}

export function useDeleteMajorHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("major_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["major_holidays"] }),
  });
}

/** Order samma dag i butiken — underlag för kapacitetskontrollen. */
export function useSameDayOrders(storeId?: string | null, date?: string | null) {
  return useQuery({
    queryKey: ["customer_orders_same_day", storeId, date],
    enabled: !!storeId && !!date,
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_orders")
        .select("id, category, order_type, wanted_time, status")
        .eq("store_id", storeId)
        .eq("wanted_date", date)
        .neq("status", "avbruten");
      if (error) throw error;
      return (data || []) as {
        id: string;
        category: string;
        order_type: string;
        wanted_time: string | null;
        status: string;
      }[];
    },
  });
}
