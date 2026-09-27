import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const UPPGIFT_STATUS = ["öppen", "pågår", "väntar på vd", "klar"] as const;
export const UTKAST_STATUS = ["utkast", "redigerat", "godkänt", "skickat", "avslaget"] as const;

export interface AiUppgift {
  id: number;
  skapad: string | null;
  skapad_av: string | null;
  tilldelad: string | null;
  uppgift: string;
  prioritet: number | null;
  deadline: string | null;
  status: string | null;
  resultat: string | null;
  underlag: string | null;
  uppdaterad: string | null;
}

export interface AiUtkast {
  id: number;
  skapad: string | null;
  skapad_av: string | null;
  typ: string | null;
  titel: string;
  mottagare: string | null;
  kanal: string | null;
  innehall: string | null;
  bilaga_url: string | null;
  status: string | null;
  vd_kommentar: string | null;
  skickad: string | null;
  uppdaterad: string | null;
}

// Tabellerna är nya; typerna genereras separat, därför en lös klient här.
const db = supabase as unknown as { from: (t: string) => any };

export function useAiUtkast() {
  return useQuery({
    queryKey: ["ai_utkast"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db.from("ai_utkast").select("*").order("skapad", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiUtkast[];
    },
  });
}

export function useAttestCount() {
  return useQuery({
    queryKey: ["ai_utkast", "count"],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await db
        .from("ai_utkast")
        .select("id", { count: "exact", head: true })
        .in("status", ["utkast", "redigerat"]);
      if (error) return 0;
      return count ?? 0;
    },
  });
}

export function useUpdateAiUtkast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<AiUtkast> & { id: number }) => {
      const { error } = await db.from("ai_utkast").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_utkast"] }),
  });
}

export function useAiUppgifter() {
  return useQuery({
    queryKey: ["ai_uppgifter"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await db
        .from("ai_uppgifter")
        .select("*")
        .order("prioritet", { ascending: true })
        .order("skapad", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiUppgift[];
    },
  });
}

export function useSaveAiUppgift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: Partial<AiUppgift>) => {
      const q = id
        ? db.from("ai_uppgifter").update(patch).eq("id", id)
        : db.from("ai_uppgifter").insert(patch);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai_uppgifter"] }),
  });
}

export const fmtDateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" }) : "";
