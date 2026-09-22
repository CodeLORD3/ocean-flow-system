import { supabase } from "@/integrations/supabase/client";

/**
 * Dagens avslut för en butik: dagsrapport, inventering, beställning till
 * grossisten och inköp. Samma källa används av påminnelseraden högst upp,
 * notisklockan och stämpelklockan vid utstämpling.
 */
export interface DagsavslutStatus {
  dag: string;
  dagsrapport_klar: boolean;
  inventering_klar: boolean;
  grossistorder_klar?: boolean;
  inkop_klar?: boolean;
}

/** Minsta form som räcker för att räkna ut vad som saknas. */
export type DagsavslutLik = {
  dag?: string;
  dagsrapport_klar: boolean;
  inventering_klar: boolean;
  grossistorder_klar?: boolean;
  inkop_klar?: boolean;
};

export type DagsavslutNyckel = "dagsrapport" | "inventering" | "grossist" | "inkop";

export interface DagsavslutPost {
  nyckel: DagsavslutNyckel;
  etikett: string;
  klar: boolean;
  sida: string;
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

/** Alla fyra punkterna för dagen, i den ordning de visas. */
export function dagsavslutPoster(status: DagsavslutLik | null | undefined): DagsavslutPost[] {
  if (!status) return [];
  return [
    {
      nyckel: "dagsrapport",
      etikett: "Dagsrapport",
      klar: !!status.dagsrapport_klar,
      sida: "/dagsrapport",
    },
    {
      nyckel: "inventering",
      etikett: "Inventering",
      klar: !!status.inventering_klar,
      sida: "/inventory",
    },
    {
      nyckel: "grossist",
      etikett: "Beställning grossist",
      klar: status.grossistorder_klar !== false,
      sida: "/dagens-bestallning",
    },
    {
      nyckel: "inkop",
      etikett: "Inköp",
      klar: status.inkop_klar !== false,
      sida: "/purchase-schedule",
    },
  ];
}

/** Punkterna som saknas för dagen. */
export function dagsavslutSaknas(status: DagsavslutLik | null | undefined): DagsavslutPost[] {
  return dagsavslutPoster(status).filter((p) => !p.klar);
}

/** Klartext om något saknas för dagen — annars null. */
export function dagsavslutText(status: DagsavslutLik | null | undefined): string | null {
  const saknas = dagsavslutSaknas(status);
  if (saknas.length === 0) return null;
  const namn = saknas.map((p) => p.etikett.toLowerCase());
  if (namn.length === 1) return `${saknas[0].etikett} saknas för i dag.`;
  const sista = namn.pop();
  return `${namn.join(", ")} och ${sista} saknas för i dag.`;
}

/** Kvittera att inget behöver beställas eller köpas in i dag. */
export async function kvitteraDagsavslut(
  storeId: string,
  vad: "grossist" | "inkop",
  staffId?: string | null,
  staffName?: string | null,
  note?: string | null,
  dag?: string,
) {
  const { error } = await (supabase as any).from("dagsavslut_kvitteringar").insert({
    store_id: storeId,
    dag: dag ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }),
    vad,
    staff_id: staffId ?? null,
    staff_name: staffName ?? null,
    note: note ?? null,
  });
  if (error && !String(error.message).includes("duplicate")) throw error;
}

export interface DagsavslutKvittering {
  id: string;
  store_id: string;
  dag: string;
  vad: "grossist" | "inkop";
  staff_name: string | null;
  note: string | null;
  created_at: string;
}

export async function dagsavslutKvitteringar(storeId: string, dag?: string) {
  const d = dag ?? new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const { data, error } = await (supabase as any)
    .from("dagsavslut_kvitteringar")
    .select("*")
    .eq("store_id", storeId)
    .eq("dag", d);
  if (error) return [] as DagsavslutKvittering[];
  return (data ?? []) as DagsavslutKvittering[];
}
