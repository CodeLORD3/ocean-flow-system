import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { todayStockholm } from "@/hooks/useStockReport";
import {
  dequeueLine,
  enqueueLine,
  flushQueue,
  readQueue,
  saveCountLine,
  type QueuedLine,
} from "@/lib/mobileCount";

/**
 * Räkning på telefon — data för det guidade inventeringsflödet.
 *
 * Lagerlogiken är oförändrad: ingenting här skriver saldon. Räkningen sparas i
 * stock_count_sessions/stock_count_lines som ett utkast, och blir ett
 * inventeringsunderlag som butikschefen godkänner (se lib/mobileCount.ts).
 */

/** En rad att räkna: en produkt, eller ett parti av en produkt. */
export interface CountItem {
  key: string;
  productId: string;
  lotId: string | null;
  productName: string;
  sku: string | null;
  unit: string;
  imageUrl: string | null;
  category: string | null;
  costPrice: number;
  /** Systemets saldo — visas aldrig under räkningen vid blindräkning. */
  expectedQty: number;
  lotNumber: string | null;
  bestBefore: string | null;
}

export interface CountPlace {
  id: string;
  name: string;
  productCount: number;
  /** Öppen räkning på platsen, om någon börjat. */
  sessionId: string | null;
  startedAt: string | null;
  lastActivityAt: string | null;
  countedRows: number;
  claimedBy: string | null;
  claimedByName: string | null;
}

