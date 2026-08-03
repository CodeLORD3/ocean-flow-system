import { describe, it, expect } from "vitest";
import {
  roundUpToAllowedPrice,
  calcDetailPrice,
  allocateRawCost,
  batchMargin,
} from "@/lib/filletMath";

describe("rounding", () => {
  it("rounds up", () => {
    expect(roundUpToAllowedPrice(143.2)).toBe(149);
    expect(roundUpToAllowedPrice(150.1)).toBe(179);
    expect(roundUpToAllowedPrice(180)).toBe(198);
    expect(roundUpToAllowedPrice(12)).toBe(19);
  });
  it("prices with margin >= target", () => {
    const r = calcDetailPrice({
      purchasePricePerKg: 100,
      totalYieldPct: 40,
      surchargePerKg: 35,
      targetMarginPct: 45,
      marginWeight: 1,
      vatPct: 6,
    });
    expect(r.rawCostPerKg).toBe(250);
    expect(r.marginOnRawPct).toBeGreaterThanOrEqual(45);
    expect(r.marginInclWorkPct).toBeLessThan(r.marginOnRawPct);
  });
});

describe("allocateRawCost", () => {
  it("fördelar jämnt per kilo, oberoende av marginalvikt", () => {
    const details = [
      { qtyKg: 20, marginWeight: 1.4 },
      { qtyKg: 15, marginWeight: 1 },
      { qtyKg: 12, marginWeight: 0.6 },
    ];
    const costs = allocateRawCost(details, 60, 100); // 6000 kr / 47 kg
    expect(costs[0]).toBeCloseTo(127.66, 1);
    expect(costs[1]).toBeCloseTo(127.66, 1);
    expect(costs[2]).toBeCloseTo(127.66, 1);
    // total återfördelad kostnad = partiets kostnad
    const total = details.reduce((s, d, i) => s + d.qtyKg * costs[i], 0);
    expect(total).toBeCloseTo(6000, 2);
  });

  it("en enda detalj = inköpspris / utbyte", () => {
    const [c] = allocateRawCost([{ qtyKg: 40, marginWeight: 1.4 }], 100, 100);
    expect(c).toBeCloseTo(250, 6);
  });
});

/**
 * Partiets samlade marginal (inklusive arbete) får inte avvika mer än
 * 5 procentenheter från regionens marginalmål.
 */
describe("partiets marginal mot mål", () => {
  const regions: { label: string; target: number }[] = [
    { label: "Väst", target: 55 },
    { label: "Öst", target: 45 },
  ];

  const details = [
    { name: "rygg", qtyKg: 20, marginWeight: 1.4, surcharge: 12 },
    { name: "mellan", qtyKg: 15, marginWeight: 1.0, surcharge: 12 },
    { name: "slag", qtyKg: 12, marginWeight: 0.6, surcharge: 8 },
  ];
  const purchasePricePerKg = 60;
  const rawQtyKg = 100;

  for (const r of regions) {
    it(`håller sig inom 5 pp från målet ${r.target} % (${r.label})`, () => {
      const costs = allocateRawCost(details, purchasePricePerKg, rawQtyKg);
      const rawPrices: number[] = [];
      const lines = details.map((d, i) => {
        const p = calcDetailPrice({
          purchasePricePerKg,
          totalYieldPct: (d.qtyKg / rawQtyKg) * 100,
          surchargePerKg: d.surcharge,
          targetMarginPct: r.target,
          marginWeight: d.marginWeight,
          vatPct: 12,
          rawCostOverride: costs[i],
        });
        rawPrices.push(p.priceExVatRaw);
        return { qty: d.qtyKg, priceExVat: p.priceExVat, surchargePerKg: d.surcharge };
      });

      // Före prisavrundning ska partiet landa på målet inom 5 procentenheter.
      const bRaw = batchMargin({
        purchasePricePerKg,
        rawQuantity: rawQtyKg,
        lines: lines.map((l, i) => ({ ...l, priceExVat: rawPrices[i] })),
      });
      expect(Math.abs(bRaw.marginInclWorkPct - r.target)).toBeLessThanOrEqual(5);

      // Efter avrundning uppåt till tillåtna prispunkter får marginalen aldrig
      // falla under målet minus 5 pp (avrundningen kan bara lyfta den).
      const b = batchMargin({ purchasePricePerKg, rawQuantity: rawQtyKg, lines });
      expect(b.marginInclWorkPct).toBeGreaterThanOrEqual(r.target - 5);
    });
  }
});
