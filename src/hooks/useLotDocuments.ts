import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dokumentregister per parti. Ett detaljparti ärver moderpartiets dokument
 * som referens — aldrig som kopia. Därför läses moderns dokument via
 * lot_transformations och visas separat, utan att dupliceras i databasen.
 */

export const LOT_DOCUMENT_TYPES = [
  { value: "fangstintyg", label: "Fångstintyg" },
  { value: "statistikdokument", label: "Statistikdokument" },
  { value: "reexportintyg", label: "Reexportintyg" },
  { value: "halsointyg", label: "Hälsointyg" },
  { value: "registreringsdokument_blotdjur", label: "Registreringsdokument, blötdjur" },
  { value: "leverantorsintyg", label: "Leverantörsintyg" },
  { value: "ovrigt", label: "Övrigt" },
] as const;

export const documentTypeLabel = (v?: string | null) =>
  LOT_DOCUMENT_TYPES.find((t) => t.value === v)?.label ?? v ?? "—";

export interface LotDocumentRow {
  id: string;
  lot_id: string;
  document_type: string;
  document_number: string | null;
  issuer: string | null;
  issued_date: string | null;
  valid_to: string | null;
  file_path: string | null;
  file_name: string | null;
  note: string | null;
  uploaded_at: string;
  staff?: { name?: string | null } | null;
}

const BUCKET = "lot-documents";

/** Partiets egna dokument. */
export function useLotDocuments(lotId?: string | null) {
  return useQuery({
    queryKey: ["lot_documents", lotId],
    enabled: !!lotId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lot_documents")
        .select("*")
        .eq("lot_id", lotId!)
        .order("uploaded_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LotDocumentRow[];
    },
  });
}

/** Moderpartiernas dokument, ärvda som referens vid tillverkning. */
export function useInheritedLotDocuments(lotId?: string | null) {
  return useQuery({
    queryKey: ["lot_documents_inherited", lotId],
    enabled: !!lotId,
    queryFn: async () => {
      const seen = new Set<string>();
      let frontier = [lotId!];
      const parents: { id: string; lot_number: string }[] = [];

      // Följ kedjan uppåt i högst fem steg, tillräckligt för styckning i flera led.
      for (let depth = 0; depth < 5 && frontier.length; depth++) {
        const { data, error } = await supabase
          .from("lot_transformations")
          .select("from_lot_id, lots!lot_transformations_from_lot_id_fkey(id, lot_number)")
          .in("to_lot_id", frontier);
        if (error) throw error;
        const next: string[] = [];
        for (const row of (data ?? []) as any[]) {
          const parent = row.lots;
          if (!parent || seen.has(parent.id)) continue;
          seen.add(parent.id);
          parents.push({ id: parent.id, lot_number: parent.lot_number });
          next.push(parent.id);
        }
        frontier = next;
      }

      if (!parents.length) return [];

      const { data: docs, error: docErr } = await supabase
        .from("lot_documents")
        .select("*")
        .in("lot_id", parents.map((p) => p.id))
        .order("uploaded_at", { ascending: false });
      if (docErr) throw docErr;

      const byId = new Map(parents.map((p) => [p.id, p.lot_number]));
      return ((docs ?? []) as unknown as LotDocumentRow[]).map((d) => ({
        ...d,
        parentLotNumber: byId.get(d.lot_id) ?? "",
      }));
    },
  });
}

export function useAddLotDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lotId: string;
      documentType: string;
      documentNumber?: string;
      issuer?: string;
      issuedDate?: string;
      validTo?: string;
      note?: string;
      file?: File | null;
    }) => {
      let filePath: string | null = null;
      let fileName: string | null = null;

      if (input.file) {
        const ext = input.file.name.split(".").pop() || "bin";
        filePath = `${input.lotId}/${crypto.randomUUID()}.${ext}`;
        fileName = input.file.name;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(filePath, input.file, { upsert: false });
        if (upErr) throw upErr;
      }

      const { data: staff } = await supabase.rpc("current_staff");
      const uploadedBy = (staff as any)?.id ?? null;

      const { error } = await supabase.from("lot_documents").insert({
        lot_id: input.lotId,
        document_type: input.documentType,
        document_number: input.documentNumber?.trim() || null,
        issuer: input.issuer?.trim() || null,
        issued_date: input.issuedDate || null,
        valid_to: input.validTo || null,
        note: input.note?.trim() || null,
        file_path: filePath,
        file_name: fileName,
        uploaded_by: uploadedBy,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lot_documents", vars.lotId] });
      qc.invalidateQueries({ queryKey: ["lot_documents_summary"] });
    },
  });
}

export function useDeleteLotDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: LotDocumentRow) => {
      if (doc.file_path) {
        await supabase.storage.from(BUCKET).remove([doc.file_path]);
      }
      const { error } = await supabase.from("lot_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: (_d, doc) => {
      qc.invalidateQueries({ queryKey: ["lot_documents", doc.lot_id] });
      qc.invalidateQueries({ queryKey: ["lot_documents_summary"] });
    },
  });
}

/** Tidsbegränsad länk till en privat dokumentfil. */
export async function openLotDocumentFile(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener");
}

/** Sammanställning för rapportering: antal partier per dokumenttyp. */
export function useLotDocumentSummary() {
  return useQuery({
    queryKey: ["lot_documents_summary"],
    queryFn: async () => {
      const [{ data: docs, error }, { count: lotCount, error: lotErr }] = await Promise.all([
        supabase.from("lot_documents").select("lot_id, document_type"),
        supabase.from("lots").select("id", { count: "exact", head: true }),
      ]);
      if (error) throw error;
      if (lotErr) throw lotErr;

      const perType = new Map<string, Set<string>>();
      const withAny = new Set<string>();
      for (const d of (docs ?? []) as any[]) {
        withAny.add(d.lot_id);
        if (!perType.has(d.document_type)) perType.set(d.document_type, new Set());
        perType.get(d.document_type)!.add(d.lot_id);
      }
      return {
        totalLots: lotCount ?? 0,
        lotsWithoutDocuments: Math.max((lotCount ?? 0) - withAny.size, 0),
        perType: [...perType.entries()].map(([type, set]) => ({ type, lots: set.size })),
      };
    },
  });
}
