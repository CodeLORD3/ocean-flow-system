import { afterEach, describe, expect, it, vi } from "vitest";
import { buildOrderDocumentPdf, downloadOrderDocument } from "@/lib/orderDocumentPdf";

const order = {
  id: "test-order",
  stores: { name: "Testbutik" },
  desired_delivery_date: "2026-10-19",
  shop_order_lines: [{ products: { name: "Testvara", wholesale_price: 20 }, quantity_ordered: 5, quantity_delivered: 4, unit: "kg" }],
};

afterEach(() => vi.restoreAllMocks());

describe("order PDF delivery", () => {
  it("produces a PDF without changing the order", () => {
    const original = structuredClone(order);
    for (const kind of ["packing", "delivery"] as const) {
      const bytes = buildOrderDocumentPdf(order, kind).output("arraybuffer");
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(bytes.byteLength).toBeGreaterThan(1000);
    }
    expect(order).toEqual(original);
  });

  it("downloads directly without a popup and retains the URL until after the click", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(() => ({ matches: false })) });
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:order") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const popup = vi.spyOn(window, "open");
    try {
      await downloadOrderDocument(order, "packing");
      expect(click).toHaveBeenCalledOnce();
      expect(popup).not.toHaveBeenCalled();
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(30_000);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:order");
    } finally { vi.useRealTimers(); }
  });
});