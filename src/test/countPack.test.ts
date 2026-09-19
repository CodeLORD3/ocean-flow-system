import { describe, expect, it } from "vitest";
import { jarsText, jarsToKg, kgToJars, packMode } from "@/lib/countPack";

describe("räkning av burkvaror", () => {
  it("burkar är egna varor — räkningen sker i varans enhet", () => {
    expect(packMode({ category: "Såser & Röror", unit: "st", weightPerPiece: 0.1 }, "CH").mode).toBe(
      "kg",
    );
    expect(packMode({ category: "Såser & Röror", unit: "kg", weightPerPiece: 0.1 }, "CH").mode).toBe(
      "kg",
    );
    expect(packMode({ category: "Såser & Röror", unit: "kg", weightPerPiece: 0.1 }, "SE").mode).toBe(
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
