import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import { fetchEffectiveCosts } from "@/lib/effectiveCost";
import {
  CustomerOrder,
  CustomerOrderLine,
  RetailCustomer,
  derivePackStatus,
  evaluateReservation,
  logOrderEvent,
  nextOrderNumber,
  packLine as packLineLedger,
  unpackLine as unpackLineLedger,
  reverseLine,
  todaysPrice,
  orderTab,
} from "@/lib/customerOrders";

const db = supabase as any;

const ORDER_SELECT =
  "*, stores(id, name, city, country, currency), customers_retail(*), customer_order_lines(*, products!customer_order_lines_product_id_fkey(id, name, sku, unit, image_url, shelf_life_days, shelf_life_open_days, category, allergens), lots(id, lot_number, best_before))";

/* -------------------------------------------------------------- kundregister */

export function useRetailCustomers(storeId?: string | null, search?: string) {
  return useQuery({
    queryKey: ["customers_retail", storeId, search],
    queryFn: async () => {
      let q = db
        .from("customers_retail")
        .select("*, stores(id, name)")
        .order("name");
      if (storeId) q = q.eq("store_id", storeId);
      if (search && search.trim()) {
        const s = `%${search.trim()}%`;
        q = q.or(`name.ilike.${s},phone.ilike.${s},email.ilike.${s}`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as RetailCustomer[];
    },
  });
}

export function useCreateRetailCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (customer: Partial<RetailCustomer>) => {
      const { data, error } = await db
        .from("customers_retail")
        .insert(customer)
        .select("*")
        .single();
      if (error) throw error;
      return data as RetailCustomer;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers_retail"] }),
  });
}

export function useUpdateRetailCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<RetailCustomer> & { id: string }) => {
      const { error } = await db.from("customers_retail").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customers_retail"] }),
  });
}

/**
 * Radering av kund tar bort personuppgifterna men behåller ordern anonymiserad
 * för bokföringens skull.
 */
export function useAnonymizeRetailCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await db
        .from("customer_orders")
        .update({
          customer_id: null,
          customer_name_snapshot: "Raderad kund",
          customer_phone_snapshot: null,
          delivery_street: null,
          delivery_postal_code: null,
          delivery_city: null,
        })
        .eq("customer_id", id);
      const { error } = await db.from("customers_retail").delete().eq("id", id);
      if (error) throw error;
      await logActivity({
        action_type: "delete",
        description: "Privatkund raderad, order anonymiserade",
        entity_type: "customers_retail",
        entity_id: id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers_retail"] });
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
    },
  });
}

/* ------------------------------------------------------------------- ordrar */

export interface OrderFilter {
  storeId?: string | null;
  status?: string;
  packStatus?: string;
  orderType?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  /** true = endast arkiverade, false/undefined = endast ej arkiverade. */
  archived?: boolean;
  /** true = både arkiverade och aktiva (används vid fritextsök över alla flikar). */
  includeArchived?: boolean;
}


export function useCustomerOrders(filter: OrderFilter = {}) {
  return useQuery({
    queryKey: ["customer_orders", filter],
    queryFn: async () => {
      let q = db
        .from("customer_orders")
        .select(ORDER_SELECT)
        .order("wanted_date")
        .order("wanted_time", { nullsFirst: false });
      if (filter.storeId) q = q.eq("store_id", filter.storeId);
      if (filter.status && filter.status !== "all") q = q.eq("status", filter.status);
      if (filter.packStatus && filter.packStatus !== "all") q = q.eq("pack_status", filter.packStatus);
      if (filter.orderType && filter.orderType !== "all") q = q.eq("order_type", filter.orderType);
      if (filter.fromDate) q = q.gte("wanted_date", filter.fromDate);
      if (filter.toDate) q = q.lte("wanted_date", filter.toDate);
      if (filter.archived) q = q.not("archived_at", "is", null);
      else if (!filter.includeArchived) q = q.is("archived_at", null);

      const { data, error } = await q;
      if (error) throw error;
      let rows = (data || []) as CustomerOrder[];

      // Fritextsök mot kundnamn, telefon, ordernummer och produkt (namn/SKU/fritext)
      const s = filter.search?.trim().toLowerCase();
      if (s) {
        rows = rows.filter((o) => {
          const name = (o.customers_retail?.name || o.customer_name_snapshot || "").toLowerCase();
          const phone = (o.customers_retail?.phone || o.customer_phone_snapshot || "").toLowerCase();
          const product = (o.customer_order_lines ?? []).some((l) =>
            [l.products?.name, l.products?.sku, l.free_text_name]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(s)),
          );
          return (
            name.includes(s) || phone.includes(s) || o.order_number.toLowerCase().includes(s) || product
          );
        });
      }
      return rows;
    },
  });
}

