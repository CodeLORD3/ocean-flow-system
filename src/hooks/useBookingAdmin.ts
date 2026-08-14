import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";

const db = supabase as any;

/* ------------------------------------------------------------- sortimentet */

export interface BookingProduct {
  id: string;
  name: string;
  sku: string;
  unit: string;
  category: string | null;
  image_url: string | null;
  active: boolean;
  bookable_online: boolean | null;
  booking_display_name: string | null;
  booking_circa_price: number | null;
  booking_step: number | null;
  booking_lead_days: number | null;
  /** Informationsgräns för bokad volym per hämtdag. null = av. */
  booking_volume_alarm: number | null;
}

const PRODUCT_FIELDS =
  "id, name, sku, unit, category, image_url, active, bookable_online, booking_display_name, booking_circa_price, booking_step, booking_lead_days, booking_volume_alarm";

/** Alla aktiva produkter, med de bokningsbara samlade först. */
export function useBookingProducts(search = "") {
  return useQuery({
    queryKey: ["booking_products", search],
    queryFn: async () => {
      let q = db.from("products").select(PRODUCT_FIELDS).eq("active", true).order("name");
      if (search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`name.ilike.${s},sku.ilike.${s},booking_display_name.ilike.${s}`);
      }
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return (data || []) as BookingProduct[];
    },
  });
}

export function useUpdateBookingProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, ...patch }: Partial<BookingProduct> & { id: string; name?: string }) => {
      const { error } = await db.from("products").update(patch).eq("id", id);
      if (error) throw error;
      await logActivity({
        action_type: "update",
        description:
          patch.bookable_online === undefined
            ? `Bokningsuppgifter ändrade: ${name ?? "produkt"}`
            : patch.bookable_online
              ? `Produkt bokningsbar online: ${name ?? "produkt"}`
              : `Produkt avflaggad från bokningssidan: ${name ?? "produkt"}`,
        entity_type: "product",
        entity_id: id,
        details: patch as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking_products"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/* ------------------------------------------------------ butiksinställningar */

export interface BookingStore {
  id: string;
  name: string;
  city: string;
  booking_open: boolean | null;
  booking_closed_message: string | null;
}

/** Butiker som ligger på bokningssidan (Göteborg), eller en enskild butik. */
export function useBookingStores(storeId?: string | null) {
  return useQuery({
    queryKey: ["booking_stores", storeId],
    queryFn: async () => {
      let q = db
        .from("stores")
        .select("id, name, city, booking_open, booking_closed_message")
        .eq("is_wholesale", false)
        .order("name");
      if (storeId) q = q.eq("id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as BookingStore[];
    },
  });
}

export function useUpdateBookingStore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      name,
      ...patch
    }: { id: string; name?: string; booking_open?: boolean; booking_closed_message?: string | null }) => {
      const { error } = await db.from("stores").update(patch).eq("id", id);
      if (error) throw error;
      await logActivity({
        action_type: "update",
        description:
          patch.booking_open === undefined
            ? `Stängningsmeddelande ändrat: ${name ?? "butik"}`
            : patch.booking_open
              ? `Bokningen öppnad: ${name ?? "butik"}`
              : `Bokningen stängd: ${name ?? "butik"}`,
        entity_type: "store",
        entity_id: id,
        store_id: id,
        details: patch as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking_stores"] });
      qc.invalidateQueries({ queryKey: ["stores"] });
    },
  });
}

/* --------------------------------------------------------------- spärrlista */

export interface BlockedCustomer {
  id: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  store_id: string | null;
  booking_blocked: boolean | null;
  booking_blocked_at: string | null;
  booking_blocked_by: string | null;
  booking_block_reason: string | null;
  no_show_count: number | null;
}

/** Spärrade kunder, samt (vid sökning) kandidater att spärra. */
export function useBlockedCustomers(search = "") {
  return useQuery({
    queryKey: ["booking_blocklist", search],
    queryFn: async () => {
      const base =
        "id, name, first_name, last_name, phone, email, store_id, booking_blocked, booking_blocked_at, booking_blocked_by, booking_block_reason, no_show_count";
      const blocked = await db
        .from("customers_retail")
        .select(base)
        .eq("booking_blocked", true)
        .order("booking_blocked_at", { ascending: false });
      if (blocked.error) throw blocked.error;

      let matches: BlockedCustomer[] = [];
      if (search.trim().length >= 3) {
        const s = `%${search.trim()}%`;
        const res = await db
          .from("customers_retail")
          .select(base)
          .or(`name.ilike.${s},phone.ilike.${s},email.ilike.${s},last_name.ilike.${s}`)
          .limit(50);
        if (res.error) throw res.error;
        matches = (res.data || []) as BlockedCustomer[];
      }

      return {
        blocked: (blocked.data || []) as BlockedCustomer[],
        matches,
      };
    },
  });
}

export interface BlockAuditRow {
  id: string;
  customer_id: string;
  action: "sparr" | "havning";
  reason: string | null;
  actor_name: string | null;
  phone_normalized: string | null;
  created_at: string;
}

export function useBlockAudit(limit = 100) {
  return useQuery({
    queryKey: ["booking_block_audit", limit],
    queryFn: async () => {
      const { data, error } = await db
        .from("booking_block_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as BlockAuditRow[];
    },
  });
}

/** Spärr och hävning är alltid ett manuellt beslut och loggas alltid. */
export function useSetCustomerBlocked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      customer: BlockedCustomer;
      blocked: boolean;
      reason: string;
      actorName: string;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await db
        .from("customers_retail")
        .update({
          booking_blocked: params.blocked,
          booking_blocked_at: params.blocked ? new Date().toISOString() : null,
          booking_blocked_by: params.blocked ? (u.user?.id ?? null) : null,
          booking_block_reason: params.blocked ? params.reason.trim() || null : null,
        })
        .eq("id", params.customer.id);
      if (error) throw error;

      const audit = await db.from("booking_block_audit").insert({
        customer_id: params.customer.id,
        action: params.blocked ? "sparr" : "havning",
        reason: params.reason.trim() || null,
        actor_user_id: u.user?.id ?? null,
        actor_name: params.actorName || null,
        phone_normalized: params.customer.phone ?? null,
      });
      if (audit.error) throw audit.error;

      await logActivity({
        action_type: "update",
        description: `${params.blocked ? "Bokningsspärr satt" : "Bokningsspärr hävd"}: ${
          params.customer.phone ?? params.customer.name ?? "kund"
        }`,
        entity_type: "customers_retail",
        entity_id: params.customer.id,
        details: { reason: params.reason, blocked: params.blocked },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking_blocklist"] });
      qc.invalidateQueries({ queryKey: ["booking_block_audit"] });
      qc.invalidateQueries({ queryKey: ["customers_retail"] });
    },
  });
}

