import { describe, it, expect } from "vitest";
import { translateUiText } from "@/lib/staffPageTranslate";

describe("sidöversättning", () => {
  it("översätter gränssnittstext", () => {
    expect(translateUiText("Spara", "en")).toBe("Save");
  });
  it("lämnar produktnamn orörda", () => {
    expect(translateUiText("Branteviksill 2hg", "ti")).toBe("Branteviksill 2hg");
  });
  it("svenska ändras aldrig", () => {
    expect(translateUiText("Spara", "sv")).toBe("Spara");
  });
});
