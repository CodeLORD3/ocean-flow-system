import { describe, expect, it } from "vitest";
import { netPay, preliminaryTax } from "@/lib/netPay";

describe("utbetalas till kontot", () => {
  it("tabell 32 kolumn 1: 30 000 kr ger 5 703 kr skatt enligt Skatteverket 2026", () => {
    expect(preliminaryTax(30000, 32, 1)).toBe(5703);
    expect(netPay(30000, 32, 1)).toBe(24297);
  });
  it("över tabellens tak räknas procentsatsen", () => {
    expect(preliminaryTax(80100, 32, 1)).toBe(Math.round(80100 * 0.32));
  });
  it("saknad skattetabell ger inget belopp", () => {
    expect(netPay(30000, null, 1)).toBeNull();
    expect(netPay(30000, "1", 1)).toBeNull();
  });
  it("sidoinkomst (Fortnox EXT) ger 30 % skatt oavsett tabell", () => {
    expect(preliminaryTax(10000, null, null, "EXT")).toBe(3000);
    expect(netPay(10000, null, null, null, "EXT")).toBe(7000);
  });
  it("ingen skatt (EJ) ger hela bruttot, studerande räknas inte här", () => {
    expect(netPay(10000, null, null, null, "EJ")).toBe(10000);
    expect(netPay(10000, 33, 1, null, "STU")).toBeNull();
  });
});
