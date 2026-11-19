import { describe, it, expect } from "vitest";
import { employerContribution, type ContributionRule } from "../../supabase/functions/_shared/employerContribution";

const rules: ContributionRule[] = [
  { legal_entity_id: "fsab-se", valid_from: "2026-01-01", valid_to: null, birth_year_from: null, birth_year_to: 1958, salary_cap: null, contribution_rate: "10.21" },
  { legal_entity_id: "fsab-se", valid_from: "2026-04-01", valid_to: "2027-09-30", birth_year_from: 2003, birth_year_to: 2007, salary_cap: "25000", contribution_rate: "20.81" },
  { legal_entity_id: "fsab-se", valid_from: "2026-01-01", valid_to: null, birth_year_from: null, birth_year_to: null, salary_cap: null, contribution_rate: "31.42" },
];
const ctx = { legalEntityId: "fsab-se", from: "2026-10-16", to: "2026-11-15" };

describe("arbetsgivaravgift", () => {
  it("66 år (född 1960) ger 31,42 %, född 1958 ger 10,21 %", () => {
    expect(employerContribution(30000, 1960, rules, ctx).rate).toBe(31.42);
    expect(employerContribution(30000, 1958, rules, ctx).rate).toBe(10.21);
  });
  it("45 år ger 31,42 %", () => {
    expect(employerContribution(40000, 1981, rules, ctx).amount).toBe(12568);
  });
  it("20 år med 30 000 kr: 20,81 % på 25 000 och 31,42 % på 5 000", () => {
    expect(employerContribution(30000, 2006, rules, ctx).amount).toBe(6773.5);
  });
  it("saknat födelseår ger 31,42 %", () => {
    expect(employerContribution(10000, null, rules, ctx).rate).toBe(31.42);
  });
});
