import { describe, expect, it } from "vitest";
import { isScheduleOrderEligible, isPurchaseDeliveryEligible, stockholmDateKey } from "@/lib/purchaseOrderEligibility";

describe("purchase schedule order selection", () => {
  it("includes Ny and Pågående orders and excludes finished ones", () => {
    expect(isScheduleOrderEligible("Ny", false)).toBe(true);
    expect(isScheduleOrderEligible("Pågående", false)).toBe(true);
    for (const status of ["Packad", "Skickad", "Levererad", "Avbruten", "Arkiverad", "Öppen", "", null, undefined]) {
      expect(isScheduleOrderEligible(status, false)).toBe(false);
    }
  });

  it("preserves production's existing selection", () => {
    expect(isScheduleOrderEligible("Packad", true)).toBe(true);
    expect(isScheduleOrderEligible("Arkiverad", true)).toBe(false);
  });

  it("hides passed delivery dates, including the old dates in the screenshot", () => {
    for (const date of ["2026-08-14", "2026-09-02", "2026-09-10", "2026-10-20"]) {
      expect(isPurchaseDeliveryEligible(date, false, "2026-10-21")).toBe(false);
    }
    expect(isPurchaseDeliveryEligible("2026-10-21", false, "2026-10-21")).toBe(true);
    expect(isPurchaseDeliveryEligible("2026-10-22", false, "2026-10-21")).toBe(true);
    expect(isPurchaseDeliveryEligible("2026-08-14", true, "2026-10-21")).toBe(true);
  });

  it("uses Stockholm's date at midnight rather than UTC's date", () => {
    expect(stockholmDateKey(new Date("2026-10-21T22:15:00Z"))).toBe("2026-10-22");
  });
});