/**
 * Antal beställningar per kund i hela kedjan, oavsett butik och arkivstatus.
 * Används för stjärnan i orderlistan (stamkund) och räknas på verkliga ordrar.
 */
export function useCustomerOrderCounts() {
  return useQuery({
    queryKey: ["customer_orders", "counts-per-customer"],
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_orders")
        .select("customer_id")
        .not("customer_id", "is", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const r of (data || []) as { customer_id: string }[])
        counts[r.customer_id] = (counts[r.customer_id] || 0) + 1;
      return counts;
    },
  });
}


export function useCustomerOrderEvents(orderId?: string | null) {
  return useQuery({
    queryKey: ["customer_order_events", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_order_events")
        .select("*")
        .eq("customer_order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

export interface NewOrderLineInput {
  product_id?: string | null;
  free_text_name?: string | null;
  is_free_text?: boolean;
  quantity_ordered: number;
  unit?: string;
  estimated_price_per_unit?: number | null;
  price_override_reason?: string | null;
  note?: string | null;
  portion_per_guest?: number | null;
}

export interface NewOrderInput {
  store_id: string;
  customer_id?: string | null;
  customer_name_snapshot?: string | null;
  customer_phone_snapshot?: string | null;
  order_type: string;
  category: string;
  wanted_date: string;
  wanted_time?: string | null;
  delivery_street?: string | null;
  delivery_postal_code?: string | null;
  delivery_city?: string | null;
  guest_count?: number | null;
  allergy_note?: string | null;
  excluded_allergens?: string[];
  source: string;
  received_by_name?: string | null;
  status?: string;
  note?: string | null;
  lines: NewOrderLineInput[];
}

export function useCreateCustomerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewOrderInput) => {
      const orderNumber = await nextOrderNumber(input.store_id);
      const isRequest = input.status === "forfragan";

      const estimated = input.lines.reduce(
        (sum, l) => sum + Number(l.quantity_ordered || 0) * Number(l.estimated_price_per_unit || 0),
        0,
      );

      const { lines, ...orderFields } = input;
      const { data: order, error } = await db
        .from("customer_orders")
        .insert({
          ...orderFields,
          order_number: orderNumber,
          status: input.status || "ny",
          estimated_total: Math.round(estimated * 100) / 100,
        })
        .select("*")
        .single();
      if (error) throw error;

      // Reservationsregeln körs per rad. En förfrågan reserverar inget lager
      // och skapar inget inköpsbehov.
      // Gällande pris låses på raden vid ordertillfället och räknas aldrig om.
      const costMap = await fetchEffectiveCosts(lines.map((l: any) => l.product_id));
      const lineRows = [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        let reservation_status = "ingen";
        let reserved_lot_id: string | null = null;
        let reserved_quantity = 0;

        if (!isRequest && l.product_id && !l.is_free_text) {
          const outcome = await evaluateReservation({
            productId: l.product_id,
            storeId: input.store_id,
            wantedDate: input.wanted_date,
            quantity: Number(l.quantity_ordered || 0),
          });
          reservation_status = outcome.status;
          reserved_lot_id = outcome.lotId;
          reserved_quantity = outcome.status === "reserverad" ? Number(l.quantity_ordered || 0) : 0;
        }

        lineRows.push({
          customer_order_id: order.id,
          product_id: l.product_id ?? null,
          free_text_name: l.free_text_name ?? null,
          is_free_text: !!l.is_free_text,
          quantity_ordered: l.quantity_ordered,
          unit: l.unit || "kg",
          estimated_price_per_unit: l.estimated_price_per_unit ?? null,
          price_override_reason: l.price_override_reason ?? null,
          note: l.note ?? null,
          portion_per_guest: l.portion_per_guest ?? null,
          reservation_status,
          reserved_lot_id,
          reserved_quantity,
          sort_order: i,
          cost_at_order: l.product_id ? (costMap.get(l.product_id)?.value ?? null) : null,
          cost_source_at_order: l.product_id ? (costMap.get(l.product_id)?.source ?? null) : null,
        });
      }

      if (lineRows.length > 0) {
        const { error: lineError } = await db.from("customer_order_lines").insert(lineRows);
        if (lineError) throw lineError;
      }

      await logOrderEvent({
        orderId: order.id,
        eventType: "skapad",
        description: `Order ${orderNumber} skapad`,
        performedBy: input.received_by_name ?? null,
      });

      return order as CustomerOrder;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["customer_purchase_needs"] });
      qc.invalidateQueries({ queryKey: ["customer_reservations"] });
    },
  });
}

