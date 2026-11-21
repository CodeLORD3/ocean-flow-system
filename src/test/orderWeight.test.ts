import { describe, expect, it } from "vitest";
import { formatKg, orderWeight } from "@/lib/orderWeight";

const products = new Map([
  ["kalles", { id: "kalles", weight_per_piece: 0.3 }],
  ["julmust", { id: "julmust", weight_per_piece: null, nominal_weight_kg: 1.4 }],
  ["okand", { id: "okand", weight_per_piece: null, nominal_weight_kg: null }],
]);

describe("orderWeight", () => {
  it("räknar kg-rader som de är", () => {
    const w = orderWeight([{ product_id: "lax", product_name: "Lax", unit: "kg", quantity: "12,5" }], products);
    expect(w.totalKg).toBeCloseTo(12.5);
  });

  it("räknar styckrader med vikt per styck", () => {
    const w = orderWeight([{ product_id: "kalles", product_name: "Kalles", unit: "st", quantity: 10 }], products);
    expect(w.totalKg).toBeCloseTo(3);
    expect(w.pieceKg).toBeCloseTo(3);
  });

  it("använder nominell vikt när vikt per styck saknas", () => {
    const w = orderWeight([{ product_id: "julmust", product_name: "Julmust", unit: "ST", quantity: 2 }], products);
    expect(w.totalKg).toBeCloseTo(2.8);
  });

  it("räknar inte in styckrader utan vikt men listar dem", () => {
    const w = orderWeight([
      { product_id: "lax", product_name: "Lax", unit: "kg", quantity: 5 },
      { product_id: "okand", product_name: "Okänd", unit: "st", quantity: 4 },
    ], products);
    expect(w.totalKg).toBeCloseTo(5);
    expect(w.missing).toEqual([{ product_id: "okand", product_name: "Okänd", quantity: 4 }]);
  });

  it("hoppar över tomma rader", () => {
    const w = orderWeight([{ product_id: "okand", product_name: "Okänd", unit: "st", quantity: "" }], products);
    expect(w.missing).toHaveLength(0);
  });
});

describe("formatKg", () => {
  it("visar högst en decimal med komma", () => {
    expect(formatKg(12.46)).toBe("12,5 kg");
    expect(formatKg(1234)).toBe("1 234 kg");
  });
});
