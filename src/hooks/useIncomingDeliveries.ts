import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import { recordMovements, currentStaffId, type StockMovementInput } from "@/lib/stockLedger";


export function useIncomingDeliveries() {
  return useQuery({
    queryKey: ["incoming_deliveries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("incoming_deliveries")
        .select("*, suppliers(name), incoming_delivery_lines(*, products(name))")
        .order("received_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateIncomingDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      supplier_id: string;
      received_date: string;
      received_by: string;
      notes?: string;
      lines: {
        product_id: string;
        quantity: number;
        unit_cost: number;
        batch_number?: string;
        best_before?: string;
        redskapskategori?: string | null;
        upptinad?: boolean;
        faktiskt_fangstomrade?: string | null;
      }[];
    }) => {
      const { count } = await supabase.from("incoming_deliveries").select("*", { count: "exact", head: true });
      const num = (count || 0) + 1;
      const deliveryNumber = `IL-2026-${String(num).padStart(4, "0")}`;
      const totalWeight = params.lines.reduce((s, l) => s + l.quantity, 0);
      const totalCost = params.lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);

      const { data: del, error } = await supabase.from("incoming_deliveries").insert({
        delivery_number: deliveryNumber,
        supplier_id: params.supplier_id,
        received_date: params.received_date,
        received_by: params.received_by,
        notes: params.notes,
        total_weight: totalWeight,
        total_cost: totalCost,
      }).select().single();
      if (error) throw error;

      // Mållagerplats för inleveransen: Grossist Flytande (fallback: ingen lagerbokning)
      const { data: gfLocs } = await supabase
        .from("storage_locations")
        .select("id")
        .ilike("name", "Grossist Flytande")
        .limit(1);
      const targetLocationId: string | null = gfLocs?.[0]?.id ?? null;

      // Ett parti per inleveransrad — grunden för spårbarhet
      const staffId = await currentStaffId();
      const movements: StockMovementInput[] = [];

      for (let i = 0; i < params.lines.length; i++) {
        const l = params.lines[i];
        const { data: prod } = await supabase
          .from("products")
          .select("latin_name, fao_code, name, traceability_exempt")
          .eq("id", l.product_id)
          .maybeSingle();

        const { data: lot, error: lotErr } = await supabase
          .from("lots")
          .insert({
            lot_number: `${deliveryNumber}-${String(i + 1).padStart(2, "0")}`,
            supplier_lot_id: l.batch_number || null,
            product_id: l.product_id,
            supplier_id: params.supplier_id,
            species_fao_code: (prod as any)?.fao_code ?? null,
            latin_name: (prod as any)?.latin_name ?? null,
            commercial_name: (prod as any)?.name ?? null,
            catch_area: l.faktiskt_fangstomrade ?? null,
            fishing_gear: l.redskapskategori ?? null,
            is_thawed: l.upptinad ?? false,
            best_before: l.best_before || null,
            quantity_kg: l.quantity,
            unit_cost: l.unit_cost,
            traceability_required: !(prod as any)?.traceability_exempt,
            created_by: staffId,
          })
          .select("id")
          .single();
        if (lotErr) throw lotErr;

        const { error: lineErr } = await supabase.from("incoming_delivery_lines").insert({
          delivery_id: del.id,
          product_id: l.product_id,
          quantity: l.quantity,
          unit_cost: l.unit_cost,
          batch_number: l.batch_number,
          best_before: l.best_before,
          redskapskategori: l.redskapskategori ?? null,
          upptinad: l.upptinad ?? false,
          faktiskt_fangstomrade: l.faktiskt_fangstomrade ?? null,
          lot_id: lot!.id,
          location_id: targetLocationId,
        });
        if (lineErr) throw lineErr;

        if (targetLocationId && l.quantity > 0) {
          movements.push({
            productId: l.product_id,
            locationId: targetLocationId,
            lotId: lot!.id,
            quantityKg: l.quantity,
            movementType: "inleverans",
            unitCost: l.unit_cost,
            referenceType: "incoming_delivery",
            referenceId: del.id,
            note: `Inleverans ${deliveryNumber}`,
          });
        }
      }

      if (movements.length) await recordMovements(movements);


      await logActivity({
        action_type: "create",
        description: `Inleverans registrerad: ${deliveryNumber}`,
        entity_type: "incoming_delivery",
        entity_id: del.id,
      });
      return del;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["incoming_deliveries"] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
