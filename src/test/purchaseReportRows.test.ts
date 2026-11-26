import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { collectPurchasePages } from "@/lib/purchaseReportRows";

describe("purchase report pagination", () => {
  it("includes today's 15 lines after 1639 older lines", async () => {
    const source = Array.from({ length: 1654 }, (_, id) => ({ id, report: id < 1639 ? "older" : "today" }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1), error: null,
    }));
    const rows = await collectPurchasePages(fetchPage);
    expect(rows).toHaveLength(1654);
    expect(rows.filter(row => row.report === "today")).toHaveLength(15);
    expect(fetchPage).toHaveBeenLastCalledWith(1500, 1999);
  });

  it("does not report partial data as success if a later page fails", async () => {
    const error = new Error("page failed");
    await expect(collectPurchasePages(async from => ({
      data: from === 0 ? Array.from({ length: 500 }, (_, id) => id) : null,
      error: from === 0 ? null : error,
    }))).rejects.toThrow("page failed");
  });

  it("reads the terminal empty page for an exact full page", async () => {
    const fetchPage = vi.fn(async (from: number) => ({
      data: from === 0 ? Array.from({ length: 500 }, (_, id) => id) : [], error: null,
    }));
    expect(await collectPurchasePages(fetchPage)).toHaveLength(500);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});