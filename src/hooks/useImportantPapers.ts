import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Typer av papper som samlas under Ekonomi → Viktiga papper. */
export const PAPER_TYPES = [
  { value: "kvitto", label: "Kvitton", singular: "Kvitto", color: "#16a34a" },
  { value: "foljesedel", label: "Följesedlar", singular: "Följesedel", color: "#0ea5e9" },
  { value: "faktura", label: "Fakturor", singular: "Faktura", color: "#f59e0b" },
  { value: "brev", label: "Brev", singular: "Brev", color: "#7c3aed" },
  { value: "anteckning", label: "Anteckningar", singular: "Anteckning", color: "#64748b" },
] as const;

export type PaperType = (typeof PAPER_TYPES)[number]["value"];

export function paperTypeInfo(value: string | null | undefined) {
  return PAPER_TYPES.find((t) => t.value === value) ?? PAPER_TYPES[0];
}

export interface ImportantPaper {
  id: string;
  store_id: string | null;
  paper_type: string;
  title: string | null;
  company_name: string | null;
  paper_date: string | null;
  net_amount: number | null;
  vat_amount: number | null;
  gross_amount: number | null;
  currency: string;
  document_number: string | null;
  /** Betalsätt, används främst för kvitton: "kort" eller "kontant". */
  payment_method: string | null;
  description: string | null;
  tags: string[];
  file_url: string | null;
  file_name: string | null;
  file_mime: string | null;
  created_by: string | null;
  created_by_staff_id: string | null;
  created_at: string;
  /** Fylls i av hooken: namn och profilbild på den som lade in pappret. */
  created_by_name?: string | null;
  created_by_image?: string | null;
}

export function useImportantPapers(storeId?: string | null) {
  return useQuery({
    queryKey: ["important-papers", storeId ?? "alla"],
    queryFn: async () => {
      let q = supabase.from("important_papers").select("*").order("created_at", { ascending: false });
      if (storeId) q = q.or(`store_id.is.null,store_id.eq.${storeId}`);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as ImportantPaper[];

      const staffIds = [...new Set(rows.map((r) => r.created_by_staff_id).filter(Boolean))] as string[];
      let byStaff: Record<string, { name: string; image: string | null }> = {};
      if (staffIds.length) {
        const { data: staff } = await supabase
          .from("staff")
          .select("id, first_name, last_name, profile_image_url")
          .in("id", staffIds);
        byStaff = Object.fromEntries(
          (staff ?? []).map((s: any) => [
            s.id,
            { name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(), image: s.profile_image_url ?? null },
          ]),
        );
      }
      return rows.map((r) => ({
        ...r,
        created_by_name: r.created_by_staff_id ? byStaff[r.created_by_staff_id]?.name ?? null : null,
        created_by_image: r.created_by_staff_id ? byStaff[r.created_by_staff_id]?.image ?? null : null,
      }));
    },
  });
}

export interface PaperInput {
  storeId?: string | null;
  paperType: PaperType;
  title?: string | null;
  companyName?: string | null;
  paperDate?: string | null;
  netAmount?: number | null;
  vatAmount?: number | null;
  grossAmount?: number | null;
  currency?: string;
  documentNumber?: string | null;
  description?: string | null;
  tags?: string[];
  file?: File | null;
}

/** Laddar upp filen (om det finns någon) och sparar pappret. */
export function useSaveImportantPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaperInput & { id?: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      const { data: staff } = await supabase.rpc("current_staff");
      const staffId = (staff as any)?.id ?? (Array.isArray(staff) ? (staff[0] as any)?.id : null) ?? null;

      let fileUrl: string | null = null;
      let fileName: string | null = null;
      let fileMime: string | null = null;
      if (input.file) {
        const ext = input.file.name.split(".").pop() ?? "bin";
        const path = `${input.storeId ?? "gemensamt"}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("viktiga-papper").upload(path, input.file);
        if (upErr) throw upErr;
        fileUrl = supabase.storage.from("viktiga-papper").getPublicUrl(path).data.publicUrl;
        fileName = input.file.name;
        fileMime = input.file.type || null;
      }

      const row: Record<string, unknown> = {
        store_id: input.storeId ?? null,
        paper_type: input.paperType,
        title: input.title?.trim() || null,
        company_name: input.companyName?.trim() || null,
        paper_date: input.paperDate || null,
        net_amount: input.netAmount ?? null,
        vat_amount: input.vatAmount ?? null,
        gross_amount: input.grossAmount ?? null,
        currency: input.currency || "CHF",
        document_number: input.documentNumber?.trim() || null,
        description: input.description?.trim() || null,
        tags: input.tags ?? [],
      };
      if (fileUrl) Object.assign(row, { file_url: fileUrl, file_name: fileName, file_mime: fileMime });

      if (input.id) {
        const { error } = await supabase.from("important_papers").update(row).eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("important_papers")
        .insert({ ...row, created_by: userId, created_by_staff_id: staffId })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["important-papers"] }),
  });
}

export function useDeleteImportantPaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("important_papers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["important-papers"] }),
  });
}
