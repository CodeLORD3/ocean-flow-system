import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCustomerOrders } from "@/hooks/useCustomerOrders";
import {
  IGNORED_SHOP_ORDER_STATUSES,
  OPEN_SHOP_ORDER_STATUSES,
  ReconStatus,
  addDays,
  isoDate,
  matchKey,
  mondayOf,
} from "@/lib/purchaseReconciliation";

const db = supabase as any;

/* ------------------------------------------------------------- inställningar */

export interface ReconciliationSettings {
  id: string;
  surplus_warn_pct: number;
  average_weeks: number;
}

/** Tröskeln för "stort överskott" och hur många veckor snittet räknas på. */
export function useReconciliationSettings() {
  return useQuery({
    queryKey: ["purchase_reconciliation_settings"],
    queryFn: async () => {
      const { data, error } = await db
        .from("purchase_reconciliation_settings")
        .select("id, surplus_warn_pct, average_weeks")
        .order("created_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { id: "", surplus_warn_pct: 50, average_weeks: 4 }) as ReconciliationSettings;
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* ------------------------------------------------- manuella produktkopplingar */

export interface CustomerProductMatch {
  id: string;
  match_key: string;
  source_name: string;
  product_id: string;
  confirmed_by_name: string | null;
  created_at: string;
}

/** Bekräftade kopplingar återanvänds automatiskt kommande veckor. */
export function useCustomerProductMatches() {
  return useQuery({
    queryKey: ["customer_product_matches"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_product_matches")
        .select("id, match_key, source_name, product_id, confirmed_by_name, created_at");
      if (error) throw error;
      return (data ?? []) as CustomerProductMatch[];
    },
    staleTime: 60 * 1000,
  });
}

/**
 * Sparar en manuellt bekräftad koppling. Ingen matchning sätts någonsin
 * automatiskt — den här mutationen körs bara på användarens uttryckliga val.
 */
export function useConfirmProductMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sourceName: string; productId: string; confirmedByName?: string | null }) => {
      const key = matchKey(input.sourceName);
      if (!key) throw new Error("Varunamnet går inte att koppla — det saknar text.");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db.from("customer_product_matches").upsert(
        {
          match_key: key,
          source_name: input.sourceName,
          product_id: input.productId,
          confirmed_by: auth?.user?.id ?? null,
          confirmed_by_name: input.confirmedByName ?? null,
        },
        { onConflict: "match_key" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_product_matches"] });
    },
  });
}

export function useRemoveProductMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("customer_product_matches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_product_matches"] }),
  });
}

/* ---------------------------------------------------------------- produkter */

export interface ReconProduct {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  category: string | null;
  image_url: string | null;
  /** false = inte markerad som grossistvara → status Info. */
  purchasable: boolean;
}

