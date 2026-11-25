import { describe, it, expect } from "vitest";
import { breakForShift, defaultBreakMinutes } from "@/lib/schedule";
describe("rast vid schemaläggning", () => {
  it("under 5 h ger 0 min", () => expect(defaultBreakMinutes("08:00", "12:59")).toBe(0));
  it("exakt 5 h ger 30 min", () => expect(defaultBreakMinutes("08:00", "13:00")).toBe(30));
  it("över midnatt räknas", () => expect(defaultBreakMinutes("22:00", "04:00")).toBe(30));
  it("pass före 2026-11-26 behåller sin rast", () => expect(breakForShift("2026-11-25", "08:00", "18:00", 0)).toBe(0));
  it("pass från 2026-11-26 följer regeln", () => expect(breakForShift("2026-11-26", "08:00", "12:00", 30)).toBe(0));
});
