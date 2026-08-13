import { describe, expect, it } from "vitest";

import {
  perUnitLabel,
  stockQtyToKg,
  stockUnitOf,
  stockValue,
  toStockQuantity,
  toStockUnitPrice,
} from "@/lib/units";
import { buildPostingPlan, quantityToStockUnit } from "@/lib/purchaseReportPosting";

const oyster = { unit: "st", weight_per_piece: 0.1 };
const cod = { unit: "kg", weight_per_piece: 0 };
const mussel = { unit: "kg", nominal_weight_kg: 5 };

describe("enhetstolkning av kvantitetsfältet", () => {
  it("styckprodukt lagras i antal, viktprodukt i kilo", () => {
    expect(stockUnitOf(oyster)).toBe("st");
    expect(stockUnitOf(cod)).toBe("kg");
    expect(perUnitLabel(oyster)).toBe("/st");
  });

  it("styckvara i kilo räknas om till antal", () => {
    expect(toStockQuantity(40.8, "kg", oyster).qty).toBe(408);
    expect(toStockQuantity(408, "st", oyster).qty).toBe(408);
  });

  it("viktvara i styck och låda räknas om till kilo", () => {
    expect(toStockQuantity(10, "st", { unit: "kg", weight_per_piece: 0.4 }).qty).toBe(4);
    expect(toStockQuantity(3, "låda", mussel).qty).toBe(15);
    expect(toStockQuantity(2500, "g", cod).qty).toBe(2.5);
  });

  it("stoppar omräkning som skulle kräva gissad vikt", () => {
    expect(toStockQuantity(5, "st", cod).qty).toBeNull();
    expect(toStockQuantity(5, "kg", { unit: "st" }).qty).toBeNull();
  });

  it("priset följer samma enhet som kvantiteten", () => {
    expect(toStockUnitPrice(8, "st", oyster).price).toBe(8);
    expect(toStockUnitPrice(80, "kg", oyster).price).toBe(8); // 80 kr/kg × 0,1 kg = 8 kr/st
    expect(toStockUnitPrice(8, "st", { unit: "kg", weight_per_piece: 0.1 }).price).toBe(80);
  });

  it("lagervärde = antal × styckpris för styckprodukt", () => {
    const pieces = toStockQuantity(408, "st", oyster).qty!;
    const price = toStockUnitPrice(8, "st", oyster).price!;
    expect(stockValue(pieces, price)).toBe(3264);
    // Vikten finns kvar för transport men får aldrig användas till värdering.
    expect(stockQtyToKg(pieces, oyster)).toBe(40.8);
    expect(stockValue(stockQtyToKg(pieces, oyster)!, price)).not.toBe(3264);
  });
});

describe("inköpsbokföring i produktens enhet", () => {
  const products = [{ id: "p-oyster", ...oyster }, { id: "p-cod", ...cod }];
  const line = (over: Record<string, unknown> = {}) =>
    ({
      id: "l1",
      product_id: "p-oyster",
      product_name: "Ostron",
      quantity: 408,
      unit: "st",
      unit_price: 8,
      lot_numbers: ["A1"],
      ...over,
    }) as any;

  it("bokför ostron som antal med styckpris", () => {
    const plan = buildPostingPlan([line()], { products: products as any });
    expect(plan.blockers).toHaveLength(0);
    expect(plan.lots[0].quantityKg).toBe(408);
    expect(plan.lots[0].unitCost).toBe(8);
    expect(stockValue(plan.lots[0].quantityKg, plan.lots[0].unitCost)).toBe(3264);
  });

  it("styckvara levererad i kilo blir antal och styckpris", () => {
    const plan = buildPostingPlan(
      [line({ quantity: 40.8, unit: "kg", unit_price: 80, line_total: 3264 })],
      { products: products as any },
    );
    expect(plan.blockers).toHaveLength(0);
    expect(plan.lots[0].quantityKg).toBe(408);
    expect(plan.lots[0].unitCost).toBe(8);
  });

  it("viktvara bokförs i kilo med kilopris", () => {
    const plan = buildPostingPlan(
      [line({ product_id: "p-cod", quantity: 12, unit: "kg", unit_price: 95 })],
      { products: products as any },
    );
    expect(plan.lots[0].quantityKg).toBe(12);
    expect(plan.lots[0].unitCost).toBe(95);
  });

  it("kvantitetsomräkningen exponeras med enhet", () => {
    expect(quantityToStockUnit(line(), products[0] as any)).toMatchObject({ qty: 408, unit: "st" });
  });
});
