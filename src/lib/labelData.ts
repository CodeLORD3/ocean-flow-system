import { supabase } from "@/integrations/supabase/client";

export interface BatchInfo {
  redskapskategori: string | null;
  upptinad: boolean;
  fangstomrade: string | null;
}

/**
 * Hämtar partiuppgifter för skyltunderlag/etiketter från senaste inleveransraden
 * per produkt, med produktens origin som fallback för fångstområdet.
 */
export async function fetchLatestBatchInfo(
  products: { id: string; origin?: string | null }[],
): Promise<Record<string, BatchInfo>> {
  const out: Record<string, BatchInfo> = {};
  for (const p of products) {
    out[p.id] = { redskapskategori: null, upptinad: false, fangstomrade: p.origin ?? null };
  }
  const ids = products.map((p) => p.id);
  if (ids.length === 0) return out;

  const { data } = await supabase
    .from("incoming_delivery_lines")
    .select("product_id, redskapskategori, upptinad, faktiskt_fangstomrade, incoming_deliveries(received_date)")
    .in("product_id", ids);

  const latest = new Map<string, { date: string; row: any }>();
  for (const row of (data ?? []) as any[]) {
    const date = row.incoming_deliveries?.received_date ?? "";
    const prev = latest.get(row.product_id);
    if (!prev || date >= prev.date) latest.set(row.product_id, { date, row });
  }

  for (const [productId, { row }] of latest) {
    const fallback = out[productId]?.fangstomrade ?? null;
    out[productId] = {
      redskapskategori: row.redskapskategori ?? null,
      upptinad: row.upptinad === true,
      fangstomrade: row.faktiskt_fangstomrade || fallback,
    };
  }
  return out;
}

/** Rader för skyltunderlag: ursprung, redskap och upptinad-märkning. */
export function batchInfoLines(info?: BatchInfo | null): string[] {
  if (!info) return [];
  const lines: string[] = [];
  if (info.fangstomrade) lines.push(info.fangstomrade);
  if (info.redskapskategori) lines.push(`Redskap: ${info.redskapskategori}`);
  if (info.upptinad) lines.push("Upptinad");
  return lines;
}
