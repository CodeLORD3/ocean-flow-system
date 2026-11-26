import { supabase } from "@/integrations/supabase/client";

/** Stay below the API row cap and never return a silently truncated list. */
export async function collectPurchasePages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const pageSize = 500;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export function fetchPurchaseReportLines() {
  return collectPurchasePages((from, to) =>
    supabase.from("purchase_report_lines").select("*")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to),
  );
}

export function fetchPurchaseReports(archived: boolean) {
  return collectPurchasePages((from, to) => {
    const query = supabase.from("purchase_reports").select("*");
    const filtered = archived
      ? query.not("archived_at", "is", null)
      : query.is("archived_at", null);
    return filtered.order(archived ? "archived_at" : "created_at", { ascending: false })
      .order("id", { ascending: false }).range(from, to);
  });
}