/* ------------------------------------------------------------- systemstatus */

export interface BookingStatus {
  day: string;
  per_store: { store_id: string; store_name: string; web: number; phone: number; total: number }[];
  sms: { sent: number; delivered: number; errors: number; test: number; total: number; cost: number };
  guard: { kind: string; count: number }[];
  otp: {
    codes_sent: number;
    codes_verified: number;
    completed_bookings: number;
    rate: number | null;
  };
  volume_alarms: {
    wanted_date: string;
    product_id: string | null;
    product_name: string;
    unit: string;
    total: number;
    threshold: number;
  }[];
  failed_bookings: number;
  reminders_failed: number;
}

export function useBookingStatus(day?: string) {
  return useQuery({
    queryKey: ["booking_status_day", day ?? "idag"],
    queryFn: async () => {
      const { data, error } = await db.rpc("booking_status_day", { _day: day ?? null });
      if (error) throw error;
      return data as BookingStatus;
    },
    refetchInterval: 60_000,
  });
}

/* ---------------------------------------------------------------- uteblev */

/** Räknar upp no_show_count på kundposten. Ångra räknar ner igen. */
export function useMarkNoShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      orderId: string;
      customerId: string | null;
      orderNumber: string;
      undo?: boolean;
    }) => {
      const { data: u } = await supabase.auth.getUser();
      const order = await db
        .from("customer_orders")
        .update(
          params.undo
            ? { no_show_at: null, no_show_by: null }
            : { no_show_at: new Date().toISOString(), no_show_by: u.user?.id ?? null },
        )
        .eq("id", params.orderId);
      if (order.error) throw order.error;

      if (params.customerId) {
        const cur = await db
          .from("customers_retail")
          .select("no_show_count")
          .eq("id", params.customerId)
          .maybeSingle();
        if (cur.error) throw cur.error;
        const next = Math.max(0, Number(cur.data?.no_show_count ?? 0) + (params.undo ? -1 : 1));
        const upd = await db
          .from("customers_retail")
          .update({ no_show_count: next })
          .eq("id", params.customerId);
        if (upd.error) throw upd.error;
      }

      await logActivity({
        action_type: "update",
        description: params.undo
          ? `Uteblev ångrat: ${params.orderNumber}`
          : `Kund uteblev: ${params.orderNumber}`,
        entity_type: "customer_order",
        entity_id: params.orderId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["customers_retail"] });
      qc.invalidateQueries({ queryKey: ["booking_blocklist"] });
    },
  });
}

