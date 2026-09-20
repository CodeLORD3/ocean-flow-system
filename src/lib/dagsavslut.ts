import { supabase } from "@/integrations/supabase/client";

/**
 * Dagens avslut för en butik: finns dagsrapport och godkänd inventering för
 * dagen? Används både av påminnelsen och av stämpelklockan vid utstämpling.
 */
export interface DagsavslutStatus {
  dag: string;
  dagsrapport_klar: boolean;
  inventering_klar: boolean;
}

export async function dagsavslutStatus(
  storeId?: string | null,
  dag?: string,
): Promise<DagsavslutStatus | null> {
  if (!storeId) return null;
  const { data, error } = await (supabase as any).rpc("dagsavslut_status", {
    _store_id: storeId,
    _day: dag ?? null,
  });
  if (error || !data) return null;
  return data as DagsavslutStatus;
}

/** Klartext om något saknas för dagen — annars null. */
export function dagsavslutText(status: DagsavslutStatus | null | undefined): string | null {
  if (!status) return null;
  const saknas: string[] = [];
  if (!status.dagsrapport_klar) saknas.push("dagsrapport");
  if (!status.inventering_klar) saknas.push("inventering");
  if (saknas.length === 0) return null;
  if (saknas.length === 2) return "Dagsrapport och inventering saknas för i dag.";
  return `${saknas[0] === "dagsrapport" ? "Dagsrapport" : "Inventering"} saknas för i dag.`;
}
