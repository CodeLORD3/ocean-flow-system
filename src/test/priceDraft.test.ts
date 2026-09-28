import { describe, expect, it } from "vitest";
import { parsePriceDraft, roundHalf, stopReason } from "@/lib/priceDraft";

const md = `Förslag

| SKU | nytt pris (kr inkl. moms) | giltigt från |
|---|---|---|
| LAX-01 | 329,00 | 2026-10-01 |
|  | 99 | 2026-10-01 |
| TORSK | abc | 2026-10-01 |
| SEJ | 149 kr | 1/10 |
| \`KOLJA\` | 1 249,50 | 2026-10-05 |

Slut`;

describe("pris-utkast", () => {
  it("tolkar giltiga rader och markerar fel", () => {
    const { rows, tableFound } = parsePriceDraft(md);
    expect(tableFound).toBe(true);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ sku: "LAX-01", price: 329, validFrom: "2026-10-01", error: null });
    expect(rows[1].error).toBe("SKU saknas");
    expect(rows[2].error).toBe("Pris kan inte tolkas");
    expect(rows[3].error).toMatch(/Datum/);
    expect(rows[4]).toMatchObject({ sku: "KOLJA", price: 1249.5, error: null });
  });
  it("saknar tabell", () => expect(parsePriceDraft("bara text").tableFound).toBe(false));
  it("stoppar stora ändringar och under inköp", () => {
    expect(stopReason(100, 130, null)).toMatch(/25/);
    expect(stopReason(100, 110, 105)).toMatch(/inköp/);
    expect(stopReason(100, 110, 50)).toBeNull();
  });
  it("avrundar CHF till 0,50", () => {
    expect(roundHalf(12.26)).toBe(12.5);
    expect(roundHalf(12.24)).toBe(12);
  });
});
