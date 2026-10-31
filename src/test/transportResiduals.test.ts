import { describe, it, expect, vi } from "vitest";
const calls = vi.hoisted(() => ({ select: vi.fn(), order: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const q = { select: (value: string) => { calls.select(value); return q; },
    eq: () => q, order: (value: string) => { calls.order(value); return q; },
    limit: async () => ({ data: [], error: null }) };
  return q;
} } }));
vi.mock("@/lib/stockLedger", () => ({}));
vi.mock("@/lib/locations", () => ({}));
import { fetchTransportResiduals } from "@/lib/receivingCorrections";
it("queries the existing shop order delivery field", async () => {
  await fetchTransportResiduals();
  expect(calls.select).toHaveBeenCalledWith("id, store_id, desired_delivery_date, stores(name)");
  expect(calls.order).toHaveBeenCalledWith("desired_delivery_date");
});