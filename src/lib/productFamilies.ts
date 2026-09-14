/**
 * Produktfamiljer: samma vara i olika förpackningar (löpvikt, hink, burk) hålls
 * ihop av ett familj-id på produkten. Innehållet per enhet kommer från
 * produktens nettovikt per styck (weight_per_piece) — en styckvara utan
 * nettovikt kan inte räknas om, och visas därför som okänd.
 *
 * Ingenting här skriver mot lagret. Alla beräkningar är prognoser.
 */

import { isPieceUnit } from "@/lib/units";

export interface FamilyProduct {
  id: string;
  name: string;
  sku?: string | null;
  unit?: string | null;
  category?: string | null;
  image_url?: string | null;
  weight_per_piece?: number | null;
  family_id?: string | null;
}

/**
 * Innehåll per lagerenhet i basenheten (kg).
 * Viktvara: 1 kg per kg. Styckvara: nettovikt per styck.
 * Saknas nettovikten på en styckvara returneras null.
 */
export function contentPerUnitKg(product?: FamilyProduct | null): number | null {
  if (!product) return null;
  if (!isPieceUnit(product.unit)) return 1;
  const w = Number(product.weight_per_piece || 0);
  return w > 0 ? w : null;
}

/** Läsbar förpackningsetikett, t.ex. "4 kg" eller "200 g". */
export function packLabel(contentKg: number | null): string {
  if (!contentKg || contentKg <= 0) return "okänd storlek";
  if (contentKg < 1) return `${Math.round(contentKg * 1000)} g`;
  return `${contentKg.toLocaleString("sv-SE", { maximumFractionDigits: 3 })} kg`;
}

export interface FamilyVariant {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  isPiece: boolean;
  image_url: string | null;
  /** Innehåll per enhet i kg, null när nettovikt saknas på en styckvara. */
  contentKg: number | null;
  /** Lagersaldo i produktens egen enhet (antal eller kilo). */
  qty: number;
  /** Lagersaldo omräknat till kg, null när omräkning inte är möjlig. */
  qtyKg: number | null;
  /** Kvar att packa på kundbeställningar, i produktens egen enhet. */
  ordered: number;
}

export interface FamilyForecast {
  targetProductId: string;
  targetName: string;
  /** Hur många enheter av målprodukten en enhet av källan räcker till. */
  perUnit: number;
  /** Hur många enheter hela lagersaldot räcker till. */
  fromStock: number;
  label: string;
}

export interface FamilyShortfall {
  variant: FamilyVariant;
  needed: number;
  have: number;
  shortfall: number;
  /** Den större förpackningen som kan täcka mellanskillnaden. */
  sourceProductId: string;
  sourceName: string;
  /** Hur många enheter källan räcker till. */
  covers: number;
  label: string;
}

export interface FamilyGroup {
  familyId: string;
  name: string;
  baseUnit: string;
  variants: FamilyVariant[];
  /** Totalt i basenheten över alla varianter som kan räknas om. */
  totalKg: number;
  /** Varianter som saknar nettovikt och därför inte kunde räknas in. */
  unknownCount: number;
  category: string;
  shortfalls: FamilyShortfall[];
}

const nf = (n: number, d = 1) => n.toLocaleString("sv-SE", { maximumFractionDigits: d });

/**
 * Vad en enhet av källvarianten skulle räcka till i familjens andra
 * förpackningar. Bara en beräkning — inget lager ändras.
 */
export function forecastFor(source: FamilyVariant, family: FamilyGroup): FamilyForecast[] {
  const src = source.contentKg;
  if (!src || src <= 0) return [];
  return family.variants
    .filter((v) => v.productId !== source.productId && v.contentKg && v.contentKg > 0 && v.contentKg < src)
    .map((v) => {
      const perUnit = Math.floor(src / (v.contentKg as number));
      const fromStock = Math.floor((source.qtyKg ?? 0) / (v.contentKg as number));
      return {
        targetProductId: v.productId,
        targetName: v.name,
        perUnit,
        fromStock,
        label: `1 × ${packLabel(src)} ≈ ${perUnit} st ${packLabel(v.contentKg)}`,
      };
    })
    .filter((f) => f.perUnit >= 1)
    .sort((a, b) => b.perUnit - a.perUnit);
}

