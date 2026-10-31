import { describe, expect, it } from "vitest";
import { buildBlocks } from "../../supabase/functions/report-email/blocks";

describe("email correction persistence and rendering", () => {
  it("saves daily purchase facts and displays a late invoice as a correction", async () => {
    const fixtures: Record<string, unknown> = {
      stores: [{ id: "gbg", name: "Göteborg", region: "vast", unit_type: "butik" }],
      daily_reports: [], margin_targets: null, customer_orders: [], fortnox_supplier_invoices: [], purchase_reports: [],
      fortnox_vouchers: [{ legal_entity_code: "fsab-se", voucher_series: "A", voucher_number: 1,
        transaction_date: "2026-10-06", description: "Inköp", rows: [{ Account: 4010, Debit: 120, Credit: 0 }] }],
      report_email_runs: { report_date: "2026-10-06", facts: { goteborg: { inkop_per_dag: { "2026-10-06": 100 } } } },
    };
    const db = { from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "gte", "lte", "lt", "not", "order", "limit"]) q[method] = () => q;
      q.maybeSingle = () => q;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: fixtures[table] ?? [], error: null });
      return q;
    } };
    const result = await buildBlocks(db, "2026-10-05", "2026-10-07", "2026-10-07");
    expect(result.facts.goteborg.inkop_per_dag["2026-10-06"]).toBe(120);
    expect(result.html).toContain("rättad: 120,00 kr (tidigare 100,00 kr, ändring +20,00 kr)");
    expect(result.facts.goteborg.inkop_brutto).toBe(120);
  });
});