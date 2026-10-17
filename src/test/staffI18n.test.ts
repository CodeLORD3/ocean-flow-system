import { describe, it, expect, vi } from "vitest";
vi.mock("@/contexts/StaffAuthContext", () => ({ useStaffAuth: () => ({ staff: null }) }));
import { normalizeLang, staffT } from "@/lib/staffI18n";

describe("personalens språk", () => {
  it("Tigrinja på personen ger tigrinja", () => {
    expect(staffT("my_time", normalizeLang("ti"))).toBe("ናተይ ሰዓት");
  });
  it("okänt eller saknat språk ger svenska", () => {
    expect(normalizeLang(null)).toBe("sv");
    expect(normalizeLang("xx")).toBe("sv");
  });
});
