import { describe, it, expect } from "vitest";
import { buildFamilyGroups, forecastFor } from "@/lib/productFamilies";

const families = [{ id: "f1", name: "Aioli", base_unit: "kg" }];
const products = [
  { id: "a", name: "Aioli", unit: "kg", family_id: "f1", category: "Delikatesser" },
  { id: "b", name: "Aioli 4kg hink", unit: "st", weight_per_piece: 4, family_id: "f1" },
  { id: "c", name: "Aioli 2hg", unit: "st", weight_per_piece: 0.2, family_id: "f1" },
];

describe("produktfamiljer", () => {
  const groups = buildFamilyGroups({
    products,
    families,
    stockByProduct: new Map([["a", 15], ["b", 1], ["c", 10]]),
    orderedByProduct: new Map([["c", 30]]),
  });
  it("summerar familjen i kilo", () => {
    expect(groups[0].totalKg).toBe(21);
  });
  it("räknar ut vad en hink räcker till", () => {
    const hink = groups[0].variants.find((v) => v.productId === "b")!;
    expect(forecastFor(hink, groups[0])[0].perUnit).toBe(20);
  });
  it("flaggar när burkarna inte räcker men hinken gör det", () => {
    expect(groups[0].shortfalls).toHaveLength(1);
    expect(groups[0].shortfalls[0].covers).toBe(20);
  });
});
