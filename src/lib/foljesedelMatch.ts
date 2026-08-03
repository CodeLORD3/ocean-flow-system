/**
 * Matchning av följesedelsrader mot leverantörer och produkter (AP-9).
 *
 * Återanvänder produktimportens leverantörsnormalisering och asciiFold-nycklarna
 * i stället för en egen includes-sökning. Inga nya nyckelbegrepp införs här.
 */
import { compareKey, skuKey, speciesKey } from "@/lib/asciiFold";
import { buildSupplierIndex, lookupSupplier, supplierAliasKeys } from "@/lib/productImport";

export { buildSupplierIndex, lookupSupplier, supplierAliasKeys };

export type MatchMethod =
  | "supplier_article"
  | "fao_code"
  | "latin_name"
  | "latin_alias"
  | "latin_fuzzy"
  | "species_group"
  | "name_key"
  | "none";

export interface MatchProduct {
  id: string;
  name: string;
  sku: string;
  unit?: string | null;
  fao_code?: string | null;
  latin_name?: string | null;
  species_group?: string | null;
  shelf_life_days?: number | null;
  weight_per_piece?: number | null;
  nominal_weight_kg?: number | null;
}

export interface MatchInput {
  product_name?: string | null;
  supplier_article_no?: string | null;
  species_fao_code?: string | null;
  latin_name?: string | null;
}

export interface MatchResult {
  productId: string | null;
  method: MatchMethod;
  /** Träffar via tolerans ska bekräftas manuellt, inte sättas tyst. */
  needsConfirmation: boolean;
}

/** Normaliserad nyckel för latinska namn: gemener, enkla mellanslag, ASCII. */
export const latinKey = (v: unknown): string =>
  speciesKey(String(v ?? "")).replace(/\s+/g, " ").trim();

/** Redigeringsavstånd (Levenshtein) med tak — används för stavfelstolerans. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = row;
  }
  return prev[b.length];
}

export interface LatinAlias {
  alias: string;
  latin_name: string;
}

/** Slår upp korrekt latinskt namn ur aliaslistan (bara felstavningar finns där). */
export function resolveLatinAlias(raw: string | null | undefined, aliases: LatinAlias[]): string | null {
  const key = latinKey(raw);
  if (!key) return null;
  const hit = aliases.find((a) => latinKey(a.alias) === key);
  return hit ? hit.latin_name : null;
}

export interface ArticleMapEntry {
  supplier_id: string;
  supplier_article_no: string;
  product_id: string;
}

export interface MatchContext {
  products: MatchProduct[];
  aliases?: LatinAlias[];
  articleMap?: ArticleMapEntry[];
  supplierId?: string | null;
}

/**
 * Matchar en rad mot en produkt i ordningen:
 * sparad artikelkoppling → FAO-kod → latinskt namn (exakt, alias, tolerans)
 * → species_group → namnnyckel.
 */
export function matchProduct(line: MatchInput, ctx: MatchContext): MatchResult {
  const { products } = ctx;
  const aliases = ctx.aliases ?? [];
  const articleMap = ctx.articleMap ?? [];

  // 1. Leverantörens artikelnummer mot sparad koppling
  const articleNo = skuKey(String(line.supplier_article_no ?? ""));
  if (articleNo && ctx.supplierId) {
    const hit = articleMap.find(
      (m) => m.supplier_id === ctx.supplierId && skuKey(m.supplier_article_no) === articleNo,
    );
    if (hit && products.some((p) => p.id === hit.product_id)) {
      return { productId: hit.product_id, method: "supplier_article", needsConfirmation: false };
    }
  }

  // 2. FAO-kod
  const fao = skuKey(String(line.species_fao_code ?? ""));
  if (fao) {
    const faoHits = products.filter((p) => skuKey(String(p.fao_code ?? "")) === fao);
    if (faoHits.length === 1) {
      return { productId: faoHits[0].id, method: "fao_code", needsConfirmation: false };
    }
  }

  // 3. Latinskt namn — exakt, sedan alias, sedan tolerans
  const latin = latinKey(line.latin_name);
  if (latin) {
    const exact = products.filter((p) => latinKey(p.latin_name) === latin);
    if (exact.length === 1) {
      return { productId: exact[0].id, method: "latin_name", needsConfirmation: false };
    }

    const corrected = latinKey(resolveLatinAlias(line.latin_name, aliases));
    if (corrected) {
      const aliasHits = products.filter((p) => latinKey(p.latin_name) === corrected);
      if (aliasHits.length === 1) {
        return { productId: aliasHits[0].id, method: "latin_alias", needsConfirmation: false };
      }
    }

    const near = products
      .map((p) => ({ p, d: editDistance(latin, latinKey(p.latin_name)) }))
      .filter((x) => latinKey(x.p.latin_name) && x.d <= 2)
      .sort((a, b) => a.d - b.d);
    if (near.length && (near.length === 1 || near[0].d < near[1].d)) {
      return { productId: near[0].p.id, method: "latin_fuzzy", needsConfirmation: true };
    }
  }

  // 4. Artgrupp
  const name = String(line.product_name ?? "");
  const nameKey = compareKey(name);
  if (nameKey) {
    const speciesHits = products.filter((p) => {
      const grp = speciesKey(p.species_group);
      return grp && compareKey(grp) && nameKey.includes(compareKey(grp));
    });
    if (speciesHits.length === 1) {
      return { productId: speciesHits[0].id, method: "species_group", needsConfirmation: false };
    }

    // 5. Namnnyckel
    const nameHits = products.filter((p) => compareKey(p.name) === nameKey);
    if (nameHits.length === 1) {
      return { productId: nameHits[0].id, method: "name_key", needsConfirmation: false };
    }
  }

  return { productId: null, method: "none", needsConfirmation: true };
}
