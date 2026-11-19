import { describe, expect, it } from "vitest";
import { buildPaxml } from "../../supabase/functions/_shared/paxml";

describe("PAXml 2.2 med timlön", () => {
  const xml = buildPaxml({
    createdAt: "2026-11-19T15:00:00.000Z",
    lines: [
      { anstid: "023", code: "ARB", kind: "attendance", date: "2026-11-02", quantity: 8, extent_pct: null, unit_amount: null, cost_center: null },
      { anstid: "023", code: "TJL", kind: "absence", date: "2026-10-24", quantity: 10, extent_pct: 100, unit_amount: -146.65, cost_center: null },
    ],
    persons: [
      { anstid: "023", first_name: "Vilma", last_name: "Gunnarsson", hourly: [{ from: "2026-11-01", rate: 180 }] },
      { anstid: "11", first_name: "Erik", last_name: "Franzen", hourly: [] },
    ],
  });

  it("skriver timlönen 180 kr från 1 november på Vilma", () => {
    expect(xml).toContain('<person anstid="023"><fornamn>Vilma</fornamn><efternamn>Gunnarsson</efternamn><lonform>TIM</lonform><timlon datum="2026-11-01">180.00</timlon></person>');
  });

  it("tar inte med månadsavlönade i timlönelistan", () => {
    expect(xml).not.toContain('anstid="11"');
  });

  it("skriver arbetade timmar som tidtrans", () => {
    expect(xml).toContain('<tidtrans anstid="023"><tidkod>ARB</tidkod><datum>2026-11-02</datum><timmar>8.00</timmar></tidtrans>');
  });
});
