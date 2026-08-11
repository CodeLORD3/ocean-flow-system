import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BugReportStatus = "new" | "done" | "irrelevant" | "planned" | "duplicate";

export interface BugReportState {
  log_id: string;
  status: BugReportStatus;
  note: string | null;
  updated_by: string | null;
  updated_at: string;
}

export const BUG_STATUS_OPTIONS: { key: BugReportStatus; label: string }[] = [
  { key: "new", label: "Ny" },
  { key: "planned", label: "Planerad" },
  { key: "done", label: "Åtgärdad" },
  { key: "irrelevant", label: "Orelevant" },
  { key: "duplicate", label: "Dubblett" },
];

export function bugStatusLabel(status: BugReportStatus) {
  return BUG_STATUS_OPTIONS.find((o) => o.key === status)?.label ?? status;
}

/** Alla statusposter för felrapporter, indexerade på logg-id. */
export function useBugReportStates() {
  return useQuery({
    queryKey: ["bug_report_states"],
    queryFn: async () => {
      const { data, error } = await supabase.from("bug_report_states").select("*");
      if (error) throw error;
      const map: Record<string, BugReportState> = {};
      (data ?? []).forEach((r: any) => (map[r.log_id] = r as BugReportState));
      return map;
    },
  });
}

export function useSetBugReportStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      logId: string;
      status: BugReportStatus;
      note?: string | null;
      updatedBy?: string | null;
    }) => {
      const { error } = await supabase.from("bug_report_states").upsert(
        {
          log_id: params.logId,
          status: params.status,
          note: params.note ?? null,
          updated_by: params.updatedBy ?? null,
        } as any,
        { onConflict: "log_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bug_report_states"] }),
  });
}
