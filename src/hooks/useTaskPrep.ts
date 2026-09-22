import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * FÖRBEREDA — kontrollen av redskap och produkter innan arbetet börjar.
 *
 * Personalen bockar av varje sak när den hämtas, eller bockar av allt på en
 * gång när sakerna står samlade (t.ex. på städvagnen). Börjar något ta slut
 * skrivs en rapport — inget saldo ändras här, det är en anmälan till chefen.
 */

export type PrepStatus = "finns" | "tar_slut" | "saknas";

export const PREP_STATUS_LABEL: Record<PrepStatus, string> = {
  finns: "Finns",
  tar_slut: "Börjar ta slut",
  saknas: "Saknas",
};

export type PrepCheck = {
  id: string;
  checklist_item_id: string;
  requirement_id: string | null;
  /** Satt när raden är avbockning av ett steg i arbetsbeskrivningen. */
  step_no: number | null;
  resource_id: string | null;
  item_name: string;
  status: PrepStatus;
  note: string | null;
  checked_by_staff_id: string | null;
  checked_at: string;
};

export function useTaskPrepChecks(checklistItemId?: string | null) {
  return useQuery({
    queryKey: ["task-prep-checks", checklistItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_prep_checks")
        .select("*")
        .eq("checklist_item_id", checklistItemId!);
      if (error) throw error;
      return (data || []) as PrepCheck[];
    },
    enabled: !!checklistItemId,
  });
}

export type PrepInput = {
  checklistItemId: string;
  requirementId: string | null;
  resourceId?: string | null;
  itemName: string;
  status: PrepStatus;
  note?: string | null;
  staffId?: string | null;
};

async function writeCheck(input: PrepInput) {
  const row = {
    checklist_item_id: input.checklistItemId,
    requirement_id: input.requirementId,
    resource_id: input.resourceId ?? null,
    item_name: input.itemName,
    status: input.status,
    note: input.note?.trim() || null,
    checked_by_staff_id: input.staffId ?? null,
    checked_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("task_prep_checks")
    .upsert(row, { onConflict: "checklist_item_id,requirement_id" });
  if (error) throw error;
}

export function useSetPrepCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: writeCheck,
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["task-prep-checks", v.checklistItemId] }),
  });
}

/** Allt ligger samlat — hela listan bockas av på en gång. */
export function useCheckAllPresent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { items: PrepInput[] }) => {
      for (const item of input.items) await writeCheck(item);
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["task-prep-checks", v.items[0]?.checklistItemId] }),
  });
}

export function useClearPrepCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; checklistItemId: string }) => {
      const { error } = await supabase.from("task_prep_checks").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["task-prep-checks", v.checklistItemId] }),
  });
}

export type ShortageReport = {
  id: string;
  store_id: string | null;
  resource_id: string | null;
  checklist_item_id: string | null;
  item_name: string;
  level: "tar_slut" | "slut";
  note: string | null;
  status: string;
  reported_by_staff_id: string | null;
  created_at: string;
};

export function useShortageReports(storeId?: string | null, onlyOpen = true) {
  return useQuery({
    queryKey: ["resource-shortage-reports", storeId ?? "all", onlyOpen],
    queryFn: async () => {
      let q = supabase
        .from("resource_shortage_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (storeId) q = q.eq("store_id", storeId);
      if (onlyOpen) q = q.eq("status", "oppen");
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ShortageReport[];
    },
  });
}

export function useReportShortage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      storeId?: string | null;
      resourceId?: string | null;
      requirementId?: string | null;
      checklistItemId?: string | null;
      itemName: string;
      level: "tar_slut" | "slut";
      note?: string | null;
      staffId?: string | null;
    }) => {
      const { error } = await supabase.from("resource_shortage_reports").insert({
        store_id: input.storeId ?? null,
        resource_id: input.resourceId ?? null,
        requirement_id: input.requirementId ?? null,
        checklist_item_id: input.checklistItemId ?? null,
        item_name: input.itemName,
        level: input.level,
        note: input.note?.trim() || null,
        reported_by_staff_id: input.staffId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resource-shortage-reports"] }),
  });
}

export function useCloseShortageReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; staffId?: string | null }) => {
      const { error } = await supabase
        .from("resource_shortage_reports")
        .update({
          status: "atgardad",
          resolved_at: new Date().toISOString(),
          resolved_by_staff_id: input.staffId ?? null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resource-shortage-reports"] }),
  });
}

/** Avbockning av varje steg i arbetsbeskrivningen. */
export function useSetStepCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      checklistItemId: string;
      stepNo: number;
      stepTitle: string;
      staffId?: string | null;
    }) => {
      /** Det unika indexet är partiellt (step_no not null) — upsert går inte via API:t. */
      const row = {
        checklist_item_id: input.checklistItemId,
        requirement_id: null,
        step_no: input.stepNo,
        item_name: input.stepTitle,
        status: "finns",
        checked_by_staff_id: input.staffId ?? null,
        checked_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("task_prep_checks").insert(row);
      if (error) {
        if (error.code !== "23505") throw error;
        const { error: upErr } = await supabase
          .from("task_prep_checks")
          .update(row)
          .eq("checklist_item_id", input.checklistItemId)
          .eq("step_no", input.stepNo);
        if (upErr) throw upErr;
      }
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["task-prep-checks", v.checklistItemId] }),
  });
}

export function useClearStepCheck() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { checklistItemId: string; stepNo: number }) => {
      const { error } = await supabase
        .from("task_prep_checks")
        .delete()
        .eq("checklist_item_id", input.checklistItemId)
        .eq("step_no", input.stepNo);
      if (error) throw error;
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ["task-prep-checks", v.checklistItemId] }),
  });
}
