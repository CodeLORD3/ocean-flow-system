import { describe, it, expect } from "vitest";
import { roundUpToAllowedPrice, calcDetailPrice } from "@/lib/filletMath";
describe("rounding", () => {
  it("rounds up", () => {
    expect(roundUpToAllowedPrice(143.2)).toBe(149);
    expect(roundUpToAllowedPrice(150.1)).toBe(179);
    expect(roundUpToAllowedPrice(180)).toBe(198);
    expect(roundUpToAllowedPrice(12)).toBe(19);
  });
  it("prices with margin >= target", () => {
    const r = calcDetailPrice({purchasePricePerKg:100,totalYieldPct:40,surchargePerKg:35,targetMarginPct:45,marginWeight:1,vatPct:6});
    expect(r.rawCostPerKg).toBe(250);
    expect(r.actualMarginPct).toBeGreaterThanOrEqual(45);
  });
});
