import { describe, expect, it } from "vitest";
import { isScheduleOrderEligible } from "@/lib/purchaseOrderEligibility";

describe("purchase schedule order selection", () => {
  it("includes only Ny orders and excludes an order as soon as its status changes", () => {
    expect(isScheduleOrderEligible("Ny", false)).toBe(true);
    for (const status of ["Pågående", "Packad", "Skickad", "Levererad", "Avbruten", "Arkiverad", "Öppen", "", null, undefined]) {
      expect(isScheduleOrderEligible(status, false)).toBe(false);
    }
  });

  it("preserves production's existing selection", () => {
    expect(isScheduleOrderEligible("Packad", true)).toBe(true);
    expect(isScheduleOrderEligible("Arkiverad", true)).toBe(false);
  });
});