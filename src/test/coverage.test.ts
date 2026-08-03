import { describe, it, expect } from "vitest";
import {
  checkCutModels,
  checkCutSplits,
  checkDetailPrices,
  checkMarginsAndVat,
  checkYieldCoverage,
  CoverageInput,
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

describe("referenspriser per kanal", () => {
  const input = (prices: any[]) =>
    base({
      yields: [{ species_group: "Torsk" }],
      cutModels: [{ species_group: "Torsk", cut_model: "m" }],
      cutSplits: [{ cut_model: "m", detail_form: "ryggfile", pct_of_fillet: 100, role: "main" }],
      detailPrices: prices,
    });

  it("saknat butikspris är blockerande, saknat grossistpris är varning", () => {
    const f = checkDetailPrices(input([]));
    expect(f).toHaveLength(2);
    expect(f.find((x) => x.subject.includes("butik"))?.severity).toBe("blocking");
    expect(f.find((x) => x.subject.includes("grossist"))?.severity).toBe("warning");
  });

  it("nollpris flaggas trots att raden finns", () => {
    const f = checkDetailPrices(
      input([
        { species_group: "Torsk", detail_form: "ryggfile", price_list: PRICE_LIST_BUTIK, price_incl_vat: 0, last_set_price: 0 },
        { species_group: "Torsk", detail_form: "ryggfile", price_list: PRICE_LIST_GROSSIST, price_incl_vat: 210, last_set_price: 0 },
      ]),
    );
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain("0");
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