/**
 * Godkänner webbupphämtningar som kräver ett extra steg (t.ex. Zollikon).
 * Först efter godkännandet flyttas ordern in i Pågående.
 */
export function useApproveCustomerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids }: { ids: string[] }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db
        .from("customer_orders")
        .update({ approved_at: new Date().toISOString(), approved_by: auth?.user?.id ?? null })
        .in("id", ids);
      if (error) throw error;
      for (const id of ids) {
        await logOrderEvent({
          orderId: id,
          eventType: "godkand",
          description: "Hämtning i butik godkändes",
          performedBy: auth?.user?.id ?? null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
    },
  });
}

/** Arkiverar eller återställer en kundbeställning. */
export function useArchiveCustomerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, archive }: { ids: string[]; archive: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await db
        .from("customer_orders")
        .update(
          archive
            ? { archived_at: new Date().toISOString(), archived_by: auth?.user?.id ?? null }
            : { archived_at: null, archived_by: null },
        )
        .in("id", ids);
      if (error) throw error;
      for (const id of ids) {
        await logOrderEvent({
          orderId: id,
          eventType: archive ? "arkiverad" : "aterstalld",
          description: archive ? "Beställningen arkiverades" : "Beställningen återställdes från arkivet",
          performedBy: auth?.user?.id ?? null,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_orders"] }),
  });
}

export function useUpdateCustomerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      event,
    }: {
      id: string;
      patch: Record<string, unknown>;
      event?: { type: string; description?: string; by?: string | null };
    }) => {
      const { error } = await db.from("customer_orders").update(patch).eq("id", id);
      if (error) throw error;
      if (event) {
        await logOrderEvent({
          orderId: id,
          eventType: event.type,
          description: event.description,
          newValue: patch,
          performedBy: event.by ?? null,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["customer_order_events"] });
    },
  });
}

export function useUpdateOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      orderId,
      event,
    }: {
      id: string;
      patch: Record<string, unknown>;
      orderId?: string;
      event?: { type: string; description?: string };
    }) => {
      const { error } = await db.from("customer_order_lines").update(patch).eq("id", id);
      if (error) throw error;
      if (orderId && event) {
        await logOrderEvent({
          orderId,
          eventType: event.type,
          description: event.description,
          newValue: patch,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["customer_purchase_needs"] });
      qc.invalidateQueries({ queryKey: ["customer_reservations"] });
    },
  });
}

