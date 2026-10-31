import { describe, it, expect } from "vitest";
import { createPageTranslationSession } from "@/lib/pageTranslationSession";

describe("translation lifecycle", () => {
  it("restores text and attributes when leaving another language", () => {
    const root = document.createElement("div");
    root.innerHTML = '<span>Spara</span><input placeholder="Spara" title="Spara" aria-label="Spara">';
    const session = createPageTranslationSession("en");
    session.translate(root);
    expect(root.textContent).toBe("Save");
    expect(root.querySelector("input")?.placeholder).toBe("Save");
    session.restore();
    expect(root.textContent).toBe("Spara");
    for (const attr of ["placeholder", "title", "aria-label"]) expect(root.querySelector("input")?.getAttribute(attr)).toBe("Spara");
  });
  it("does not restore over a newer React value or change product names", () => {
    const root = document.createElement("div");
    root.innerHTML = '<span>Spara</span><p>Branteviksill 2hg</p>';
    const session = createPageTranslationSession("en");
    session.translate(root);
    const node = root.querySelector("span")?.firstChild;
    if (!node) throw new Error("missing fixture");
    node.nodeValue = "Ny text";
    session.restore();
    expect(root.textContent).toBe("Ny textBranteviksill 2hg");
  });
});