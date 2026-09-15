import { describe, expect, it } from "vitest";
import { computeNeedForDay, laborBudget } from "@/hooks/useWeekdayStaffNeed";

const margins = { vatPct: 6, grossMarginPct: 35, otherCostPct: 15, profitTargetPct: 10 };

describe("lönebudget ur kalkylen", () => {
  it("räknar bort moms, varukostnad, övriga kostnader och vinstkrav", () => {
    const { net, gross, budget } = laborBudget(42000, margins);
    expect(Math.round(net)).toBe(39623);
    expect(Math.round(gross)).toBe(13868);
    // 35 % − (15 % + 10 %) = 10 % av nettot
    expect(Math.round(budget)).toBe(Math.round(net * 0.1));
  });

  it("ger timmar och personer ur budgeten och timkostnaden", () => {
    const need = computeNeedForDay(42000, 5, 220, margins, null, 8);
    expect(need.source).toBe("omsättning");
    expect(need.hours).toBeCloseTo(18, 0);
    expect(need.people).toBe(2);
  });

  it("visar utan utrymme när kalkylen inte lämnar plats", () => {
    const need = computeNeedForDay(42000, 5, 220, { ...margins, profitTargetPct: 30 }, null, 8);
    expect(need.source).toBe("utan utrymme");
    expect(need.hours).toBe(0);
  });

  it("ger inget behov utan försäljningsunderlag", () => {
    expect(computeNeedForDay(null, 0, 220, margins, null, null).hours).toBeNull();
  });
});
