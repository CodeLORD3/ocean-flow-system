import { describe, expect, it } from "vitest";
import { fixedSalaryForPeriod, hourlyBaseOn, wageOn } from "../../supabase/functions/_shared/employmentWages";

// Vilma: månadslön 25 000 kr, timlön 180 kr från 1 november. Löneperiod 16 okt–15 nov (31 dagar).
const vilmaEmp = { pay_type: "hourly", monthly_salary: null, hourly_rate: 180 };
const vilmaWages = [
  { first_day: "2025-11-16", pay_type: "monthly", monthly_salary: 25000, hourly_rate: null },
  { first_day: "2026-11-01", pay_type: "hourly", monthly_salary: null, hourly_rate: 180 },
];

describe("lönebyte mitt i perioden", () => {
  it("ger månadslön till och med 31 oktober och timlön 180 kr från 1 november", () => {
    expect(wageOn(vilmaEmp, vilmaWages, "2026-10-31").pay_type).toBe("monthly");
    expect(wageOn(vilmaEmp, vilmaWages, "2026-11-01")).toEqual({ pay_type: "hourly", monthly_salary: 0, hourly_rate: 180 });
    expect(hourlyBaseOn(vilmaEmp, vilmaWages, "2026-11-05")).toBe(180);
  });

  it("ger månadslön för 16 av periodens 31 dagar", () => {
    expect(fixedSalaryForPeriod(vilmaEmp, vilmaWages, "2026-10-16", "2026-11-15")).toBeCloseTo((25000 * 16) / 31, 2);
  });

  it("ger ingen månadslön perioden efter bytet", () => {
    expect(fixedSalaryForPeriod(vilmaEmp, vilmaWages, "2026-11-16", "2026-12-15")).toBe(0);
  });

  it("ger hela månadslönen när ingen lön byts i perioden", () => {
    expect(fixedSalaryForPeriod({ pay_type: "monthly", monthly_salary: 23000, hourly_rate: null }, [], "2026-10-16", "2026-11-15")).toBe(23000);
  });
});
