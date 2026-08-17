import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/hooks/useActivityLog";
import { recordMovements, currentStaffId, type StockMovementInput } from "@/lib/stockLedger";
import { GROSSIST_FLYTANDE_ID } from "@/lib/locations";


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
      /** Leverantörens fakturavaluta. Priserna nedan anges i den här valutan. */
      source_currency?: string;
      /** Bolagets bokföringsvaluta (CHF för Componia AG, annars SEK). */
      book_currency?: string;
      /** Kurs källvaluta → bokföringsvaluta. 1 när valutorna är samma. */
      fx_rate?: number;
      /** Var kursen kom ifrån, t.ex. "Frankfurter (ECB)" eller "manuell". */
      fx_source?: string;
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
      // Löpnumret delas ut av databasen (number_series) — aldrig räknat i klienten,
      // där två samtidiga inleveranser kunde få samma nummer.
      const { data: numData, error: numErr } = await supabase.rpc("next_delivery_number", {});
      if (numErr) throw numErr;
      const deliveryNumber = String(numData);

      // Valuta: priserna kommer i leverantörens valuta. Bokfört värde räknas om
      // med kursen vid inköpstillfället och kursen sparas historiskt på
      // inleverans, parti och rörelse — gamla inköp ändras aldrig retroaktivt.
      const sourceCurrency = (params.source_currency || "SEK").toUpperCase();
      const bookCurrency = (params.book_currency || sourceCurrency).toUpperCase();
      const crossCurrency = sourceCurrency !== bookCurrency;
      const fxRate = crossCurrency ? Number(params.fx_rate) || 0 : 1;
      if (crossCurrency && fxRate <= 0) {
        throw new Error(`Växelkurs ${sourceCurrency}→${bookCurrency} saknas för inleveransen.`);
      }
      const toBook = (amount: number) => Number((amount * fxRate).toFixed(4));

      const totalWeight = params.lines.reduce((s, l) => s + l.quantity, 0);
      const totalCostSource = params.lines.reduce((s, l) => s + l.quantity * l.unit_cost, 0);
      const totalCost = toBook(totalCostSource);

      const { data: del, error } = await supabase.from("incoming_deliveries").insert({
        delivery_number: deliveryNumber,
        supplier_id: params.supplier_id,
        received_date: params.received_date,
        received_by: params.received_by,
        notes: params.notes,
        total_weight: totalWeight,
        total_cost: totalCost,
        total_cost_source: crossCurrency ? Number(totalCostSource.toFixed(2)) : null,
        source_currency: crossCurrency ? sourceCurrency : null,
        fx_rate_to_entity: crossCurrency ? fxRate : null,
        fx_rate_date: crossCurrency ? params.received_date : null,
        fx_source: crossCurrency ? params.fx_source || "manuell" : null,
      }).select().single();
      if (error) throw error;

      // Mållagerplats för inleveransen: Grossist Flytande, uppslaget på id
      // eftersom sex lagerplatser bär samma namn.
      const targetLocationId: string | null = GROSSIST_FLYTANDE_ID;




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
            unit_cost: toBook(l.unit_cost),
            unit_cost_source: crossCurrency ? l.unit_cost : null,
            source_currency: crossCurrency ? sourceCurrency : null,
            fx_rate: crossCurrency ? fxRate : null,
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
          unit_cost: toBook(l.unit_cost),
          unit_cost_source: crossCurrency ? l.unit_cost : null,
          source_currency: crossCurrency ? sourceCurrency : null,
          fx_rate: crossCurrency ? fxRate : null,
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
            unitCost: toBook(l.unit_cost),
            unitCostSource: crossCurrency ? l.unit_cost : null,
            sourceCurrency: crossCurrency ? sourceCurrency : null,
            fxRate: crossCurrency ? fxRate : null,
            referenceType: "incoming_delivery",
            referenceId: del.id,
            note: `Inleverans ${deliveryNumber}${crossCurrency ? ` · ${l.unit_cost} ${sourceCurrency}/enhet, kurs ${fxRate}` : ""}`,
          });
        }


        // products.stock härleds nu av triggern sync_product_stock_total.
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