export function useAddOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      order,
      line,
    }: {
      order: CustomerOrder;
      line: NewOrderLineInput;
    }) => {
      let reservation_status = "ingen";
      let reserved_lot_id: string | null = null;
      let reserved_quantity = 0;
      if (line.product_id && !line.is_free_text && order.status !== "forfragan") {
        const outcome = await evaluateReservation({
          productId: line.product_id,
          storeId: order.store_id,
          wantedDate: order.wanted_date,
          quantity: Number(line.quantity_ordered || 0),
        });
        reservation_status = outcome.status;
        reserved_lot_id = outcome.lotId;
        reserved_quantity = outcome.status === "reserverad" ? Number(line.quantity_ordered || 0) : 0;
      }
      // Gällande pris låses på raden vid ordertillfället och räknas aldrig om.
      const eff = line.product_id
        ? (await fetchEffectiveCosts([line.product_id])).get(line.product_id)
        : undefined;
      const { error } = await db.from("customer_order_lines").insert({
        customer_order_id: order.id,
        product_id: line.product_id ?? null,
        free_text_name: line.free_text_name ?? null,
        is_free_text: !!line.is_free_text,
        quantity_ordered: line.quantity_ordered,
        unit: line.unit || "kg",
        estimated_price_per_unit: line.estimated_price_per_unit ?? null,
        note: line.note ?? null,
        reservation_status,
        reserved_lot_id,
        reserved_quantity,
        sort_order: (order.customer_order_lines?.length ?? 0) + 1,
        cost_at_order: eff?.value ?? null,
        cost_source_at_order: eff?.source ?? null,
      });
      if (error) throw error;
      await logOrderEvent({
        orderId: order.id,
        eventType: "rad_tillagd",
        description: line.free_text_name || "Rad tillagd",
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customer_orders"] }),
  });
}

/**
 * Tar bort en rad som ännu inte är packad. Packade rader får inte raderas
 * eftersom uttaget redan är bokfört i lagerboken – de stryks istället.
 */
export function useDeleteOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      line,
      orderId,
    }: {
      line: { id: string; pack_status: string; free_text_name?: string | null; products?: any };
      orderId: string;
    }) => {
      const name = line.products?.name || line.free_text_name || "Rad";
      if (line.pack_status === "packad") {
        const { error } = await db
          .from("customer_order_lines")
          .update({ pack_status: "struken", reserved_quantity: 0, reservation_status: "ingen" })
          .eq("id", line.id);
        if (error) throw error;
      } else {
        const { error } = await db.from("customer_order_lines").delete().eq("id", line.id);
        if (error) throw error;
      }
      await logOrderEvent({
        orderId,
        eventType: "rad_borttagen",
        description: `${name} borttagen`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["customer_purchase_needs"] });
      qc.invalidateQueries({ queryKey: ["customer_reservations"] });
    },
  });
}

/** Packar en rad på vägd vikt och bokför uttaget i lagerboken. */
export function usePackOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      order: CustomerOrder;
      line: CustomerOrderLine;
      packedQuantity: number;
      pricePerUnit: number | null;
      note?: string | null;
      performedBy?: string | null;
    }) => {
      await packLineLedger(params);

      // Läs raderna på nytt och sätt orderns packstatus
      const { data } = await db
        .from("customer_order_lines")
        .select("*")
        .eq("customer_order_id", params.order.id);
      const lines = (data || []) as CustomerOrderLine[];
      const packStatus = derivePackStatus(lines);
      const total = lines.reduce((s, l) => s + Number(l.line_total || 0), 0);

      const patch: Record<string, unknown> = {
        pack_status: packStatus,
        total_incl_vat: Math.round(total * 100) / 100,
      };
      if (packStatus === "packad") {
        patch.status = lines.some((l) => l.pack_status === "restnoterad")
          ? "delvis_utlamnad"
          : "packad";
        patch.packed_at = new Date().toISOString();
      } else if (params.order.status === "ny" || params.order.status === "bekraftad") {
        patch.status = params.order.status;
      }

      await db.from("customer_orders").update(patch).eq("id", params.order.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["stock_locations"] });
      qc.invalidateQueries({ queryKey: ["customer_reservations"] });
      qc.invalidateQueries({ queryKey: ["customer_order_events"] });
    },
  });
}

