import { speciesKey } from "@/lib/asciiFold";

/** Prislistor som kontrolleras (samma nycklar som i useProductionYields). */
export const PRICE_LIST_BUTIK = "butik_goteborg";
export const PRICE_LIST_GROSSIST = "grossist";

export type Severity = "blocking" | "warning";

export type CheckId = "yields" | "cut_models" | "cut_splits" | "detail_prices" | "margins_vat";

export interface CoverageFinding {
  check: CheckId;
  severity: Severity;
  /** Artgrupp eller styckningsmodell som bristen hör till. */
  group: string;
  /** Konkret objekt: SKU, detaljform, prislista, momskategori. */
  subject: string;
  message: string;
}

export const CHECK_LABELS: Record<CheckId, string> = {
  yields: "Utbytestäckning",
  cut_models: "Styckningsmodell per artgrupp",
  cut_splits: "Andelar i styckningsmodeller",
  detail_prices: "Härledda referenspriser (dagspris → Reservpris)",
  margins_vat: "Marginalmål och moms",
};

/* ── Indata (endast de fält kontrollerna behöver) ─────────────── */

export interface ProductRow {
  sku: string;
  name: string;
  species_group?: string | null;
  active?: boolean | null;
  /** Produktkategori — kategorier med undantag kontrolleras inte mot artgrupp/utbyte. */
  category?: string | null;
  /** Per-produkt-undantag: blandningar, alger och beredningar utan enskild art. */
  exempt_species_data?: boolean | null;
  /** Dagspris (viktat snitt av aktiva partier) och antal partier bakom det. */
  day_price?: number | string | null;
  day_price_lots?: number | string | null;
  /** Manuellt Reservpris — används när dagspris saknas. */
  cost_price?: number | string | null;
}

export interface YieldRow {
  species_group: string;
}
export interface CutModelRow {
  species_group: string;
  cut_model: string;
}
export interface CutSplitRow {
  cut_model: string;
  detail_form: string;
  detail_name?: string | null;
  pct_of_fillet: number | string;
  role: string;
  is_optional?: boolean | null;
}
export interface DetailPriceRow {
  species_group: string;
  detail_form: string;
  price_list: string;
  price_incl_vat?: number | string | null;
  last_set_price?: number | string | null;
  reference_cost_per_kg?: number | string | null;

}
export interface MarginTargetRow {
  price_list: string;
  target_pct: number | string;
}
export interface VatRateRow {
  category: string;
  rate: number | string;
  valid_from: string;
  valid_to?: string | null;
}

