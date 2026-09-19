import { describe, expect, it } from "vitest";
import { jarsText, jarsToKg, kgToJars, packMode } from "@/lib/countPack";

describe("burkräkning", () => {
  it("såser i schweizisk butik räknas i burkar", () => {
    const m = packMode({ category: "Såser & Röror", unit: "kg", weightPerPiece: 0.1 }, "CH");
    expect(m.mode).toBe("burk");
    expect(m.packKg).toBe(0.1);
  });

  it("saknad burkvikt blir 1 hg", () => {
    const m = packMode({ category: "Såser, Röror & Sylt", unit: "kg", weightPerPiece: null }, "ch");
    expect(m.mode).toBe("burk");
    expect(m.packKg).toBe(0.1);
  });

  it("svensk butik räknar kilo som förut", () => {
    expect(packMode({ category: "Såser & Röror", unit: "kg", weightPerPiece: 0.1 }, "SE").mode).toBe(
      "kg",
    );
  });

  it("andra varugrupper påverkas inte", () => {
    expect(packMode({ category: "Färsk fisk", unit: "kg", weightPerPiece: 0.2 }, "CH").mode).toBe(
      "kg",
    );
  });

  it("styckvaror räknas i stycken", () => {
    expect(packMode({ category: "Såser & Röror", unit: "st", weightPerPiece: 0.1 }, "CH").mode).toBe(
      "kg",
    );
  });

  it("räknar om mellan burkar och kilo", () => {
    expect(jarsToKg(10, 0.1)).toBe(1);
    expect(kgToJars(1, 0.1)).toBe(10);
    expect(jarsText(0.3, 0.1)).toBe("3 burkar (0,3 kg)");
    expect(jarsText(0.1, 0.1)).toBe("1 burk (0,1 kg)");
  });
});