/**
 * Bygger familjegrupper av produkter, lagersaldon och beställda mängder.
 */
export function buildFamilyGroups({
  products,
  families,
  stockByProduct,
  orderedByProduct,
}: {
  products: FamilyProduct[];
  families: { id: string; name: string; base_unit?: string | null }[];
  stockByProduct: Map<string, number>;
  orderedByProduct?: Map<string, number>;
}): FamilyGroup[] {
  const familyById = new Map(families.map((f) => [f.id, f]));
  const byFamily = new Map<string, FamilyProduct[]>();
  for (const p of products) {
    if (!p.family_id || !familyById.has(p.family_id)) continue;
    const list = byFamily.get(p.family_id) || [];
    list.push(p);
    byFamily.set(p.family_id, list);
  }

  const groups: FamilyGroup[] = [];
  for (const [familyId, list] of byFamily) {
    const fam = familyById.get(familyId)!;
    const variants: FamilyVariant[] = list
      .map((p) => {
        const contentKg = contentPerUnitKg(p);
        const qty = stockByProduct.get(p.id) || 0;
        return {
          productId: p.id,
          name: p.name,
          sku: p.sku || "",
          unit: (p.unit || "kg").toLowerCase(),
          isPiece: isPieceUnit(p.unit),
          image_url: p.image_url ?? null,
          contentKg,
          qty,
          qtyKg: contentKg ? Math.round(qty * contentKg * 1000) / 1000 : null,
          ordered: orderedByProduct?.get(p.id) || 0,
        };
      })
      .sort((a, b) => (b.contentKg ?? 0) - (a.contentKg ?? 0) || a.name.localeCompare(b.name, "sv"));

    const group: FamilyGroup = {
      familyId,
      name: fam.name,
      baseUnit: fam.base_unit || "kg",
      variants,
      totalKg: Math.round(variants.reduce((s, v) => s + (v.qtyKg ?? 0), 0) * 1000) / 1000,
      unknownCount: variants.filter((v) => v.contentKg === null).length,
      category: list.find((p) => p.category)?.category || "Övrigt",
      shortfalls: [],
    };
    group.shortfalls = shortfallsFor(group);
    groups.push(group);
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

/**
 * Varianter där lagret inte räcker till det som är beställt, men där en större
 * förpackning i familjen kan täcka mellanskillnaden.
 */
export function shortfallsFor(family: FamilyGroup): FamilyShortfall[] {
  const out: FamilyShortfall[] = [];
  for (const v of family.variants) {
    if (v.ordered <= 0.005) continue;
    const shortfall = v.ordered - v.qty;
    if (shortfall <= 0.005 || !v.contentKg) continue;
    const donors = family.variants
      .filter(
        (d) =>
          d.productId !== v.productId &&
          d.qty > 0 &&
          d.contentKg &&
          (d.contentKg as number) >= (v.contentKg as number),
      )
      // Störst förpackning först — en hink är det handlaren helst bryter upp.
      .sort((a, b) => (b.contentKg ?? 0) - (a.contentKg ?? 0) || (b.qtyKg ?? 0) - (a.qtyKg ?? 0));
    const donor = donors[0];
    if (!donor) continue;
    const covers = Math.floor((donor.qtyKg ?? 0) / (v.contentKg as number));
    if (covers < 1) continue;
    out.push({
      variant: v,
      needed: v.ordered,
      have: v.qty,
      shortfall,
      sourceProductId: donor.productId,
      sourceName: donor.name,
      covers,
      label: `Behöver ${nf(v.ordered)} ${v.unit}, har ${nf(v.qty)} — ${donor.name} i lager räcker till ${covers} till`,
    });
  }
  return out;
}
