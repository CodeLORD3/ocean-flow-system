import { describe, expect, it } from "vitest";
import {
  itemWeekdaysToIso,
  legacyTemplateWeekdaysToIso,
  ruleForTemplate,
  ruleForTemplateItem,
} from "@/lib/weekdayRule";

describe("veckodagar till ISO", () => {
  it("räknar om söndag 0 till 7 och sorterar", () => {
    expect(legacyTemplateWeekdaysToIso([0, 3, 1])).toEqual([1, 3, 7]);
  });

  it("söndag ensam blir 7", () => {
    expect(legacyTemplateWeekdaysToIso([0])).toEqual([7]);
  });

  it("tom lista ger tom lista", () => {
    expect(legacyTemplateWeekdaysToIso([])).toEqual([]);
    expect(legacyTemplateWeekdaysToIso(null)).toEqual([]);
  });

  it("behåller måndag till lördag oförändrat", () => {
    expect(legacyTemplateWeekdaysToIso([2, 3, 4, 5, 6])).toEqual([2, 3, 4, 5, 6]);
  });

  it("uppgiftsrader är redan ISO och rensas från dubbletter", () => {
    expect(itemWeekdaysToIso([7, 7, 1])).toEqual([1, 7]);
  });
});

describe("regel med företräde", () => {
  it("radens egna dagar gäller före mallens", () => {
    expect(ruleForTemplateItem([1, 2], [0, 6])).toEqual({ type: "weekdays", days: [1, 2] });
  });

  it("mallens dagar används när raden saknar egna", () => {
    expect(ruleForTemplateItem(null, [0, 6])).toEqual({ type: "weekdays", days: [6, 7] });
  });

  it("dagligen när ingen har dagar", () => {
    expect(ruleForTemplateItem(null, [])).toEqual({ type: "daily" });
    expect(ruleForTemplate(null)).toEqual({ type: "daily" });
  });
});
