import { describe, it, expect } from "vitest";
import {
  checkCutModels,
  checkCutSplits,
  checkDetailPrices,
  checkMarginsAndVat,
  checkYieldCoverage,
  CoverageInput,
  deriveDetailPrices,
  PRICE_SOURCE_LABEL,
  productCost,
  PRICE_LIST_BUTIK,
  PRICE_LIST_GROSSIST,
  runCoverageChecks,
  summarize,
} from "@/lib/coverageChecks";

const base = (over: Partial<CoverageInput> = {}): CoverageInput => ({
  products: [],
  yields: [],
  cutModels: [],
  cutSplits: [],
  detailPrices: [],
  marginTargets: [
    { price_list: PRICE_LIST_BUTIK, target_pct: 45 },
    { price_list: PRICE_LIST_GROSSIST, target_pct: 22 },
  ],
  vatRates: [{ category: "livsmedel", rate: 12, valid_from: "2020-01-01", valid_to: null }],
  today: "2026-08-03",
  ...over,
});

describe("utbytestäckning", () => {
  it("flaggar produkter vars artgrupp saknar utbyte", () => {
    const f = checkYieldCoverage(
      base({
        products: [{ sku: "F-1", name: "Torskfilé", species_group: "Torsk", active: true }],
        yields: [{ species_group: "Lax" }],
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("blocking");
  });

  it("flaggar produkter utan artgrupp som varning", () => {
    const f = checkYieldCoverage(base({ products: [{ sku: "F-2", name: "Okänd", species_group: null }] }));
    expect(f[0].severity).toBe("warning");
  });

  it("ger inga brister när artgruppen finns (stavning/versaler ignoreras)", () => {
    const f = checkYieldCoverage(
      base({
        products: [{ sku: "F-3", name: "Torskfilé", species_group: "torsk" }],
        yields: [{ species_group: "Torsk" }],
      }),
    );
    expect(f).toHaveLength(0);
  });
});

describe("styckningsmodeller", () => {
  it("flaggar artgrupp i bruk utan modell", () => {
    const f = checkCutModels(base({ yields: [{ species_group: "Torsk" }] }));
    expect(f.some((x) => x.subject === "styckningsmodell")).toBe(true);
  });

  it("flaggar modell utan detaljrader", () => {
    const f = checkCutModels(base({ cutModels: [{ species_group: "Torsk", cut_model: "torsk_std" }] }));
    expect(f.some((x) => x.subject === "torsk_std")).toBe(true);
  });
});

describe("andelar i modellen", () => {
  const splits = (rows: any[]) => checkCutSplits(base({ cutSplits: rows }));

  it("godkänner summa 100 %", () => {
    const f = splits([
      { cut_model: "m", detail_form: "ryggfile", pct_of_fillet: 70, role: "main" },
      { cut_model: "m", detail_form: "bukfile", pct_of_fillet: 30, role: "byproduct" },
    ]);
    expect(f).toHaveLength(0);
  });

  it("flaggar summa 99 %", () => {
    const f = splits([
      { cut_model: "m", detail_form: "ryggfile", pct_of_fillet: 70, role: "main" },
      { cut_model: "m", detail_form: "bukfile", pct_of_fillet: 29, role: "byproduct" },
    ]);
    expect(f.some((x) => x.subject === "summa andelar")).toBe(true);
  });

  it("räknar inte valfria rader i summan", () => {
    const f = splits([
      { cut_model: "m", detail_form: "ryggfile", pct_of_fillet: 70, role: "main" },
      { cut_model: "m", detail_form: "bukfile", pct_of_fillet: 30, role: "byproduct" },
      { cut_model: "m", detail_form: "rom", pct_of_fillet: 5, role: "byproduct", is_optional: true },
    ]);
    expect(f).toHaveLength(0);
  });

  it("flaggar modell utan huvuddetalj", () => {
    const f = splits([{ cut_model: "m", detail_form: "bukfile", pct_of_fillet: 100, role: "byproduct" }]);
    expect(f.some((x) => x.subject === "huvuddetalj")).toBe(true);
  });

  it("flaggar nollandel som varning", () => {
    const f = splits([
      { cut_model: "m", detail_form: "ryggfile", pct_of_fillet: 100, role: "main" },
      { cut_model: "m", detail_form: "bukfile", pct_of_fillet: 0, role: "byproduct", is_optional: true },
    ]);
    expect(f.find((x) => x.subject === "bukfile")?.severity).toBe("warning");
  });
});

describe("härledda referenspriser", () => {
  const input = (products: any[]) =>
    base({
      products,
      yields: [{ species_group: "Torsk" }],
      cutModels: [{ species_group: "Torsk", cut_model: "m" }],
      cutSplits: [{ cut_model: "m", detail_form: "ryggfile", pct_of_fillet: 50, role: "main" }],
    });

  const torsk = (over: any = {}) => ({
    sku: "F-1",
    name: "Torsk",
    species_group: "Torsk",
    active: true,
    ...over,
  });

  it("härleder pris ur dagspris gånger utbytesandel och kanalmål", () => {
    const rows = deriveDetailPrices(input([torsk({ day_price: 100, day_price_lots: 2 })]));
    const butik = rows.find((r) => r.channel === "butik")!;
    const grossist = rows.find((r) => r.channel === "grossist")!;
    // 100 kr/kg råvara / 50 % utbyte = 200 kr/kg detalj, plus kanalens marginalmål.
    expect(butik.source).toBe("day_price");
    expect(butik.cost).toBe(100);
    expect(butik.derived).toBe(290); // 200 * 1,45
    expect(grossist.derived).toBe(244); // 200 * 1,22
    expect(checkDetailPrices(input([torsk({ day_price: 100, day_price_lots: 2 })]))).toHaveLength(0);
  });

  it("faller tillbaka på Reservpris när dagspris saknas och märker källan", () => {
    const rows = deriveDetailPrices(
      input([torsk({ day_price: null, cost_price: 80, cost_price_source: "inkopshistorik" })]),
    );
    expect(rows.every((r) => r.source === "cost_price")).toBe(true);
    expect(rows[0].cost).toBe(80);
    expect(rows[0].derived).toBe(232); // 80 / 0,5 * 1,45
    expect(PRICE_SOURCE_LABEL[rows[0].source]).toBe("Reservpris");
  });

  it("låser reservkedjan: dagspris går före Reservpris", () => {
    const p = torsk({ day_price: 100, day_price_lots: 1, cost_price: 80, cost_price_source: "inkopshistorik" });
    expect(productCost(p)).toEqual({ source: "day_price", cost: 100 });
    // Dagspris utan partier bakom sig räknas inte — då gäller Reservpriset.
    expect(productCost({ ...p, day_price_lots: 0 })).toEqual({ source: "cost_price", cost: 80 });
  });

  it("märker ärvt Reservpris per rad", () => {
    const rows = deriveDetailPrices(
      input([torsk({ cost_price: 80, cost_price_inherited: true, cost_price_source: "inkopshistorik" })]),
    );
    expect(rows[0].inherited).toBe(true);
  });

  it("platshållarpris räknas som datalucka, inte som pris", () => {
    const p = torsk({ cost_price: 1, cost_price_source: "platshallare" });
    expect(productCost(p).source).toBe("missing");
    const rows = deriveDetailPrices(input([p]));
    expect(rows.every((r) => r.derived === 0 && r.source === "missing")).toBe(true);
    const f = checkDetailPrices(input([p]));
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe("blocking");
    expect(f[0].message).toContain("platshållarpris");
  });

  it("bara produkter utan både dagspris och Reservpris är luckor", () => {
    const f = checkDetailPrices(input([torsk({ sku: "F-9" })]));
    expect(f).toHaveLength(1);
    expect(f[0].subject).toBe("F-9");
    expect(f[0].message).toContain("saknar både dagspris och Reservpris");
  });
});

describe("marginalmål och moms", () => {
  it("flaggar utgången momssats", () => {
    const f = checkMarginsAndVat(
      base({ vatRates: [{ category: "livsmedel", rate: 12, valid_from: "2020-01-01", valid_to: "2026-01-01" }] }),
    );
    expect(f.some((x) => x.message.includes("Ingen giltig momssats"))).toBe(true);
  });

  it("flaggar saknat marginalmål", () => {
    const f = checkMarginsAndVat(base({ marginTargets: [{ price_list: PRICE_LIST_BUTIK, target_pct: 45 }] }));
    expect(f.some((x) => x.group === PRICE_LIST_GROSSIST)).toBe(true);
  });

  it("ren körning ger inga brister", () => {
    expect(runCoverageChecks(base())).toHaveLength(0);
    expect(summarize([])).toEqual({ blocking: 0, warnings: 0 });
  });
});
