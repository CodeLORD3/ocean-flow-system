import { describe, expect, it } from "vitest";

import { editDistance, latinKey, matchProduct, resolveLatinAlias } from "@/lib/foljesedelMatch";
import { buildPostingPlan, evenBatchSplit, quantityToKg } from "@/lib/purchaseReportPosting";

const products = [
  { id: "p1", name: "Havskräfta hel", sku: "SK-001", latin_name: "Nephrops norvegicus", fao_code: "NEP", shelf_life_days: 4 },
  { id: "p2", name: "Hummer hel", sku: "SK-002", latin_name: "Homarus gammarus", fao_code: "LBE" },
  { id: "p3", name: "Blåmussla", sku: "SK-003", latin_name: "Mytilus edulis", nominal_weight_kg: 5 },
];

const line = (over: Record<string, unknown> = {}) => ({
  id: "l1",
  product_id: "p1",
  product_name: "Havskräfta",
  quantity: 10,
  unit: "kg",
  unit_price: 100,
  line_total: 1000,
  ...over,
}) as any;

describe("matchning", () => {
  it("matchar på sparad artikelkoppling först", () => {
    const res = matchProduct(
      { product_name: "Okänt namn", supplier_article_no: " 4711 " },
      { products, supplierId: "s1", articleMap: [{ supplier_id: "s1", supplier_article_no: "4711", product_id: "p2" }] },
    );
    expect(res).toEqual({ productId: "p2", method: "supplier_article", needsConfirmation: false });
  });

  it("matchar på FAO-kod och latinskt namn", () => {
    expect(matchProduct({ species_fao_code: "nep" }, { products }).productId).toBe("p1");
    expect(matchProduct({ latin_name: "Mytilus Edulis" }, { products }).method).toBe("latin_name");
  });

  it("rättar kända felstavningar via aliaslistan", () => {
    const aliases = [{ alias: "Homarus gamarus", latin_name: "Homarus gammarus" }];
    expect(resolveLatinAlias("homarus  gamarus", aliases)).toBe("Homarus gammarus");
    const res = matchProduct({ latin_name: "Homarus gamarus" }, { products, aliases });
    expect(res.productId).toBe("p2");
    expect(res.needsConfirmation).toBe(false);
  });

  it("tolererar stavfel upp till avstånd 2 men kräver bekräftelse", () => {
    const res = matchProduct({ latin_name: "Nephrops norvegicu" }, { products });
    expect(res).toEqual({ productId: "p1", method: "latin_fuzzy", needsConfirmation: true });
    expect(editDistance(latinKey("Nephrops norvegicus"), latinKey("nephrops norvegicus"))).toBe(0);
  });

  it("returnerar ingen träff när inget passar", () => {
    expect(matchProduct({ product_name: "Skruv M6" }, { products }).productId).toBeNull();
  });
});

describe("enhetsnormalisering", () => {
  it("räknar om gram och lådor", () => {
    expect(quantityToKg(line({ unit: "g", quantity: 2500 })).kg).toBe(2.5);
    expect(quantityToKg(line({ product_id: "p3", unit: "låda", quantity: 3 }), products[2] as any).kg).toBe(15);
  });

  it("stoppar styck utan styckvikt", () => {
    expect(quantityToKg(line({ unit: "st" })).kg).toBeNull();
  });
});

describe("bokföringsplan", () => {
  it("delar en rad med flera partinummer (JHB)", () => {
    const plan = buildPostingPlan([line({ lot_numbers: ["A1", "A2"], quantity: 10 })]);
    expect(plan.lots.map((l) => [l.lotNumber, l.quantityKg])).toEqual([["A1", 5], ["A2", 5]]);
    expect(plan.blockers).toHaveLength(0);
  });

  it("respekterar manuell fördelning och stoppar felaktig summa", () => {
    const ok = buildPostingPlan([line({ lot_numbers: ["A1", "A2"], batch_quantities: { A1: 7, A2: 3 } })]);
    expect(ok.lots.find((l) => l.lotNumber === "A1")?.quantityKg).toBe(7);
    const bad = buildPostingPlan([line({ lot_numbers: ["A1", "A2"], batch_quantities: { A1: 7, A2: 1 } })]);
    expect(bad.blockers).toHaveLength(1);
    expect(bad.lots).toHaveLength(0);
  });

  it("slår ihop klubbslag på samma parti med viktat snittpris (GFA)", () => {
    const plan = buildPostingPlan([
      line({ id: "a", lot_numbers: ["K9"], quantity: 10, unit_price: 100 }),
      line({ id: "b", lot_numbers: ["K9"], quantity: 30, unit_price: 200 }),
    ]);
    expect(plan.lots).toHaveLength(1);
    expect(plan.lots[0].quantityKg).toBe(40);
    expect(plan.lots[0].unitCost).toBe(175);
    expect(plan.lots[0].lineIds).toEqual(["a", "b"]);
    expect(plan.lots[0].parentLineId).toBe("a");
  });

  it("låter leverantörens bäst-före gå före hållbarhetsdagar", () => {
    const withDoc = buildPostingPlan([line({ best_before: "2026-01-02" })], {
      products: products as any,
      documentDate: "2026-01-01",
    });
    expect(withDoc.lots[0].bestBefore).toBe("2026-01-02");
    const computed = buildPostingPlan([line()], { products: products as any, documentDate: "2026-01-01" });
    expect(computed.lots[0].bestBefore).toBe("2026-01-05");
  });

  it("larmar vid över 10 % viktavvikelse men bokför levererad vikt", () => {
    const plan = buildPostingPlan([line({ quantity: 8, ordered_quantity: 10, line_total: 800 })]);
    expect(plan.warnings).toHaveLength(1);
    expect(plan.lots[0].quantityKg).toBe(8);
  });

  it("spärrar nollpris till det bekräftas", () => {
    expect(buildPostingPlan([line({ unit_price: 0, line_total: 0 })]).blockers).toHaveLength(1);
    expect(
      buildPostingPlan([line({ unit_price: 0, line_total: 0, zero_price_confirmed: true })]).lots,
    ).toHaveLength(1);
  });

  it("spärrar rader utan kopplad produkt", () => {
    expect(buildPostingPlan([line({ product_id: null })]).blockers).toHaveLength(1);
  });

  it("sätter reservpartinummer från dokumentnummer när parti saknas", () => {
    const plan = buildPostingPlan([line()], { documentNumber: "FS-123" });
    expect(plan.lots[0].lotNumber).toBe("FS-FS-123-1");
  });

  it("fördelar jämnt med rest på sista partiet", () => {
    expect(evenBatchSplit(["A", "B", "C"], 10)).toEqual({ A: 3.333, B: 3.333, C: 3.334 });
  });
});