/** Ångrar packningen av en rad och återför varan till lagret. */
export function useUnpackOrderLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      order: CustomerOrder;
      line: CustomerOrderLine;
      performedBy?: string | null;
    }) => {
      await unpackLineLedger(params);

      const { data } = await db
        .from("customer_order_lines")
        .select("*")
        .eq("customer_order_id", params.order.id);
      const lines = (data || []) as CustomerOrderLine[];
      const packStatus = derivePackStatus(lines);
      const total = lines.reduce((s, l) => s + Number(l.line_total || 0), 0);

      const patch: Record<string, unknown> = {
        pack_status: packStatus,
        total_incl_vat: Math.round(total * 100) / 100,
      };
      if (packStatus !== "packad") {
        patch.packed_at = null;
        patch.handed_over_at = null;
        patch.status = packStatus === "pagaende" ? "bekraftad" : "bekraftad";
      }

      await db.from("customer_orders").update(patch).eq("id", params.order.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["stock_locations"] });
      qc.invalidateQueries({ queryKey: ["customer_reservations"] });
      qc.invalidateQueries({ queryKey: ["customer_order_events"] });
    },
  });
}



/** Avbryter en order. Packade rader motbokas, med eller utan svinn. */
export function useCancelCustomerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      order,
      reason,
      asWaste,
    }: {
      order: CustomerOrder;
      reason: string;
      asWaste?: boolean;
    }) => {
      for (const line of order.customer_order_lines || []) {
        if (line.pack_status === "packad" && Number(line.quantity_packed || 0) > 0) {
          await reverseLine({ order, line, reason, asWaste });
        }
      }
      await db
        .from("customer_order_lines")
        .update({ reserved_quantity: 0, reservation_status: "ingen" })
        .eq("customer_order_id", order.id);
      await db
        .from("customer_orders")
        .update({ status: "avbruten", cancelled_at: new Date().toISOString() })
        .eq("id", order.id);
      await logOrderEvent({
        orderId: order.id,
        eventType: "avbruten",
        description: asWaste ? `Kasserad: ${reason}` : `Avbruten: ${reason}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["stock_locations"] });
    },
  });
}

/* --------------------------------------------- sålt men inte köpt (inköpare) */

export interface PurchaseNeedRow {
  wanted_date: string;
  product_id: string | null;
  product_name: string;
  unit: string;
  perStore: { storeId: string; storeName: string; quantity: number }[];
  total: number;
}

export function usePurchaseNeeds(fromDate?: string) {
  const from = fromDate || new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["customer_purchase_needs", from],
    queryFn: async () => {
      const { data, error } = await db
        .from("customer_order_lines")
        .select(
          "id, product_id, quantity_ordered, unit, reservation_status, pack_status, products!customer_order_lines_product_id_fkey(name), customer_orders!inner(id, wanted_date, store_id, status, stores(name))",
        )
        .in("reservation_status", ["inkopsbehov"])
        .neq("pack_status", "struken")
        .gte("customer_orders.wanted_date", from);
      if (error) throw error;

      const rows = ((data || []) as any[]).filter(
        (r) => !["avbruten", "forfragan"].includes(r.customer_orders?.status),
      );

      const map = new Map<string, PurchaseNeedRow>();
      for (const r of rows) {
        const date = r.customer_orders.wanted_date;
        const key = `${date}|${r.product_id ?? r.id}`;
        const entry =
          map.get(key) ??
          ({
            wanted_date: date,
            product_id: r.product_id,
            product_name: r.products?.name || "Fritextrad",
            unit: r.unit || "kg",
            perStore: [],
            total: 0,
          } as PurchaseNeedRow);
        const storeName = r.customer_orders.stores?.name || "Butik";
        const existing = entry.perStore.find((s) => s.storeId === r.customer_orders.store_id);
        const qty = Number(r.quantity_ordered || 0);
        if (existing) existing.quantity += qty;
        else
          entry.perStore.push({
            storeId: r.customer_orders.store_id,
            storeName,
            quantity: qty,
          });
        entry.total += qty;
        map.set(key, entry);
      }

      return Array.from(map.values()).sort(
        (a, b) => a.wanted_date.localeCompare(b.wanted_date) || a.product_name.localeCompare(b.product_name),
      );
    },
  });
}

/**
 * Reserverad kvantitet per produkt. Dras inte från saldot — visas som egen
 * kolumn så att disponibelt (saldo minus reserverat) syns i lagervyerna.
 */
export function useReservedQuantities(storeId?: string | null) {
  return useQuery({
    queryKey: ["customer_reservations", storeId],
    queryFn: async () => {
      let q = db
        .from("customer_order_lines")
        .select(
          "product_id, reserved_quantity, reservation_status, pack_status, customer_orders!inner(store_id, status)",
        )
        .eq("reservation_status", "reserverad")
        .gt("reserved_quantity", 0);
      if (storeId) q = q.eq("customer_orders.store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      const map = new Map<string, number>();
      for (const r of (data || []) as any[]) {
        if (["avbruten"].includes(r.customer_orders?.status)) continue;
        if (!r.product_id) continue;
        map.set(r.product_id, (map.get(r.product_id) || 0) + Number(r.reserved_quantity || 0));
      }
      return map;
    },
  });
}

/** Dagens pris för en produkt i en butik (uppdateras vid packning). */
export async function fetchTodaysPrice(productId: string, storeId: string) {
  return todaysPrice(productId, storeId);
}

/* ----------------------------------------------------- orderflödet i flikarna */

/**
 * Markerar hela beställningen som packad (eller ångrar det).
 *
 * Enkel knapp för butiken: ordern flyttas till fliken Packade och taggen blir
 * "Packad". Radvis vägning påverkas inte — den kan göras före eller efter.
 */
export function useMarkCustomerOrderPacked() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ order, undo }: { order: CustomerOrder; undo?: boolean }) => {
      await db
        .from("customer_orders")
        .update(
          undo
            ? { pack_status: "opackad", packed_at: null, status: "bekraftad" }
            : { pack_status: "packad", packed_at: new Date().toISOString(), status: "packad" },
        )
        .eq("id", order.id);
      await logOrderEvent({
        orderId: order.id,
        eventType: undo ? "packning_angrad" : "order_packad",
        description: undo ? "Packning ångrad" : "Beställningen markerad som packad",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["customer_order_events"] });
    },
  });
}

/**

 * Markerar beställningen som hämtad/levererad.
 *
 * Är den redan betald (t.ex. webborder) arkiveras den direkt. Är den obetald
 * hamnar den i "Hämtade – ej betalda" tills betalningen registreras.
 */
export function useHandOverCustomerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ order, undo }: { order: CustomerOrder; undo?: boolean }) => {
      if (undo) {
        await db
          .from("customer_orders")
          .update({
            handed_over_at: null,
            archived_at: null,
            archived_by: null,
            status: order.pack_status === "packad" ? "packad" : "bekraftad",
          })
          .eq("id", order.id);
        await logOrderEvent({
          orderId: order.id,
          eventType: "utlamning_angrad",
          description: "Utlämning ångrad",
        });
        return;
      }
      const paid = !!order.paid_at || !!order.web_paid;
      const { data: auth } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      await db
        .from("customer_orders")
        .update({
          handed_over_at: now,
          status: order.order_type === "leverans" ? "levererad" : "avhamtad",
          ...(paid ? { archived_at: now, archived_by: auth?.user?.id ?? null } : {}),
        })
        .eq("id", order.id);
      await logOrderEvent({
        orderId: order.id,
        eventType: "utlamnad",
        description: paid
          ? "Utlämnad och betald — arkiverad"
          : "Utlämnad, betalning saknas",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["customer_order_events"] });
    },
  });
}

/**
 * Registrerar betalning. Är beställningen redan utlämnad flyttas den
 * automatiskt till Arkiverade.
 */
export function useMarkCustomerOrderPaid() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ order, undo }: { order: CustomerOrder; undo?: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      if (undo) {
        await db
          .from("customer_orders")
          .update({ paid_at: null, paid_by: null, archived_at: null, archived_by: null })
          .eq("id", order.id);
        await logOrderEvent({
          orderId: order.id,
          eventType: "betalning_angrad",
          description: "Betalning ångrad",
        });
        return;
      }
      const now = new Date().toISOString();
      const handedOver =
        !!order.handed_over_at || ["levererad", "avhamtad"].includes(order.status);
      await db
        .from("customer_orders")
        .update({
          paid_at: now,
          paid_by: auth?.user?.id ?? null,
          ...(handedOver ? { archived_at: now, archived_by: auth?.user?.id ?? null } : {}),
        })
        .eq("id", order.id);
      await logOrderEvent({
        orderId: order.id,
        eventType: "betald",
        description: handedOver ? "Betald — arkiverad" : "Betald",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["customer_order_events"] });
    },
  });
}

/**
 * Ta bort order: ordern raderas aldrig, den flyttas till fliken Borttagna med
 * en anledning så historik och statistik behålls. Packade rader motbokas.
 */
export function useSoftDeleteCustomerOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      order,
      reason,
      restore,
    }: {
      order: CustomerOrder;
      reason?: string;
      restore?: boolean;
    }) => {
      if (restore) {
        await db
          .from("customer_orders")
          .update({
            cancelled_at: null,
            cancelled_reason: null,
            cancelled_was_packed: null,
            deleted_reason: null,
            status: order.pack_status === "packad" ? "packad" : "bekraftad",
          })
          .eq("id", order.id);
        await logOrderEvent({
          orderId: order.id,
          eventType: "aterstalld",
          description: "Beställningen återställdes från Borttagna",
        });
        return;
      }
      const wasPacked = (order.customer_order_lines || []).some(
        (l) => l.pack_status === "packad" && Number(l.quantity_packed || 0) > 0,
      );
      for (const line of order.customer_order_lines || []) {
        if (line.pack_status === "packad" && Number(line.quantity_packed || 0) > 0) {
          await reverseLine({ order, line, reason: reason || "Borttagen order" });
        }
      }
      await db
        .from("customer_order_lines")
        .update({ reserved_quantity: 0, reservation_status: "ingen" })
        .eq("customer_order_id", order.id);
      await db
        .from("customer_orders")
        .update({
          status: "avbruten",
          cancelled_at: new Date().toISOString(),
          cancelled_reason: reason ?? null,
          cancelled_was_packed: wasPacked,
          deleted_reason: reason ?? null,
        })
        .eq("id", order.id);
      await logOrderEvent({
        orderId: order.id,
        eventType: "borttagen",
        description: `Borttagen: ${reason || "Ingen anledning angiven"}`,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_orders"] });
      qc.invalidateQueries({ queryKey: ["stock_movements"] });
      qc.invalidateQueries({ queryKey: ["customer_order_events"] });
    },
  });
}

/**
 * Antal beställningar per flik. Hämtas som en lätt fråga så flikarna kan visa
 * siffror utan att hela listan laddas för varje flik.
 */
export function useCustomerOrderTabCounts(storeId?: string | null) {
  return useQuery({
    queryKey: ["customer_orders", "tab-counts", storeId],
    queryFn: async () => {
      let q = db
        .from("customer_orders")
        .select(
          "id, status, pack_status, archived_at, cancelled_at, handed_over_at, paid_at, web_paid, wanted_date, needs_approval, approved_at, category, customer_order_lines(note)",
        );
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q;
      if (error) throw error;
      const counts: Record<string, number> = {
        godkannande: 0,
        pagaende: 0,
        packade: 0,
        event: 0,
        obetalda: 0,
        arkiverade: 0,
        borttagna: 0,
      };

      for (const row of (data || []) as any[]) counts[orderTab(row)] += 1;
      return counts;
    },
  });
}
