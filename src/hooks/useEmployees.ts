import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { hashPnr, maskPnr, pnrLast4, birthDateFromPnr } from "@/lib/personnummer";

/**
 * Personalregistret (etapp 1 i personalmodulen).
 *
 * employees är master för en person, employments är en rad per anställning
 * och bolag. Det befintliga personalkortet (staff) lever kvar som aktörsnyckel
 * i övriga flöden och kopplas via employees.staff_id.
 */

export interface Employee {
  id: string;
  staff_id: string | null;
  pk_staff_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  profile_image_url: string | null;
  birth_date: string | null;
  address_street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string | null;
  pnr_masked: string | null;
  pnr_last4: string | null;
  alt_clock_identifier: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Employment {
  id: string;
  employee_id: string;
  legal_entity_id: string | null;
  store_id: string | null;
  employment_number: string | null;
  fortnox_employee_id: string | null;
  job_title: string | null;
  form: string;
  start_date: string | null;
  end_date: string | null;
  probation_end_date: string | null;
  conversion_date: string | null;
  employment_rate: number;
  pay_type: string;
  monthly_salary: number | null;
  hourly_rate: number | null;
  cost_center: string | null;
  tax_table: number | null;
  tax_column: number | null;
  tax_adjustment: number | null;
  vacation_rule: string;
  vacation_days: number;
  vacation_supplement_pct: number;
  pension_lf: boolean;
  agreement_area: string;
  is_active: boolean;
  notes: string | null;
}

export interface EmployeeDocument {
  id: string;
  employee_id: string;
  employment_id: string | null;
  doc_type: string;
  title: string;
  file_path: string;
  mime_type: string | null;
  file_size: number | null;
  signature_status: string;
  signed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export const EMPLOYMENT_FORMS = [
  { value: "tillsvidare", label: "Tillsvidare" },
  { value: "sarskild_visstid", label: "Särskild visstidsanställning" },
  { value: "prov", label: "Provanställning" },
  { value: "vikariat", label: "Vikariat" },
  { value: "sasong", label: "Säsong" },
];

export const AGREEMENT_AREAS = [
  { value: "butik", label: "Butik (Handels detaljhandel)" },
  { value: "lager", label: "Lager/Grossist (Handels lager)" },
  { value: "beredning", label: "Beredning" },
  { value: "tjansteman", label: "Tjänsteman" },
];

export const DOC_TYPES = [
  { value: "anstallningsavtal", label: "Anställningsavtal" },
  { value: "intyg", label: "Intyg" },
  { value: "certifikat", label: "Certifikat" },
  { value: "id", label: "Legitimation" },
  { value: "ovrigt", label: "Övrigt" },
];

export function useEmployees(includeInactive = true) {
  return useQuery({
    queryKey: ["employees", includeInactive],
    queryFn: async () => {
      let q = supabase.from("employees").select("*").order("first_name");
      if (!includeInactive) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Employee[];
    },
  });
}

export function useEmployments(employeeId?: string) {
  return useQuery({
    queryKey: ["employments", employeeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("employments").select("*").order("start_date", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Employment[];
    },
  });
}

export function useEmployeeDocuments(employeeId?: string) {
  return useQuery({
    queryKey: ["employee-documents", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employee_documents")
        .select("*")
        .eq("employee_id", employeeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmployeeDocument[];
    },
  });
}

export type EmployeeInput = Partial<Employee> & { pnr?: string };

export function useSaveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: EmployeeInput) => {
      const { id, pnr, ...rest } = input;
      const patch: Record<string, unknown> = { ...rest };
      if (pnr && pnr.replace(/\D/g, "").length >= 10) {
        patch.pnr_hash = await hashPnr(pnr);
        patch.pnr_masked = maskPnr(pnr);
        patch.pnr_last4 = pnrLast4(pnr);
        if (!rest.birth_date) patch.birth_date = birthDateFromPnr(pnr);
      }
      if (id) {
        const { error } = await supabase.from("employees").update(patch as any).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("employees")
        .insert(patch as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useSaveEmployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Employment>) => {
      const { id, ...rest } = input;
      if (id) {
        const { error } = await supabase.from("employments").update(rest as any).eq("id", id);
        if (error) throw error;
        return id;
      }
      const { data, error } = await supabase
        .from("employments")
        .insert(rest as any)
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employments"] }),
  });
}

export function useDeleteEmployment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employments"] }),
  });
}

export function useUploadEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      employeeId: string;
      employmentId?: string | null;
      docType: string;
      title: string;
      expiresAt?: string | null;
      file: File;
    }) => {
      const safe = p.file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${p.employeeId}/${Date.now()}_${safe}`;
      const { error: upErr } = await supabase.storage
        .from("personaldokument")
        .upload(path, p.file, { contentType: p.file.type || undefined });
      if (upErr) throw upErr;
      const { error } = await supabase.from("employee_documents").insert({
        employee_id: p.employeeId,
        employment_id: p.employmentId ?? null,
        doc_type: p.docType,
        title: p.title || p.file.name,
        file_path: path,
        mime_type: p.file.type || null,
        file_size: p.file.size,
        expires_at: p.expiresAt || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-documents"] }),
  });
}

export function useDeleteEmployeeDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: EmployeeDocument) => {
      await supabase.storage.from("personaldokument").remove([doc.file_path]);
      const { error } = await supabase.from("employee_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employee-documents"] }),
  });
}

/** Kortlivad länk till ett dokument i den privata mappen. */
export async function employeeDocumentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("personaldokument").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export function employeeName(e: Pick<Employee, "first_name" | "last_name">): string {
  return `${e.first_name} ${e.last_name}`.trim();
}

/** LAS-varningar: provanställning som löper ut och visstid som närmar sig konvertering. */
export function lasWarnings(em: Employment, today = new Date()): string[] {
  const out: string[] = [];
  const days = (d: string) => Math.ceil((new Date(d).getTime() - today.getTime()) / 86400000);
  if (em.form === "prov" && em.probation_end_date) {
    const d = days(em.probation_end_date);
    if (d <= 30) out.push(d < 0 ? "Provanställningen har passerat utgångsdatum" : `Provanställningen går ut om ${d} dagar`);
  }
  if (em.form === "sarskild_visstid" && em.conversion_date) {
    const d = days(em.conversion_date);
    if (d <= 30) out.push(d < 0 ? "Visstid ska ha konverterats till tillsvidare" : `Konverteras till tillsvidare om ${d} dagar`);
  }
  if (em.end_date) {
    const d = days(em.end_date);
    if (d >= 0 && d <= 30) out.push(`Anställningen slutar om ${d} dagar`);
  }
  return out;
}
