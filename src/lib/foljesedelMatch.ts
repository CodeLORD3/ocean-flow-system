/**
 * Matchning av följesedelsrader mot leverantörer och produkter (AP-9).
 *
 * Återanvänder produktimportens leverantörsnormalisering och asciiFold-nycklarna
 * i stället för en egen includes-sökning. Inga nya nyckelbegrepp införs här.
 *
 * Spärren: produkter med purchasable = false (grundprodukten för arter som har
 * sorteringsregister) föreslås aldrig och matchas aldrig. Bara storleks-
 * varianterna är valbara.
 */
import { compareKey, skuKey, speciesKey } from "@/lib/asciiFold";
import { buildSupplierIndex, lookupSupplier, supplierAliasKeys } from "@/lib/productImport";
import { gradeFromCountRange, gradesForSpecies, parseSizeGradeNo, type SizeGrade } from "@/lib/sizeGrades";

export { buildSupplierIndex, lookupSupplier, supplierAliasKeys };

export type MatchMethod =
  | "supplier_article"
  | "size_grade"
  | "fao_code"
  | "latin_name"
  | "latin_alias"
  | "latin_fuzzy"
  | "species_group"
  | "name_key"
  | "suggestion"
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
  /** false = spärrad grundprodukt, får aldrig matchas eller föreslås. */
  purchasable?: boolean | null;
  active?: boolean | null;
  size_grade_id?: string | null;
}

export interface MatchInput {
  product_name?: string | null;
  supplier_article_no?: string | null;
  species_fao_code?: string | null;
  latin_name?: string | null;
  presentation?: string | null;
  size_grade?: number | string | null;
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
  /** Sorteringsregistret — styr storleksmatchning och spärren. */
  grades?: SizeGrade[];
}

/** Bara inköpsbara, aktiva produkter är kandidater. */
function candidates(products: MatchProduct[]): MatchProduct[] {
  return products.filter((p) => p.purchasable !== false && p.active !== false);
}

/* ------------------------------------------------------------------ */
/* Namnlikhet                                                          */
/* ------------------------------------------------------------------ */

const STOP_WORDS = new Set(["med", "m", "utan", "u", "av", "och", "fisk", "farsk", "fersk", "frusen", "fryst"]);

function tokens(v: unknown): string[] {
  return speciesKey(v)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** 0–1: ordvis likhet, tålig mot stavfel och ordföljd. */
export function nameSimilarity(a: unknown, b: unknown): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return 0;
  let hits = 0;
  for (const t of ta) {
    const best = tb.some((u) => {
      if (u === t) return true;
      if (u.startsWith(t) || t.startsWith(u)) return true;
      const limit = Math.max(1, Math.floor(Math.max(t.length, u.length) / 4));
      return editDistance(t, u) <= limit;
    });
    if (best) hits++;
  }
  const recall = hits / ta.length;
  const precision = hits / tb.length;
  return (2 * recall * precision) / Math.max(0.0001, recall + precision);
}

/** Presentationsform ur fritext: hel, rensad, filé, skalad. */
export function detectPresentation(v: unknown): string | null {
  const s = speciesKey(v);
  if (/\bhel\b|helfisk/.test(s)) return "hel";
  if (/rensad|urtagen|gutted/.test(s)) return "rensad";
  if (/file|filé|fillet/.test(s)) return "file";
  if (/skalad|peeled|tjart|stjart/.test(s)) return "skalad";
  if (/kokt/.test(s)) return "kokt";
  return null;
}

/* ------------------------------------------------------------------ */
/* Storlekssortering                                                   */
/* ------------------------------------------------------------------ */

/** Sorteringsklassen på raden: uttalad siffra, annars antal per kg. */
export function lineSizeGrade(
  line: MatchInput,
  grades: SizeGrade[],
  species?: unknown,
): number | null {
  const explicit = line.size_grade != null ? Number(line.size_grade) : null;
  if (explicit && Number.isInteger(explicit) && explicit >= 1 && explicit <= 9) return explicit;
  const parsed = parseSizeGradeNo(line.product_name);
  if (parsed) return parsed;
  if (species) {
    const hit = gradeFromCountRange(line.product_name, gradesForSpecies(grades, species));
    if (hit) return hit.grade_no;
  }
  return null;
}

function gradeNoOf(product: MatchProduct, grades: SizeGrade[]): number | null {
  if (!product.size_grade_id) return null;
  const g = grades.find((x) => x.id === product.size_grade_id);
  return g ? g.grade_no : null;
}

/** Träffar radens art produkten? Latin och FAO väger tyngst. */
function speciesMatch(line: MatchInput, p: MatchProduct, aliases: LatinAlias[]): number {
  const fao = skuKey(String(line.species_fao_code ?? ""));
  if (fao && skuKey(String(p.fao_code ?? "")) === fao) return 1;

  const latin = latinKey(line.latin_name);
  if (latin) {
    const pl = latinKey(p.latin_name);
    if (pl && pl === latin) return 1;
    const corrected = latinKey(resolveLatinAlias(line.latin_name, aliases));
    if (corrected && pl === corrected) return 0.95;
    if (pl && editDistance(latin, pl) <= 2) return 0.8;
  }

  const grp = speciesKey(p.species_group);
  if (grp) {
    const name = speciesKey(line.product_name);
    if (name.includes(grp)) return 0.7;
    if (nameSimilarity(line.product_name, grp) > 0.6) return 0.6;
  }
  return 0;
}

/* ------------------------------------------------------------------ */
/* Rankade förslag                                                     */
/* ------------------------------------------------------------------ */