export interface CoverageInput {
  products: ProductRow[];
  yields: YieldRow[];
  cutModels: CutModelRow[];
  cutSplits: CutSplitRow[];
  detailPrices: DetailPriceRow[];
  marginTargets: MarginTargetRow[];
  vatRates: VatRateRow[];
  /** Produktkategorier med flaggan "kräver ej artgrupp/utbyte". */
  exemptCategories?: string[];
  /** ISO-datum (YYYY-MM-DD) som momsgiltigheten prövas mot. */
  today?: string;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formKey = (v: unknown): string => String(v ?? "").trim().toLowerCase();

/** Produkter undantagna via kategoriflagga eller per-produkt-flagga. */
export function isExemptProduct(p: ProductRow, input: CoverageInput): boolean {
  if (p.exempt_species_data) return true;
  const set = new Set((input.exemptCategories ?? []).map((c) => formKey(c)));
  return set.has(formKey(p.category));
}

/* ── 1. Utbytestäckning ───────────────────────────────────────── */

export function checkYieldCoverage(input: CoverageInput): CoverageFinding[] {
  const covered = new Set(input.yields.map((y) => speciesKey(y.species_group)));
  const out: CoverageFinding[] = [];
  const activeProducts = input.products.filter(
    (p) => p.active !== false && !isExemptProduct(p, input),
  );


  for (const p of activeProducts) {
    const g = speciesKey(p.species_group);
    if (!g) {
      out.push({
        check: "yields",
        severity: "warning",
        group: "(saknar artgrupp)",
        subject: p.sku,
        message: `${p.name} saknar artgrupp och kan inte kopplas till ett utbyte.`,
      });
      continue;
    }
    if (!covered.has(g)) {
      out.push({
        check: "yields",
        severity: "blocking",
        group: p.species_group ?? g,
        subject: p.sku,
        message: `${p.name}: artgruppen saknar rad i utbytesregistret.`,
      });
    }
  }
  return out;
}

/** Artgrupper i bruk: från aktiva produkter och från utbytesregistret. */
export function usedSpeciesGroups(input: CoverageInput): Map<string, string> {
  const map = new Map<string, string>();
  for (const p of input.products) {
    if (p.active === false || isExemptProduct(p, input)) continue;
    const k = speciesKey(p.species_group);
    if (k && !map.has(k)) map.set(k, p.species_group as string);
  }
  for (const y of input.yields) {
    const k = speciesKey(y.species_group);
    if (k && !map.has(k)) map.set(k, y.species_group);
  }
  return map;
}

/* ── 2. Styckningsmodell per artgrupp ─────────────────────────── */

export function checkCutModels(input: CoverageInput): CoverageFinding[] {
  const out: CoverageFinding[] = [];
  const modelByGroup = new Map<string, string>();
  for (const m of input.cutModels) modelByGroup.set(speciesKey(m.species_group), m.cut_model);

  for (const [key, label] of usedSpeciesGroups(input)) {
    if (!modelByGroup.has(key)) {
      out.push({
        check: "cut_models",
        severity: "blocking",
        group: label,
        subject: "styckningsmodell",
        message: "Artgruppen används men saknar styckningsmodell.",
      });
    }
  }

  const splitsByModel = new Set(input.cutSplits.map((s) => formKey(s.cut_model)));
  for (const m of input.cutModels) {
    if (!splitsByModel.has(formKey(m.cut_model))) {
      out.push({
        check: "cut_models",
        severity: "blocking",
        group: m.species_group,
        subject: m.cut_model,
        message: "Modellen har inga detaljrader och kan inte användas i en tillverkningsorder.",
      });
    }
  }
  return out;
}

/* ── 3. Andelar i styckningsmodeller ──────────────────────────── */

export const PCT_TOLERANCE = 0.5;

export function checkCutSplits(input: CoverageInput): CoverageFinding[] {
  const out: CoverageFinding[] = [];
  const byModel = new Map<string, CutSplitRow[]>();
  for (const s of input.cutSplits) {
    const k = s.cut_model;
    const arr = byModel.get(k) ?? [];
    arr.push(s);
    byModel.set(k, arr);
  }

  for (const [model, rows] of byModel) {
    const required = rows.filter((r) => !r.is_optional);
    const sum = required.reduce((acc, r) => acc + num(r.pct_of_fillet), 0);
    const diff = Math.round((sum - 100) * 100) / 100;
    if (Math.abs(diff) > PCT_TOLERANCE) {
      out.push({
        check: "cut_splits",
        severity: "blocking",
        group: model,
        subject: "summa andelar",
        message: `Andelarna summerar till ${sum.toFixed(1)} % (differens ${diff > 0 ? "+" : ""}${diff.toFixed(1)} pe).`,
      });
    }
    for (const r of rows) {
      if (num(r.pct_of_fillet) <= 0) {
        out.push({
          check: "cut_splits",
          severity: "warning",
          group: model,
          subject: r.detail_name || r.detail_form,
          message: "Detaljen har andel 0 eller negativ andel.",
        });
      }
    }
    if (!rows.some((r) => formKey(r.role) === "main")) {
      out.push({
        check: "cut_splits",
        severity: "blocking",
        group: model,
        subject: "huvuddetalj",
        message: "Modellen saknar huvuddetalj (role = main) som kan bära marginalen.",
      });
    }
  }
  return out;
}

/* ── 4. Härledda referenspriser per kanal ─────────────────────── */

/** Priskälla för den automatiska härledningen. */
export type PriceSource = "day_price" | "cost_price" | "missing";

export const PRICE_SOURCE_LABEL: Record<PriceSource, string> = {
  day_price: "Dagspris",
  cost_price: "Reservpris",
  missing: "Saknas",
};

export interface DerivedPriceRow {
  /** Artgrupp (etikett som i produktregistret). */
  group: string;
  sku: string;
  name: string;
  /** Styckningsmodellens detalj som priset härleds till. */
  detail: string;
  channel: string;
  source: PriceSource;
  /** Underliggande råvarukostnad kr/kg (dagspris eller Reservpris). */
  cost: number;
  /** Härlett riktpris kr/kg, eller 0 när källa saknas. */
  derived: number;
}

/** Samma reservkedja som marginalkalkylerna: dagspris → Reservpris. */
export function productCost(p: ProductRow): { source: PriceSource; cost: number } {
  const day = num(p.day_price);
  const lots = num(p.day_price_lots);
  if (day > 0 && lots > 0) return { source: "day_price", cost: day };
  const reserve = num(p.cost_price);
  if (reserve > 0) return { source: "cost_price", cost: reserve };
  return { source: "missing", cost: 0 };
}

/**
 * Härleder riktpris per detalj och kanal ur produktens gällande kostnad,
 * detaljens utbytesandel och kanalens marginalmål. Ingen statisk prislista krävs.
 */
export function deriveDetailPrices(input: CoverageInput): DerivedPriceRow[] {
  const modelByGroup = new Map<string, string>();
  for (const m of input.cutModels) modelByGroup.set(speciesKey(m.species_group), m.cut_model);

  const splitsByModel = new Map<string, CutSplitRow[]>();
  for (const s of input.cutSplits) {
    const arr = splitsByModel.get(formKey(s.cut_model)) ?? [];
    arr.push(s);
    splitsByModel.set(formKey(s.cut_model), arr);
  }

  const targetByList = new Map<string, number>();
  for (const t of input.marginTargets) targetByList.set(t.price_list, num(t.target_pct));

  const out: DerivedPriceRow[] = [];
  for (const p of input.products) {
    if (p.active === false || isExemptProduct(p, input)) continue;
    const key = speciesKey(p.species_group);
    const model = modelByGroup.get(key);
    if (!model) continue; // saknad modell fångas av kontroll 2
    const splits = splitsByModel.get(formKey(model)) ?? [];
    const { source, cost } = productCost(p);
    for (const s of splits) {
      const pct = num(s.pct_of_fillet);
      for (const list of [PRICE_LIST_BUTIK, PRICE_LIST_GROSSIST]) {
        const target = targetByList.get(list) ?? 0;
        const derived =
          source === "missing" || pct <= 0 ? 0 : (cost / (pct / 100)) * (1 + target / 100);
        out.push({
          group: p.species_group ?? key,
          sku: p.sku,
          name: p.name,
          detail: s.detail_name || s.detail_form,
          channel: list === PRICE_LIST_BUTIK ? "butik" : "grossist",
          source,
          cost,
          derived: Math.round(derived * 100) / 100,
        });
      }
    }
  }
  return out;
}

/**
 * En detalj är täckt så snart priset kan härledas ur dagspris eller Reservpris.
 * Riktig datalucka = produkten saknar båda.
 */
export function checkDetailPrices(input: CoverageInput): CoverageFinding[] {
  const out: CoverageFinding[] = [];
  const modelByGroup = new Set(input.cutModels.map((m) => speciesKey(m.species_group)));

  for (const p of input.products) {
    if (p.active === false || isExemptProduct(p, input)) continue;
    const key = speciesKey(p.species_group);
    if (!key || !modelByGroup.has(key)) continue;
    if (productCost(p).source !== "missing") continue;
    out.push({
      check: "detail_prices",
      severity: "blocking",
      group: p.species_group ?? key,
      subject: p.sku,
      message: `${p.name}: saknar både dagspris och Reservpris — referenspris kan inte härledas.`,
    });
  }
  return out;
}

/* ── 5. Marginalmål och moms ──────────────────────────────────── */

export function checkMarginsAndVat(input: CoverageInput): CoverageFinding[] {
  const out: CoverageFinding[] = [];
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  for (const list of [PRICE_LIST_BUTIK, PRICE_LIST_GROSSIST]) {
    const row = input.marginTargets.find((m) => m.price_list === list);
    if (!row) {
      out.push({
        check: "margins_vat",
        severity: "blocking",
        group: list,
        subject: "marginalmål",
        message: "Prislistan saknar marginalmål.",
      });
    } else if (num(row.target_pct) <= 0) {
      out.push({
        check: "margins_vat",
        severity: "blocking",
        group: list,
        subject: "marginalmål",
        message: "Marginalmålet är 0 eller negativt.",
      });
    }
  }

  if (input.vatRates.length === 0) {
    out.push({
      check: "margins_vat",
      severity: "blocking",
      group: "moms",
      subject: "momssats",
      message: "Inga momssatser är registrerade.",
    });
    return out;
  }

  const categories = [...new Set(input.vatRates.map((v) => v.category))];
  for (const cat of categories) {
    const valid = input.vatRates.filter(
      (v) => v.category === cat && v.valid_from <= today && (!v.valid_to || v.valid_to >= today),
    );
    if (valid.length === 0) {
      out.push({
        check: "margins_vat",
        severity: "blocking",
        group: "moms",
        subject: cat,
        message: `Ingen giltig momssats för ${today}.`,
      });
      continue;
    }
    if (valid.length > 1) {
      out.push({
        check: "margins_vat",
        severity: "warning",
        group: "moms",
        subject: cat,
        message: `${valid.length} momssatser är giltiga samtidigt — perioderna överlappar.`,
      });
    }
    if (valid.some((v) => num(v.rate) <= 0)) {
      out.push({
        check: "margins_vat",
        severity: "warning",
        group: "moms",
        subject: cat,
        message: "Giltig momssats är 0.",
      });
    }
  }
  return out;
}

/* ── Samlad körning ───────────────────────────────────────────── */

export function runCoverageChecks(input: CoverageInput): CoverageFinding[] {
  return [
    ...checkYieldCoverage(input),
    ...checkCutModels(input),
    ...checkCutSplits(input),
    ...checkDetailPrices(input),
    ...checkMarginsAndVat(input),
  ];
}

export function summarize(findings: CoverageFinding[]) {
  return {
    blocking: findings.filter((f) => f.severity === "blocking").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
  };
}

export function findingsToCsv(findings: CoverageFinding[]): string {
  const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = ["kontroll,allvar,grupp,objekt,beskrivning"];
  for (const f of findings) {
    lines.push(
      [
        esc(CHECK_LABELS[f.check]),
        f.severity === "blocking" ? "blockerande" : "varning",
        esc(f.group),
        esc(f.subject),
        esc(f.message),
      ].join(","),
    );
  }
  return lines.join("\n");
}
