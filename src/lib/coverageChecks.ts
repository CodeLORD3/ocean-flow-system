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
  detail_prices: "Referenspriser per kanal",
  margins_vat: "Marginalmål och moms",
};

/* ── Indata (endast de fält kontrollerna behöver) ─────────────── */

export interface ProductRow {
  sku: string;
  name: string;
  species_group?: string | null;
  active?: boolean | null;
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
  /** ISO-datum (YYYY-MM-DD) som momsgiltigheten prövas mot. */
  today?: string;
}

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formKey = (v: unknown): string => String(v ?? "").trim().toLowerCase();

/* ── 1. Utbytestäckning ───────────────────────────────────────── */

export function checkYieldCoverage(input: CoverageInput): CoverageFinding[] {
  const covered = new Set(input.yields.map((y) => speciesKey(y.species_group)));
  const out: CoverageFinding[] = [];
  const activeProducts = input.products.filter((p) => p.active !== false);

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
    if (p.active === false) continue;
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

/* ── 4. Referenspriser per kanal ──────────────────────────────── */

export function checkDetailPrices(input: CoverageInput): CoverageFinding[] {
  const out: CoverageFinding[] = [];
  const splitsByModel = new Map<string, CutSplitRow[]>();
  for (const s of input.cutSplits) {
    const arr = splitsByModel.get(formKey(s.cut_model)) ?? [];
    arr.push(s);
    splitsByModel.set(formKey(s.cut_model), arr);
  }

  const priceIndex = new Map<string, DetailPriceRow>();
  for (const p of input.detailPrices) {
    priceIndex.set(`${p.price_list}|${speciesKey(p.species_group)}|${formKey(p.detail_form)}`, p);
  }

  const used = usedSpeciesGroups(input);

  for (const m of input.cutModels) {
    const key = speciesKey(m.species_group);
    if (!used.has(key)) continue; // bara modeller för artgrupper i bruk
    const splits = splitsByModel.get(formKey(m.cut_model)) ?? [];
    for (const s of splits) {
      for (const list of [PRICE_LIST_BUTIK, PRICE_LIST_GROSSIST]) {
        const row = priceIndex.get(`${list}|${key}|${formKey(s.detail_form)}`);
        const severity: Severity = list === PRICE_LIST_BUTIK ? "blocking" : "warning";
        const label = list === PRICE_LIST_BUTIK ? "butik" : "grossist";
        if (!row) {
          out.push({
            check: "detail_prices",
            severity,
            group: m.species_group,
            subject: `${s.detail_name || s.detail_form} (${label})`,
            message: `Referenspris saknas i prislistan ${list}.`,
          });
          continue;
        }
        const price = num(row.price_incl_vat) || num(row.last_set_price);
        if (price <= 0) {
          out.push({
            check: "detail_prices",
            severity,
            group: m.species_group,
            subject: `${s.detail_name || s.detail_form} (${label})`,
            message: `Referenspriset är 0 i prislistan ${list}.`,
          });
        }
        if (price > 0 && num(row.reference_cost_per_kg) <= 0) {
          out.push({
            check: "detail_prices",
            severity: "warning",
            group: m.species_group,
            subject: `${s.detail_name || s.detail_form} (${label})`,
            message: `Referenskostnad kr/kg saknas — skalfaktorn kan inte bedömas i prislistan ${list}.`,
          });
        }

      }
    }
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