export function useReconProducts() {
  return useQuery({
    queryKey: ["recon_products"],
    queryFn: async () => {
      const { data, error } = await db
        .from("products")
        .select("id, name, sku, unit, category, image_url, purchasable")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ReconProduct[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

/* --------------------------------------------------- grossistorderrader (rå) */

export interface ShopLineRow {
  id: string;
  shop_order_id: string;
  product_id: string;
  quantity_ordered: number;
  quantity_delivered: number;
  unit: string | null;
  status: string | null;
  /** Effektivt leveransdatum: radens datum, annars orderns önskade datum. */
  effective_date: string | null;
  order_status: string;
  order_week: string;
  store_id: string;
  store_name: string | null;
}

/**
 * Alla grossistorderrader med effektivt leveransdatum. Vecka styrs alltid av
 * leveransdatum — aldrig av orderdatum eller skapelsedatum.
 */
export function useShopOrderLines() {
  return useQuery({
    queryKey: ["recon_shop_order_lines"],
    queryFn: async () => {
      const { data, error } = await db
        .from("shop_order_lines")
        .select(
          "id, shop_order_id, product_id, quantity_ordered, quantity_delivered, unit, status, delivery_date, shop_orders!inner(id, status, order_week, store_id, desired_delivery_date, stores(name))",
        );
      if (error) throw error;
      return ((data ?? []) as any[]).map<ShopLineRow>((r) => ({
        id: r.id,
        shop_order_id: r.shop_order_id,
        product_id: r.product_id,
        quantity_ordered: Number(r.quantity_ordered || 0),
        quantity_delivered: Number(r.quantity_delivered || 0),
        unit: r.unit,
        status: r.status,
        effective_date: r.delivery_date ?? r.shop_orders?.desired_delivery_date ?? null,
        order_status: r.shop_orders?.status ?? "Ny",
        order_week: r.shop_orders?.order_week ?? "",
        store_id: r.shop_orders?.store_id ?? "",
        store_name: r.shop_orders?.stores?.name ?? null,
      }));
    },
  });
}

/* ------------------------------------------------------------- avstämningsrad */

export interface ReconRow {
  key: string;
  productId: string | null;
  name: string;
  unit: string;
  category: string;
  imageUrl: string | null;
  /** Kundbehov denna period, samma beräkning som Totallistan. */
  need: number;
  /** Beställt hos grossisten för samma period. */
  ordered: number;
  /** Beställt − Kundbehov. null när matchningen är osäker. */
  diff: number | null;
  status: ReconStatus;
  /** Sant när överskottet överstiger tröskeln. Statusen förblir Täckt. */
  bigSurplus: boolean;
  /** Antal kundorderrader bakom behovet. */
  customerLines: number;
  /** Grossistorderrader som differensen kommer från, för navigering. */
  shopLines: { lineId: string; orderId: string; storeName: string | null; orderWeek: string; quantity: number }[];
  /** Butiker som har kundbehov för varan. */
  needStores: { storeId: string; storeName: string; quantity: number }[];
  /** Fritextnamn som väntar på manuell matchningsbekräftelse. */
  unmatchedName: string | null;
}

interface ReconInput {
  fromDate: string;
  toDate: string;
  storeId?: string | null;
}

/**
 * Avstämning per produkt: Kundbehov, Beställt och Behovsdifferens för valt
 * intervall. Kundbehovet läses ur kundorderraderna via samma datakälla som
 * Totallistan — ingen parallell aggregering byggs.
 */
export function useReconciliation({ fromDate, toDate, storeId }: ReconInput) {
  const orders = useCustomerOrders({ storeId: storeId ?? null, fromDate, toDate });
  const lines = useShopOrderLines();
  const products = useReconProducts();
  const matches = useCustomerProductMatches();
  const settings = useReconciliationSettings();

  const isLoading = orders.isLoading || lines.isLoading || products.isLoading;

  const rows = useMemo<ReconRow[]>(() => {
    if (isLoading) return [];
    const productById = new Map((products.data ?? []).map((p) => [p.id, p]));
    const matchByKey = new Map((matches.data ?? []).map((m) => [m.match_key, m.product_id]));
    const surplusPct = Number(settings.data?.surplus_warn_pct ?? 50);

    type Draft = ReconRow & { unsure: boolean };
    const map = new Map<string, Draft>();

    const draft = (key: string, base: Partial<Draft>): Draft => {
      const existing = map.get(key);
      if (existing) return existing;
      const created: Draft = {
        key,
        productId: null,
        name: "Okänd vara",
        unit: "kg",
        category: "Övrigt",
        imageUrl: null,
        need: 0,
        ordered: 0,
        diff: 0,
        status: "tackt",
        bigSurplus: false,
        customerLines: 0,
        shopLines: [],
        needStores: [],
        unmatchedName: null,
        unsure: false,
        ...base,
      };
      map.set(key, created);
      return created;
    };

    /* ---- Kundbehov ur kundorderraderna ---- */
    for (const o of orders.data ?? []) {
      if (["avbruten", "forfragan"].includes(String(o.status))) continue;
      for (const l of o.customer_order_lines ?? []) {
        const qty = Number(l.quantity_ordered || 0);
        if (!qty) continue;

        const rawName = l.products?.name || l.free_text_name || l.shopify_title || "Okänd vara";
        // En bekräftad manuell koppling återanvänds automatiskt.
        const confirmed = l.product_id ? null : matchByKey.get(matchKey(rawName)) ?? null;
        const productId = l.product_id ?? confirmed;
        const product = productId ? productById.get(productId) : undefined;
        // Osäker matchning: ingen produktkoppling, eller raden är flaggad.
        const unsure = !productId || !!(l as any).needs_product_match;

        const key = productId ? `p:${productId}` : `x:${matchKey(rawName) || rawName}`;
        const row = draft(key, {
          productId: productId ?? null,
          name: product?.name ?? rawName,
          unit: l.unit || product?.unit || "kg",
          category: (product?.category || l.products?.category || "").trim() || "Övrigt",
          imageUrl: product?.image_url ?? l.products?.image_url ?? null,
          unmatchedName: productId ? null : rawName,
        });
        row.need += qty;
        row.customerLines += 1;
        if (unsure) row.unsure = true;

        const storeName = o.stores?.name ?? "Butik";
        const store = row.needStores.find((s) => s.storeId === o.store_id);
        if (store) store.quantity += qty;
        else row.needStores.push({ storeId: o.store_id, storeName, quantity: qty });
      }
    }

    /* ---- Beställt hos grossisten för samma period ---- */
    for (const l of lines.data ?? []) {
      if ((IGNORED_SHOP_ORDER_STATUSES as readonly string[]).includes(l.order_status)) continue;
      if (!l.effective_date || l.effective_date < fromDate || l.effective_date > toDate) continue;
      if (storeId && l.store_id !== storeId) continue;
      const product = productById.get(l.product_id);
      const key = `p:${l.product_id}`;
      const row = draft(key, {
        productId: l.product_id,
        name: product?.name ?? "Okänd produkt",
        unit: l.unit || product?.unit || "kg",
        category: (product?.category || "").trim() || "Övrigt",
        imageUrl: product?.image_url ?? null,
      });
      row.ordered += l.quantity_ordered;
      row.shopLines.push({
        lineId: l.id,
        orderId: l.shop_order_id,
        storeName: l.store_name,
        orderWeek: l.order_week,
        quantity: l.quantity_ordered,
      });
    }

    /* ---- Status och differens ---- */
    const out: ReconRow[] = [];
    for (const row of map.values()) {
      const product = row.productId ? productById.get(row.productId) : undefined;
      const notPurchasable = !!product && product.purchasable === false;

      if (row.unsure) {
        // Ingen differens räknas alls förrän matchningen bekräftats manuellt.
        row.status = "kontrollera";
        row.diff = null;
      } else if (notPurchasable) {
        row.status = "info";
        row.diff = row.ordered - row.need;
      } else if (row.ordered + 0.005 < row.need) {
        row.status = "saknas";
        row.diff = row.ordered - row.need;
      } else {
        row.status = "tackt";
        row.diff = row.ordered - row.need;
      }

      row.bigSurplus =
        row.status === "tackt" &&
        row.need > 0 &&
        row.diff != null &&
        row.diff > 0 &&
        (row.diff / row.need) * 100 >= surplusPct;

      row.needStores.sort((a, b) => b.quantity - a.quantity);
      const { unsure, ...rest } = row;
      out.push(rest);
    }
    return out;
  }, [isLoading, orders.data, lines.data, products.data, matches.data, settings.data, fromDate, toDate, storeId]);

  return { rows, isLoading, error: orders.error || lines.error || products.error };
}

/* -------------------------------------------- beslutsstöd vid ny beställning */

/**
 * Utestående mängd per produkt i ANDRA öppna grossistordrar.
 * Mängd = beställt − mottaget, aldrig negativ. Ordern som redigeras utesluts.
 */
export function useOutstandingOrdered(excludeOrderId?: string | null) {
  const lines = useShopOrderLines();
  const map = useMemo(() => {
    const out = new Map<string, number>();
    for (const l of lines.data ?? []) {
      if (!(OPEN_SHOP_ORDER_STATUSES as readonly string[]).includes(l.order_status)) continue;
      if (excludeOrderId && l.shop_order_id === excludeOrderId) continue;
      const remaining = l.quantity_ordered - l.quantity_delivered;
      if (remaining <= 0.005) continue;
      out.set(l.product_id, (out.get(l.product_id) || 0) + remaining);
    }
    return out;
  }, [lines.data, excludeOrderId]);
  return { data: map, isLoading: lines.isLoading };
}

/** Kundbehov per produkt för ett datumintervall, till orderformuläret. */
export function useCustomerNeedByProduct(fromDate: string, toDate: string, storeId?: string | null) {
  const { data: orders = [], isLoading } = useCustomerOrders({ storeId: storeId ?? null, fromDate, toDate });
  const matches = useCustomerProductMatches();

  const map = useMemo(() => {
    const matchByKey = new Map((matches.data ?? []).map((m) => [m.match_key, m.product_id]));
    const out = new Map<string, number>();
    for (const o of orders) {
      if (["avbruten", "forfragan"].includes(String(o.status))) continue;
      for (const l of o.customer_order_lines ?? []) {
        const qty = Number(l.quantity_ordered || 0);
        if (!qty) continue;
        const rawName = l.products?.name || l.free_text_name || "";
        const productId = l.product_id ?? matchByKey.get(matchKey(rawName)) ?? null;
        if (!productId) continue;
        out.set(productId, (out.get(productId) || 0) + qty);
      }
    }
    return out;
  }, [orders, matches.data]);

  return { data: map, isLoading };
}

export interface OrderHistoryStat {
  /** Snitt per vecka över de senaste hela veckorna. */
  average: number;
  /** Förra veckans beställda mängd. */
  lastWeek: number;
}

/** Sekundär info: senaste veckornas snitt och förra veckans beställda mängd. */
export function useOrderHistoryStats(weeks = 4) {
  const lines = useShopOrderLines();
  const map = useMemo(() => {
    const thisMonday = mondayOf(new Date());
    const historyStart = isoDate(addDays(thisMonday, -7 * weeks));
    const lastWeekStart = isoDate(addDays(thisMonday, -7));
    const lastWeekEnd = isoDate(addDays(thisMonday, -1));

    const out = new Map<string, OrderHistoryStat>();
    for (const l of lines.data ?? []) {
      if ((IGNORED_SHOP_ORDER_STATUSES as readonly string[]).includes(l.order_status)) continue;
      const d = l.effective_date;
      if (!d || d < historyStart || d >= isoDate(thisMonday)) continue;
      const entry = out.get(l.product_id) ?? { average: 0, lastWeek: 0 };
      entry.average += l.quantity_ordered;
      if (d >= lastWeekStart && d <= lastWeekEnd) entry.lastWeek += l.quantity_ordered;
      out.set(l.product_id, entry);
    }
    for (const entry of out.values()) entry.average = entry.average / Math.max(weeks, 1);
    return out;
  }, [lines.data, weeks]);

  return { data: map, isLoading: lines.isLoading };
}

/** Kandidatförslag för manuell matchning. Föreslår aldrig ett val automatiskt. */
export function useMatchCandidates(sourceName: string | null, limit = 8) {
  const { data: products = [] } = useReconProducts();
  return useMemo(() => {
    if (!sourceName) return [] as ReconProduct[];
    const key = matchKey(sourceName);
    const words = sourceName
      .toLowerCase()
      .split(/[^a-zà-ÿ0-9]+/)
      .filter((w) => w.length >= 3);
    const scored = products.map((p) => {
      const pKey = matchKey(p.name);
      let score = 0;
      if (pKey === key) score += 100;
      else if (pKey.includes(key) || key.includes(pKey)) score += 60;
      for (const w of words) if (p.name.toLowerCase().includes(w)) score += 12;
      if (p.purchasable) score += 3;
      return { p, score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.p);
  }, [products, sourceName, limit]);
}
