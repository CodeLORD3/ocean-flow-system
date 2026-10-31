import { describe, expect, it } from "vitest";
import { purchaseCorrections } from "../../supabase/functions/report-email/purchaseCorrections";

describe("purchase corrections", () => {
  it("marks a changed previously reported amount once", () => {
    expect(purchaseCorrections({ "2026-10-06": 120 }, { "2026-10-06": 100 }, "2026-10-06"))
      .toEqual([{ date: "2026-10-06", previous: 100, current: 120, difference: 20 }]);
  });
  it("does not flag newly reported days or unchanged amounts", () => {
    expect(purchaseCorrections({ "2026-10-06": 100, "2026-10-07": 120 }, { "2026-10-06": 100, "2026-10-07": null }, "2026-10-06")).toEqual([]);
  });
  it("distinguishes missing data from zero instead of silently estimating it", () => {
    expect(purchaseCorrections({ "2026-10-06": 0 }, { "2026-10-06": null }, "2026-10-06"))
      .toEqual([{ date: "2026-10-06", previous: null, current: 0, difference: null }]);
  });
});