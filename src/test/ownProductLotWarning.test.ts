import { describe, it, expect, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { ownProductLotProblem } from "@/lib/ownProductLotWarning";

describe("varning vid plock av egen produkt", () => {
  it("varnar när egen produkt plockas utan parti", () => {
    expect(ownProductLotProblem({ isProductionItem: true, movementType: "overforing_ut", lotNumber: null })).toBe("utan_parti");
  });
  it("varnar för gamla PROD-20260915-partier", () => {
    expect(ownProductLotProblem({ isProductionItem: true, movementType: "kundorder", lotNumber: "PROD-20260915-007" })).toBe("gammalt_prod_parti");
  });
  it("varnar inte för ett riktigt parti", () => {
    expect(ownProductLotProblem({ isProductionItem: true, movementType: "forsaljning", lotNumber: "IL-2026-0100-01-01-OMV" })).toBeNull();
  });
  it("varnar inte för inköpta varor", () => {
    expect(ownProductLotProblem({ isProductionItem: false, movementType: "overforing_ut", lotNumber: null })).toBeNull();
  });
  it("varnar inte för svinn eller inventering", () => {
    expect(ownProductLotProblem({ isProductionItem: true, movementType: "svinn", lotNumber: null })).toBeNull();
  });
});