export interface Suggestion {
  product: MatchProduct;
  score: number;
  reasons: string[];
}

/**
 * Rankar de mest sannolika produkterna för en följesedelsrad.
 * Väger samman namnlikhet, latinskt namn/FAO, leverantörshistorik,
 * sorteringssiffra och presentation. Bara inköpsbara produkter föreslås.
 */
export function suggestProducts(line: MatchInput, ctx: MatchContext, limit = 5): Suggestion[] {
  const aliases = ctx.aliases ?? [];
  const articleMap = ctx.articleMap ?? [];
  const grades = ctx.grades ?? [];
  const articleNo = skuKey(String(line.supplier_article_no ?? ""));
  const linePresentation = detectPresentation(line.product_name) ?? detectPresentation(line.presentation);

  const scored: Suggestion[] = [];

  for (const p of candidates(ctx.products)) {
    const reasons: string[] = [];
    let score = 0;

    if (articleNo && ctx.supplierId) {
      const hit = articleMap.find(
        (m) =>
          m.product_id === p.id &&
          m.supplier_id === ctx.supplierId &&
          skuKey(m.supplier_article_no) === articleNo,
      );
      if (hit) {
        score += 100;
        reasons.push("Leverantörens artikelnummer");
      }
    }

    const sp = speciesMatch(line, p, aliases);
    if (sp >= 0.95) {
      score += 40;
      reasons.push("Latinskt namn/FAO");
    } else if (sp > 0) {
      score += Math.round(30 * sp);
      reasons.push(sp >= 0.8 ? "Latinskt namn (tolerans)" : "Artgrupp");
    }

    const sim = nameSimilarity(line.product_name, p.name);
    if (sim > 0.2) {
      score += Math.round(45 * sim);
      reasons.push(`Namnlikhet ${Math.round(sim * 100)} %`);
    }

    const pGrade = gradeNoOf(p, grades);
    const lGrade = lineSizeGrade(line, grades, p.species_group);
    if (pGrade != null) {
      if (lGrade != null && lGrade === pGrade) {
        score += 30;
        reasons.push(`Sortering ${pGrade}`);
      } else if (lGrade != null) {
        score -= 35;
      } else {
        score -= 8;
      }
    }

    if (linePresentation) {
      const pp = detectPresentation(p.name);
      if (pp && pp === linePresentation) {
        score += 10;
        reasons.push(`Form: ${linePresentation}`);
      } else if (pp && pp !== linePresentation) {
        score -= 12;
      }
    }

    if (score > 0) scored.push({ product: p, score, reasons });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Hög säkerhet = förslaget förifylls (men ska bekräftas). */
export const HIGH_CONFIDENCE = 80;

/**
 * Matchar en rad mot en produkt i ordningen:
 * sparad artikelkoppling → storleksvariant (art + sorteringssiffra) →
 * FAO-kod → latinskt namn (exakt, alias, tolerans) → species_group → namnnyckel
 * → rankat förslag.
 *
 * Spärrade grundprodukter är aldrig kandidater. Kan sorteringen inte avgöras
 * för en art med sorteringsregister lämnas raden till manuellt val.
 */
export function matchProduct(line: MatchInput, ctx: MatchContext): MatchResult {
  const products = candidates(ctx.products);
  const aliases = ctx.aliases ?? [];
  const articleMap = ctx.articleMap ?? [];
  const grades = ctx.grades ?? [];

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

  // 2. Storleksvariant: art + sorteringssiffra
  const graded = products.filter((p) => p.size_grade_id);
  if (graded.length) {
    const speciesHits = graded
      .map((p) => ({ p, sp: speciesMatch(line, p, aliases) }))
      .filter((x) => x.sp >= 0.6);
    if (speciesHits.length) {
      const species = speciesHits[0].p.species_group;
      const lGrade = lineSizeGrade(line, grades, species);
      if (lGrade != null) {
        const exact = speciesHits.filter((x) => gradeNoOf(x.p, grades) === lGrade);
        if (exact.length === 1) {
          return { productId: exact[0].p.id, method: "size_grade", needsConfirmation: false };
        }
      }
      // Arten har sorteringsregister men sorteringen går inte att avgöra —
      // raden ska väljas manuellt, aldrig gissas.
      const ranked = suggestProducts(line, ctx);
      return {
        productId: ranked[0]?.score >= HIGH_CONFIDENCE ? ranked[0].product.id : null,
        method: ranked.length ? "suggestion" : "none",
        needsConfirmation: true,
      };
    }
  }

  // 3. FAO-kod
  const fao = skuKey(String(line.species_fao_code ?? ""));
  if (fao) {
    const faoHits = products.filter((p) => skuKey(String(p.fao_code ?? "")) === fao);
    if (faoHits.length === 1) {
      return { productId: faoHits[0].id, method: "fao_code", needsConfirmation: false };
    }
  }

  // 4. Latinskt namn — exakt, sedan alias, sedan tolerans
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

  // 5. Artgrupp
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

    // 6. Namnnyckel
    const nameHits = products.filter((p) => compareKey(p.name) === nameKey);
    if (nameHits.length === 1) {
      return { productId: nameHits[0].id, method: "name_key", needsConfirmation: false };
    }
  }

  // 7. Rankat förslag som sista utväg — kräver alltid bekräftelse
  const ranked = suggestProducts(line, ctx);
  if (ranked.length) {
    return {
      productId: ranked[0].score >= HIGH_CONFIDENCE ? ranked[0].product.id : null,
      method: "suggestion",
      needsConfirmation: true,
    };
  }

  return { productId: null, method: "none", needsConfirmation: true };
}
