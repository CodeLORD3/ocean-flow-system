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
