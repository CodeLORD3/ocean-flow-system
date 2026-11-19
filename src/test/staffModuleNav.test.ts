import { describe, expect, it } from "vitest";
import { staffItemOf, staffSectionOf, staffSectionsForSite } from "@/lib/staffModuleNav";

const sites = ["wholesale", "shop", "production"] as const;
const widest = () =>
  sites.map((s) => staffSectionsForSite(s, "admin")).sort((a, b) => b.flatMap((x) => x.items).length - a.flatMap((x) => x.items).length)[0];

describe("Personal & Schema – färre menyer", () => {
  it("admin har högst tio menyval", () => {
    expect(widest().flatMap((s) => s.items).length).toBeLessThanOrEqual(10);
  });
  it("Min profil ligger inte i personalmenyn", () => {
    expect(widest().flatMap((s) => s.items).some((i) => i.views.some((v) => v.url === "/profile"))).toBe(false);
  });
  it("Planering och Månad hör till menyvalet Schema", () => {
    const sections = widest();
    const section = staffSectionOf(sections, "/schedule-planner");
    expect(section?.key).toBe("schema");
    expect(staffItemOf(section, "/schedule")?.title).toBe("Schema");
  });
  it("Attest nås inifrån Granska lön", () => {
    const sections = widest();
    expect(staffItemOf(staffSectionOf(sections, "/attestations"), "/attestations")?.title).toBe("Granska lön");
  });
});
