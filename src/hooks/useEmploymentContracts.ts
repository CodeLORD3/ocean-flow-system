import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EMPLOYMENT_FORMS, AGREEMENT_AREAS, type Employee, type Employment } from "@/hooks/useEmployees";

export interface ContractSection { id: string; title: string; body: string }

export interface EmploymentContract {
  id: string;
  employee_id: string;
  employment_id: string | null;
  template_id: string | null;
  title: string;
  sections: ContractSection[];
  status: "utkast" | "skickat" | "delvis_signerat" | "signerat" | "avbrutet";
  signatories: { role: string; name: string; email: string | null; signed_at: string | null }[];
  signed_pdf_path: string | null;
  error: string | null;
  sent_at: string | null;
  signed_at: string | null;
  created_at: string;
}

export const CONTRACT_STATUS: Record<EmploymentContract["status"], string> = {
  utkast: "Utkast",
  skickat: "Skickat",
  delvis_signerat: "Signerat av en part",
  signerat: "Signerat",
  avbrutet: "Avbrutet",
};

const db = supabase as any;

export function useContractTemplates() {
  return useQuery({
    queryKey: ["contract-templates"],
    queryFn: async () => {
      const { data, error } = await db.from("employment_contract_templates").select("*").eq("active", true).order("created_at");
      if (error) throw error;
      return (data ?? []) as { id: string; legal_entity_id: string | null; name: string; sections: ContractSection[]; version: number }[];
    },
  });
}

export function useSaveContractTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; sections: ContractSection[]; version: number }) => {
      const { error } = await db.from("employment_contract_templates")
        .update({ sections: p.sections, version: p.version + 1, updated_at: new Date().toISOString() }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contract-templates"] }),
  });
}

export function useEmploymentContracts(employeeId?: string | null) {
  return useQuery({
    queryKey: ["employment-contracts", employeeId],
    enabled: !!employeeId,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data, error } = await db.from("employment_contracts").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EmploymentContract[];
    },
  });
}

const kr = (n: number | null | undefined) => n == null ? "" : Number(n).toLocaleString("sv-SE");

/** Fyller mallens fält från personalkortet. Personnumret fylls först när avtalet skickas. */
export function fillTemplate(
  sections: ContractSection[],
  emp: Employee,
  e: Employment | null,
  ctx: { bolag: string; orgnr: string; butik: string },
): ContractSection[] {
  const lon = !e ? "" : e.pay_type === "hourly" ? `${kr(e.hourly_rate)} kronor per timme` : `${kr(e.monthly_salary)} kronor per månad`;
  const ob = e && (e.ob_50 || e.ob_70 || e.ob_100) ? "" : ". Arbetstagaren har inte rätt till OB enligt denna anställning";
  const map: Record<string, string> = {
    bolag: ctx.bolag,
    orgnr: ctx.orgnr,
    namn: `${emp.first_name} ${emp.last_name}`.trim(),
    adress: [emp.address_street, [emp.postal_code, emp.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
    befattning: e?.job_title ?? "",
    butik: ctx.butik,
    anstallningsform: EMPLOYMENT_FORMS.find((f) => f.value === e?.form)?.label ?? e?.form ?? "",
    startdatum: e?.start_date ?? "",
    slutdatum_text: e?.end_date ? ` och upphör ${e.end_date}` : "",
    provanstallning_text: e?.probation_end_date ? ` Provanställning gäller till och med ${e.probation_end_date}.` : "",
    sysselsattning: e ? String(e.employment_rate) : "",
    lon,
    ob_text: ob,
    semesterdagar: e ? String(e.vacation_days) : "25",
    avtalsomrade: `Handelsavtalet, ${AGREEMENT_AREAS.find((a) => a.value === e?.agreement_area)?.label ?? ""}`.replace(/, $/, ""),
  };
  return sections.map((s) => ({
    ...s,
    body: s.body.replace(/\{\{(\w+)\}\}/g, (m, k) => (k === "personnummer" ? m : map[k] ?? m)),
  }));
}

export function useCreateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { employee_id: string; employment_id: string | null; template_id: string; sections: ContractSection[] }) => {
      const { data, error } = await db.from("employment_contracts").insert(p).select().single();
      if (error) throw error;
      return data as EmploymentContract;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employment-contracts"] }),
  });
}

export function useUpdateContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; sections: ContractSection[] }) => {
      const { error } = await db.from("employment_contracts").update({ sections: p.sections }).eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employment-contracts"] }),
  });
}

export function useDeleteContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("employment_contracts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employment-contracts"] }),
  });
}

async function invoke(fn: string, body: unknown) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as any).context?.json?.(); if (j?.error) msg = j.error; } catch { /* */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useContractAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { contract_id: string; action: "send" | "cancel" | "preview" | "refresh" }) => invoke("contract-send", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employment-contracts"] }),
  });
}
