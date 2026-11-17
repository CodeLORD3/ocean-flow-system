import { describe, it, expect } from "vitest";
import { buildWeekdaySuggestion } from "@/lib/orderSuggestion";

const wed = new Date("2026-11-18T12:00:00"); // onsdag
const order = (date: string, lines: [string, number][], status = "Levererad") => ({
  status,
  desired_delivery_date: date,
  shop_order_lines: lines.map(([product_id, quantity_ordered]) => ({ product_id, quantity_ordered, unit: "KG" })),
});

describe("förslag från samma veckodag förra veckan", () => {
  it("väljer onsdagen veckan innan, inte en senare annan dag", () => {
    const s = buildWeekdaySuggestion([order("2026-11-11", [["lax", 5]]), order("2026-11-13", [["torsk", 3]])], wed);
    expect(s?.date).toBe("2026-11-11");
    expect(s?.exactLastWeek).toBe(true);
    expect(s?.lines).toEqual([{ product_id: "lax", quantity: 5, unit: "KG" }]);
  });

  it("räknar aldrig avbrutna ordrar", () => {
    const s = buildWeekdaySuggestion([order("2026-11-11", [["lax", 5]], "Avbruten"), order("2026-11-04", [["sill", 2]])], wed);
    expect(s?.date).toBe("2026-11-04");
    expect(s?.exactLastWeek).toBe(false);
  });

  it("slår ihop flera ordrar samma leveransdag per vara", () => {
    const s = buildWeekdaySuggestion([order("2026-11-11", [["lax", 2.5]]), order("2026-11-11", [["lax", 1.2], ["räkor", 4]])], wed);
    expect(s?.lines.find((l) => l.product_id === "lax")?.quantity).toBe(3.7);
    expect(s?.lines).toHaveLength(2);
  });

  it("går högst 4 veckor bakåt", () => {
    expect(buildWeekdaySuggestion([order("2026-10-14", [["lax", 5]])], wed)).toBeNull();
  });
});
