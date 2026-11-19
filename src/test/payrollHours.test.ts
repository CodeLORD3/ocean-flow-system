import { describe, expect, it } from "vitest";
import { obHours, workedHours } from "@/lib/payrollHours";

describe("arbetad tid i Granska lön", () => {
  it("räknar inte OB-timmar ovanpå arbetad tid", () => {
    const lines = [
      { line_type: "ARB", quantity: 8 },
      { line_type: "OB4", quantity: 3.5 },
      { line_type: "ARB", quantity: 6 },
      { line_type: "OB1", quantity: 0.5 },
    ];
    expect(workedHours(lines)).toBe(14);
    expect(obHours(lines)).toBe(4);
  });

  it("räknar inte mertid eller frånvaro som arbetad tid", () => {
    const lines = [
      { line_type: "ARB", quantity: 9 },
      { line_type: "MER", quantity: 1 },
      { line_type: "VAB", quantity: 1 },
    ];
    expect(workedHours(lines)).toBe(9);
  });
});

describe("stämplad tid för månadsavlönade", () => {
  it("räknar samma stämpling på två enheter bara en gång", async () => {
    const { clockedHours } = await import("@/lib/payrollHours");
    const days = [
      { date: "2026-11-13", minutes: 600, first_in: "2026-11-13T06:00:00Z", last_out: "2026-11-13T16:00:00Z" },
      { date: "2026-11-13", minutes: 600, first_in: "2026-11-13T06:00:00Z", last_out: "2026-11-13T16:00:00Z" },
      { date: "2026-11-14", minutes: 480, first_in: "2026-11-14T07:00:00Z", last_out: "2026-11-14T15:00:00Z" },
    ];
    expect(clockedHours(days)).toBe(18);
  });
});

describe("bruttolön per person", () => {
  it("timlön × timmar plus bara OB-tilläggsdelen", async () => {
    const { grossPay } = await import("@/lib/payrollHours");
    const lines = [
      { line_type: "ARB", quantity: 10, note: null },
      { line_type: "OB4", quantity: 2, note: "OB 100 % enligt databasmotorn" },
      { line_type: "OB1", quantity: 2, note: "OB 50 % enligt databasmotorn" },
      { line_type: "VAB", quantity: 1, note: null },
    ];
    // 10 × 190 + 2 × 190 × 1,0 + 2 × 190 × 0,5 = 1 900 + 380 + 190
    expect(grossPay(lines, 190)).toBe(2470);
  });
});