/* --------------------------------------------------- bokad volym per hämtdag */

export interface BookedVolumeRow {
  wanted_date: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  total: number;
  threshold: number | null;
  over_threshold: boolean;
}

/**
 * Bokad volym per vara och hämtdag. Underlag för inköpet — bokningssidan
 * begränsar aldrig volymen, så inköpet måste kunna ta höjd i förväg.
 */
export function useBookedVolumes(from?: string, days = 14) {
  return useQuery({
    queryKey: ["booking_volume_by_day", from ?? "idag", days],
    queryFn: async () => {
      const { data, error } = await db.rpc("booking_volume_by_day", {
        _from: from ?? null,
        _days: days,
      });
      if (error) throw error;
      return ((data || []) as any[]).map((r) => ({
        ...r,
        total: Number(r.total ?? 0),
        threshold: r.threshold != null ? Number(r.threshold) : null,
        over_threshold: !!r.over_threshold,
      })) as BookedVolumeRow[];
    },
  });
}

/* -------------------------------------------------------- helgdagskalender */

export interface SpecialDay {
  id: string;
  store_id: string;
  day: string;
  closed: boolean;
  open_time: string | null;
  close_time: string | null;
  note: string | null;
}

/** Avvikande öppettider per butik och datum, dagens datum och framåt. */
export function useStoreSpecialDays(storeId?: string | null) {
  return useQuery({
    queryKey: ["store_special_days", storeId ?? "alla"],
    queryFn: async () => {
      let q = db
        .from("store_special_days")
        .select("id, store_id, day, closed, open_time, close_time, note")
        .gte("day", new Date().toISOString().slice(0, 10))
        .order("day");
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as SpecialDay[];
    },
  });
}

export function useSaveSpecialDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row: {
      store_id: string;
      storeName?: string;
      day: string;
      closed: boolean;
      open_time: string | null;
      close_time: string | null;
      note: string | null;
    }) => {
      const { storeName, ...patch } = row;
      const { error } = await db.from("store_special_days").upsert(
        {
          ...patch,
          open_time: patch.closed ? null : patch.open_time || null,
          close_time: patch.closed ? null : patch.close_time || null,
        },
        { onConflict: "store_id,day" },
      );
      if (error) throw new Error(error.message);
      await logActivity({
        action_type: "update",
        description: `${patch.closed ? "Stängd dag" : "Avvikande öppettider"} ${patch.day}: ${storeName ?? "butik"}`,
        entity_type: "store_special_days",
        store_id: patch.store_id,
        details: patch as Record<string, unknown>,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_special_days"] }),
  });
}

export function useDeleteSpecialDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("store_special_days").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["store_special_days"] }),
  });
}

/* ------------------------------------------------------------ GDPR-radering */

/**
 * Raderar kundens personuppgifter på begäran. Orderhistoriken behålls, men
 * avidentifierad — omsättning och statistik påverkas aldrig.
 */
export function useAnonymizeCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { customerId: string; reason: string }) => {
      const { data, error } = await db.rpc("anonymize_retail_customer", {
        _customer_id: params.customerId,
        _reason: params.reason.trim() || null,
      });
      if (error) throw new Error(error.message);
      return data as { orders_anonymized: number; sms_rows_cleared: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["booking_blocklist"] });
      qc.invalidateQueries({ queryKey: ["customers_retail"] });
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
    },
  });
}