/** Butikens lagerplatser med antal varor och ev. påbörjad räkning. */
export function useCountPlaces(storeId?: string | null) {
  const date = todayStockholm();
  return useQuery({
    queryKey: ["count-places", storeId, date],
    enabled: !!storeId,
    queryFn: async (): Promise<CountPlace[]> => {
      // Transportlagret räknas aldrig: där står varor som är på väg och
      // stäms av vid mottagningen i stället.
      const { data: locs, error } = await supabase
        .from("storage_locations")
        .select("id, name")
        .eq("store_id", storeId!)
        .eq("active", true)
        .neq("location_type", "leveranslager")
        .order("name");
      if (error) throw error;
      const ids = (locs || []).map((l: any) => l.id as string);
      if (!ids.length) return [];

      const { data: balances } = await supabase
        .from("product_stock_locations")
        .select("location_id, product_id, quantity")
        .in("location_id", ids);
      const counts = new Map<string, number>();
      for (const row of (balances || []) as any[]) {
        counts.set(row.location_id, (counts.get(row.location_id) || 0) + 1);
      }

      const { data: sessions } = await supabase
        .from("stock_count_sessions")
        .select("id, location_id, started_at, last_activity_at, claimed_by, stock_count_lines(count)")
        .eq("store_id", storeId!)
        .eq("count_date", date)
        .eq("status", "open");

      const staffIds = [...new Set(((sessions || []) as any[]).map((s) => s.claimed_by).filter(Boolean))];
      const names = new Map<string, string>();
      if (staffIds.length) {
        const { data: staff } = await supabase
          .from("staff")
          .select("id, first_name, last_name")
          .in("id", staffIds as string[]);
        for (const s of (staff || []) as any[])
          names.set(s.id, `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim());
      }

      const byLocation = new Map<string, any>();
      for (const s of (sessions || []) as any[]) if (s.location_id) byLocation.set(s.location_id, s);

      return (locs || []).map((l: any) => {
        const s = byLocation.get(l.id);
        return {
          id: l.id as string,
          name: l.name as string,
          productCount: counts.get(l.id) || 0,
          sessionId: s?.id ?? null,
          startedAt: s?.started_at ?? null,
          lastActivityAt: s?.last_activity_at ?? null,
          countedRows: Number(s?.stock_count_lines?.[0]?.count ?? 0),
          claimedBy: s?.claimed_by ?? null,
          claimedByName: s?.claimed_by ? names.get(s.claimed_by) ?? null : null,
        };
      });
    },
  });
}

/**
 * Varorna att räkna på en lagerplats. Produkter med flera partier delas upp i
 * en rad per parti, med partinummer och bäst före.
 */
export function useCountItems(locationId?: string | null) {
  return useQuery({
    queryKey: ["count-items", locationId],
    enabled: !!locationId,
    queryFn: async (): Promise<CountItem[]> => {
      const { data: balances, error } = await supabase
        .from("product_stock_locations")
        .select(
          "product_id, quantity, products(name, sku, unit, category, cost_price, image_url)",
        )
        .eq("location_id", locationId!);
      if (error) throw error;

      const { data: moves } = await supabase
        .from("stock_movements")
        .select("product_id, lot_id, quantity_kg")
        .eq("location_id", locationId!)
        .limit(20000);

      /** Kvar per produkt och parti, härlett ur rörelseloggen. */
      const lotQty = new Map<string, Map<string, number>>();
      for (const m of (moves || []) as any[]) {
        if (!m.lot_id) continue;
        if (!lotQty.has(m.product_id)) lotQty.set(m.product_id, new Map());
        const inner = lotQty.get(m.product_id)!;
        inner.set(m.lot_id, (inner.get(m.lot_id) || 0) + Number(m.quantity_kg || 0));
      }
      for (const inner of lotQty.values())
        for (const [lot, qty] of [...inner] as [string, number][])
          if (qty <= 0.0005) inner.delete(lot);

      const lotIds = [...lotQty.values()].flatMap((m) => [...m.keys()]);
      const lotInfo = new Map<string, { lot_number: string | null; best_before: string | null }>();
      if (lotIds.length) {
        const { data: lots } = await supabase
          .from("lots")
          .select("id, lot_number, best_before")
          .in("id", lotIds);
        for (const l of (lots || []) as any[])
          lotInfo.set(l.id, { lot_number: l.lot_number ?? null, best_before: l.best_before ?? null });
      }

      const items: CountItem[] = [];
      for (const row of (balances || []) as any[]) {
        // Bara varor som verkligen finns inlevererade på platsen. Varor utan
        // saldo läggs till i slutet av räkningen om de ändå står i hyllan.
        const lotsHere = lotQty.get(row.product_id);
        const hasLotQty = !!lotsHere && lotsHere.size > 0;
        if (Number(row.quantity || 0) <= 0.0005 && !hasLotQty) continue;
        const p = row.products || {};
        const base = {
          productId: row.product_id as string,
          productName: (p.name as string) || "Okänd vara",
          sku: p.sku ?? null,
          unit: (p.unit as string) || "kg",
          imageUrl: p.image_url ?? null,
          category: p.category ?? null,
          costPrice: Number(p.cost_price) || 0,
        };
        const lots = lotQty.get(row.product_id);
        if (lots && lots.size > 1) {
          for (const [lotId, qty] of lots) {
            const info = lotInfo.get(lotId);
            items.push({
              ...base,
              key: `${row.product_id}:${lotId}`,
              lotId,
              expectedQty: Math.round(qty * 1000) / 1000,
              lotNumber: info?.lot_number ?? null,
              bestBefore: info?.best_before ?? null,
            });
          }
        } else {
          const only = lots && lots.size === 1 ? [...lots.entries()][0] : null;
          const info = only ? lotInfo.get(only[0]) : undefined;
          items.push({
            ...base,
            key: `${row.product_id}:`,
            lotId: only?.[0] ?? null,
            expectedQty: Math.round(Number(row.quantity || 0) * 1000) / 1000,
            lotNumber: info?.lot_number ?? null,
            bestBefore: info?.best_before ?? null,
          });
        }
      }
      return items.sort((a, b) => a.productName.localeCompare(b.productName, "sv"));
    },
  });
}

export interface CountLine {
  id: string;
  product_id: string;
  location_id: string | null;
  lot_id: string | null;
  counted_qty: number | null;
  system_qty: number | null;
  comment: string | null;
  counted_at: string | null;
}

/** Sparade rader i en påbörjad räkning. */
export function useCountLines(sessionId?: string | null) {
  return useQuery({
    queryKey: ["count-lines", sessionId],
    enabled: !!sessionId,
    queryFn: async (): Promise<CountLine[]> => {
      const { data, error } = await supabase
        .from("stock_count_lines")
        .select("id, product_id, location_id, lot_id, counted_qty, system_qty, comment, counted_at")
        .eq("session_id", sessionId!);
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Öppnar (eller återupptar) räkningen för en lagerplats. */
export function useOpenCountSession() {
  const qc = useQueryClient();
  const date = todayStockholm();
  return useMutation({
    mutationFn: async ({
      storeId,
      locationId,
      staffId,
      staffName,
      locationName,
      fresh,
    }: {
      storeId: string;
      locationId: string;
      staffId: string | null;
      staffName?: string | null;
      locationName?: string | null;
      /** Börja om: rensar tidigare inmatade rader. */
      fresh?: boolean;
    }) => {
      const { data: existing } = await supabase
        .from("stock_count_sessions")
        .select("id")
        .eq("store_id", storeId)
        .eq("count_date", date)
        .eq("location_id", locationId)
        .eq("status", "open")
        .limit(1);

      let sessionId = (existing?.[0] as any)?.id as string | undefined;
      if (!sessionId) {
        const { data, error } = await supabase
          .from("stock_count_sessions")
          .insert({
            store_id: storeId,
            location_id: locationId,
            count_date: date,
            status: "open",
            label: locationName ?? null,
            filled_by: staffName ?? null,
            claimed_by: staffId,
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          } as any)
          .select("id")
          .single();
        if (error) throw error;
        sessionId = (data as any).id as string;
      } else if (fresh) {
        await supabase.from("stock_count_lines").delete().eq("session_id", sessionId);
        await supabase
          .from("stock_count_sessions")
          .update({
            claimed_by: staffId,
            filled_by: staffName ?? null,
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          } as any)
          .eq("id", sessionId);
      }
      qc.invalidateQueries({ queryKey: ["count-places"] });
      return sessionId!;
    },
  });
}

/**
 * Sparar en räknad rad. Anropas efter varje inmatning. Raden läggs först i
 * telefonens kö och tas ur kön när databasen bekräftat — tappad täckning
 * tappar därför aldrig en räkning.
 */
export function useSaveCountLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      item,
      locationId,
      quantity,
      comment,
    }: {
      sessionId: string;
      item: CountItem;
      locationId: string;
      quantity: number | null;
      comment?: string | null;
    }) => {
      const row: QueuedLine = {
        sessionId,
        productId: item.productId,
        locationId,
        lotId: item.lotId,
        quantity,
        systemQty: item.expectedQty,
        unit: item.unit,
        comment: comment ?? null,
        at: new Date().toISOString(),
      };
      enqueueLine(row);
      await saveCountLine(row);
      dequeueLine(row);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["count-lines", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["count-places"] });
      qc.invalidateQueries({ queryKey: ["count-queue"] });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["count-queue"] });
    },
  });
}

/**
 * Antal räknade rader som väntar på att komma fram. Försöker skicka dem igen
 * när telefonen får nät och visas som "sparas …" i räkningen.
 */
export function useCountQueue() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["count-queue"],
    queryFn: async () => flushQueue(),
    refetchInterval: 15000,
    initialData: readQueue().length,
  });

  useEffect(() => {
    const retry = () => {
      void flushQueue().then(() => {
        qc.invalidateQueries({ queryKey: ["count-queue"] });
        qc.invalidateQueries({ queryKey: ["count-lines"] });
      });
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [qc]);

  return query;
}

/** Tar bort en räknad rad — "Ångra" på senaste inmatning. */
export function useRemoveCountLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessionId,
      productId,
      locationId,
      lotId,
    }: {
      sessionId: string;
      productId: string;
      locationId: string;
      lotId: string | null;
    }) => {
      let q = supabase
        .from("stock_count_lines")
        .delete()
        .eq("session_id", sessionId)
        .eq("product_id", productId)
        .eq("location_id", locationId);
      q = lotId ? q.eq("lot_id", lotId) : q.is("lot_id", null);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["count-lines", vars.sessionId] });
      qc.invalidateQueries({ queryKey: ["count-places"] });
    },
  });
}

/** Underlag som väntar på butikschefens godkännande. */
export function usePendingCountReports(storeId?: string | null) {
  return useQuery({
    queryKey: ["pending-count-reports", storeId],
    queryFn: async () => {
      let q = supabase
        .from("inventory_reports")
        .select("*, inventory_report_lines(*)")
        .eq("status", "vantar_godkannande")
        .order("reported_at", { ascending: false });
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Hjälpare: nyckel för en rad, samma i utkast och i databasen. */
export function useItemKey() {
  return useCallback((productId: string, lotId: string | null) => `${productId}:${lotId ?? ""}`, []);
}
