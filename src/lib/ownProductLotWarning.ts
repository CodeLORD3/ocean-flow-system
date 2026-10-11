import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/**
 * Varning (inte spärr) när en egen produkt plockas utan parti eller från något
 * av de gamla samlingspartierna PROD-20260915-nnn. Gäller utgående rörelser
 * för butiksorder, kundorder och överföringsorder.
 */
export const PICK_MOVEMENT_TYPES = ["overforing_ut", "kundorder", "forsaljning"] as const;
const LEGACY_PROD_LOT = /^PROD-20260915-\d+$/;

export type LotProblem = "utan_parti" | "gammalt_prod_parti" | null;

/** Avgör om ett plock av en egen produkt saknar giltigt parti. */
export function ownProductLotProblem(params: {
  isProductionItem: boolean;
  movementType: string;
  lotNumber: string | null;
}): LotProblem {
  if (!params.isProductionItem) return null;
  if (!(PICK_MOVEMENT_TYPES as readonly string[]).includes(params.movementType)) return null;
  if (!params.lotNumber) return "utan_parti";
  if (LEGACY_PROD_LOT.test(params.lotNumber)) return "gammalt_prod_parti";
  return null;
}

/** Kontrollerar sparade rörelser och visar en varning. Kastar aldrig. */
export async function warnOwnProductLots(rows: { product_id: string; lot_id: string | null; movement_type: string }[]) {
  try {
    const picks = rows.filter((r) => (PICK_MOVEMENT_TYPES as readonly string[]).includes(r.movement_type));
    if (!picks.length) return;
    const productIds = [...new Set(picks.map((r) => r.product_id))];
    const { data: prods } = await supabase.from("products").select("id, name, is_production_item").in("id", productIds);
    const own = new Map((prods ?? []).filter((p: any) => p.is_production_item).map((p: any) => [p.id, p.name as string]));
    if (!own.size) return;
    const lotIds = [...new Set(picks.map((r) => r.lot_id).filter(Boolean))] as string[];
    const lotNo = new Map<string, string>();
    if (lotIds.length) {
      const { data: lots } = await supabase.from("lots").select("id, lot_number").in("id", lotIds);
      (lots ?? []).forEach((l: any) => lotNo.set(l.id, l.lot_number));
    }
    const msgs = new Set<string>();
    for (const r of picks) {
      const p = ownProductLotProblem({
        isProductionItem: own.has(r.product_id),
        movementType: r.movement_type,
        lotNumber: r.lot_id ? lotNo.get(r.lot_id) ?? null : null,
      });
      if (p) msgs.add(`${own.get(r.product_id)}: ${p === "utan_parti" ? "plockad utan parti" : `från gammalt parti ${lotNo.get(r.lot_id!)}`}`);
    }
    if (msgs.size) {
      toast.warning("Egen produkt utan giltigt parti", {
        description: `${[...msgs].join(". ")}. Plocket är sparat, men spårbarheten bryts. Registrera tillverkningen och välj det nya partiet.`,
        duration: 15000,
      });
    }
  } catch {
    // Varningen får aldrig stoppa plocket.
  }
}
