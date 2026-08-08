import { supabase } from "@/integrations/supabase/client";
import { recordMovements, currentStaffId } from "@/lib/stockLedger";
import { assertActiveLocation } from "@/lib/locations";

/**
 * Svinn kräver alltid orsak och en rapport. Databasen vägrar bokföra en
 * svinnrörelse utan koppling till en svinnrapport.
 */

export type WasteReason =
  | "kassation"
  | "saknas"
  | "skadad"
  | "temperaturavvikelse"
  | "svinn_produktion"
  | "annat";

export const WASTE_REASON_LABEL: Record<WasteReason, string> = {
  kassation: "Kassation",
  saknas: "Saknas vid inleverans",
  skadad: "Skadad vara",
  temperaturavvikelse: "Temperaturavvikelse",
  svinn_produktion: "Svinn i produktion",
  annat: "Annat (se kommentar)",
};

export interface WasteLineInput {
  productId: string;
  lotId?: string | null;
  /** Svinnmängd som positivt tal. Rörelsen bokförs alltid som minus. */
  quantityKg: number;
  unitCost?: number | null;
  comment?: string | null;
}

/** Skapar en svinnrapport och bokför svinnet på angiven lagerplats. */
export async function createWasteReport(params: {
  locationId: string;
  reason: WasteReason | string;
  comment?: string | null;
  transferOrderId?: string | null;
  lines: WasteLineInput[];
}) {
  await assertActiveLocation(params.locationId);

  // Anropare skickar svinnet som positiv mängd; tecknet sätts här så att en
  // svinnrapport aldrig kan råka öka saldot.
  const lines = params.lines
    .map((l) => ({ ...l, quantityKg: Math.abs(Number(l.quantityKg) || 0) }))
    .filter((l) => l.productId && l.quantityKg > 0);
  if (!lines.length) throw new Error("Svinnrapporten saknar rader med kvantitet.");
  if (!params.reason) throw new Error("Svinn kräver orsak.");

  const staffId = await currentStaffId();
  const { data: report, error } = await supabase
    .from("waste_reports" as any)
    .insert({
      location_id: params.locationId,
      reason: params.reason,
      comment: params.comment ?? null,
      transfer_order_id: params.transferOrderId ?? null,
      reported_by: staffId,
    } as any)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const reportId = (report as any).id as string;

  const { error: lineError } = await supabase.from("waste_report_lines" as any).insert(
    lines.map((l) => ({
      waste_report_id: reportId,
      product_id: l.productId,
      lot_id: l.lotId ?? null,
      quantity_kg: -l.quantityKg,
      unit_cost: l.unitCost ?? null,
      comment: l.comment ?? null,
    })) as any,
  );
  if (lineError) throw new Error(lineError.message);

  await recordMovements(
    lines.map((l) => ({
      productId: l.productId,
      locationId: params.locationId,
      quantityKg: -l.quantityKg,
      movementType: "svinn" as const,
      lotId: l.lotId ?? null,
      unitCost: l.unitCost ?? null,
      referenceType: "waste_report",
      referenceId: reportId,
      note: params.comment ?? null,
    })),
  );

  return report as any;
}
