import { describe, expect, it } from "vitest";
import { fixedSalaryForPeriod, hourlyBaseOn, hourlyRatesInPeriod, wageOn } from "../../supabase/functions/_shared/employmentWages";

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

  it("ger halva månadslönen, 12 500 kr, när timlönen börjar 1 november", () => {
    expect(fixedSalaryForPeriod(vilmaEmp, vilmaWages, "2026-10-16", "2026-11-15")).toBe(12500);
  });

  it("räknar per dag inom halvan när bytet sker mitt i en halva", () => {
    const wages = [
      { first_day: "2025-01-01", pay_type: "monthly", monthly_salary: 31000, hourly_rate: null },
      { first_day: "2026-11-06", pay_type: "hourly", monthly_salary: null, hourly_rate: 180 },
    ];
    // 16–31 okt = halva lönen (15 500), 1–5 nov = 5 av 15 dagar av andra halvan.
    expect(fixedSalaryForPeriod(vilmaEmp, wages, "2026-10-16", "2026-11-15")).toBeCloseTo(15500 + (15500 * 5) / 15, 2);
  });

  it("ger ingen månadslön perioden efter bytet", () => {
    expect(fixedSalaryForPeriod(vilmaEmp, vilmaWages, "2026-11-16", "2026-12-15")).toBe(0);
  });

  it("ger hela månadslönen när ingen lön byts i perioden", () => {
    expect(fixedSalaryForPeriod({ pay_type: "monthly", monthly_salary: 23000, hourly_rate: null }, [], "2026-10-16", "2026-11-15")).toBe(23000);
  });
});

describe("timlön i Excel och PAXml", () => {
  it("Vilma: timlön 180 kr från 1 november, ingen timlön under månadslönedagarna", () => {
    expect(hourlyRatesInPeriod(vilmaEmp, vilmaWages, "2026-10-16", "2026-11-15")).toEqual([{ from: "2026-11-01", rate: 180 }]);
  });

  it("Adam: 175 kr/h hela perioden", () => {
    expect(hourlyRatesInPeriod({ pay_type: "hourly", monthly_salary: null, hourly_rate: 175 }, [], "2026-10-16", "2026-11-15")).toEqual([{ from: "2026-10-16", rate: 175 }]);
  });

  it("månadsavlönad har ingen timlön", () => {
    expect(hourlyRatesInPeriod({ pay_type: "monthly", monthly_salary: 35000, hourly_rate: null }, [], "2026-10-16", "2026-11-15")).toEqual([]);
  });
});
