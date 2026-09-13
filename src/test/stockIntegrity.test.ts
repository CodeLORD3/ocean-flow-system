import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Kontroller som håller lagret tätt. Läser koden som text: syftet är att de
 * rättade reglerna inte kan tappas bort igen vid framtida ändringar.
 */
const read = (p: string) => readFileSync(p, "utf8");

describe("lagerbokföringens regler", () => {
  it("återlämnad kundorderrad går åter i lager, inte ett nytt uttag", () => {
    const src = read("src/lib/customerOrders.ts");
    const reverse = src.slice(src.indexOf("export async function reverseLine"));
    const body = reverse.slice(0, reverse.indexOf("\n}\n"));
    const afterWaste = body.slice(body.indexOf("params.asWaste"));
    // Efter svinngrenen får inget uttag ("kundorder") bokföras.
    expect(afterWaste.includes('movementType: "kundorder"')).toBe(false);
    expect(afterWaste.includes('movementType: "justering"')).toBe(true);
  });

  it("utleverans utan täckning stoppas med ett begripligt meddelande", () => {
    const src = read("src/lib/stockTransfer.ts");
    expect(src).toContain("Grossistlagret räcker inte till hela ordern");
    // Täckningskontrollen sker före första rörelsen.
    expect(src.indexOf("Täckningskontroll före första rörelsen")).toBeLessThan(
      src.indexOf("await transferStock("),
    );
  });

  it("saknad lagerplats stoppar bokföringen istället för att gå tyst", () => {
    const src = read("src/lib/stockTransfer.ts");
    expect(src).not.toContain('console.error("Leveranslager not found');
    expect(src).not.toContain('console.error("Butikslager not found');
    expect(src).toContain("Butiken saknar transportlager");
  });

  it("kassan slår upp butikslagret på nivå, aldrig på namn", () => {
    for (const f of [
      "supabase/functions/_shared/nimpos.ts",
      "supabase/functions/_shared/sumup-process.ts",
    ]) {
      const src = read(f);
      const fn = src.slice(src.indexOf("export async function salesLocation"));
      const body = fn.slice(0, fn.indexOf("\n}\n"));
      expect(body).toContain('.eq("location_type", "butik")');
      expect(body).toContain('.eq("active", true)');
      expect(body).not.toContain("örsäljningslager");
    }
  });

  it("varje rörelsetyp i historiken har ett svenskt namn", async () => {
    const { movementLabel } = await import("@/hooks/useStockMovements");
    expect(movementLabel("kundorder_reversering")).toBe("Kundbeställning återförd");
    expect(movementLabel("inventering")).toBe("Inventering");
    // Okända koder visas aldrig som rå kod med understreck.
    expect(movementLabel("nagot_nytt")).toBe("Nagot nytt");
  });

  it("inventeringens låsning bokför räknad skillnad och visar ej räknade rader", () => {
    const src = read("src/pages/StockCount.tsx");
    expect(src).toContain('movementType: "inventering"');
    expect(src).toContain("rader med saldo är inte räknade");
    expect(src).toContain("Skillnad mot lagret");
  });
});
