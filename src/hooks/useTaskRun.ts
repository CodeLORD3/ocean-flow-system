import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { staffInitials } from "@/hooks/useChecklist";
import { minutesBetween } from "@/lib/taskStandardTime";

/**
 * Att genomföra en uppgift: starta, pausa med orsak, bocka kontrollpunkter
 * och markera klar — eller registrera arbetet i efterhand. Varje bock sparas
 * som en egen rad med person och tidpunkt, så den blir ett bevis.
 */

export type TaskCheckpoint = {
  id: string;
  template_item_id: string | null;
  label: string;
  sort_order: number;
  required: boolean;
};

export type CheckpointResult = {
  id: string;
  checkpoint_id: string | null;
  label: string;
  checked: boolean;
  checked_by_staff_id: string | null;
  checked_at: string;
};

export type TaskPause = {
  id: string;
  reason: string;
  reason_note: string | null;
  paused_at: string;
  resumed_at: string | null;
};

export function useTaskCheckpoints(templateItemId?: string | null) {
  return useQuery({
    queryKey: ["task-checkpoints", templateItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_checkpoints")
        .select("id, template_item_id, label, sort_order, required")
        .eq("template_item_id", templateItemId!)
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as TaskCheckpoint[];
    },
    enabled: !!templateItemId,
  });
}

export function useCheckpointResults(checklistItemId?: string | null) {
  return useQuery({
    queryKey: ["task-checkpoint-results", checklistItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_checkpoint_results")
        .select("id, checkpoint_id, label, checked, checked_by_staff_id, checked_at")
        .eq("checklist_item_id", checklistItemId!);
      if (error) throw error;
      return (data || []) as CheckpointResult[];
    },
    enabled: !!checklistItemId,
  });
}

export function useSaveCheckpoint() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (input: { checklistItemId: string; checkpointId: string | null; label: string; checked: boolean }) => {
      const { error } = await supabase.from("task_checkpoint_results").upsert(
        {
          checklist_item_id: input.checklistItemId,
          checkpoint_id: input.checkpointId,
          label: input.label,
          checked: input.checked,
          checked_by_staff_id: staff?.id ?? null,
          checked_at: new Date().toISOString(),
        },
        { onConflict: "checklist_item_id,checkpoint_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checkpoint-results"] }),
  });
}

export function useSaveTaskCheckpoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { templateItemId: string; labels: { id?: string; label: string; required: boolean }[] }) => {
      const { data: existing } = await supabase
        .from("task_checkpoints")
        .select("id")
        .eq("template_item_id", input.templateItemId);
      const keep = new Set(input.labels.map((l) => l.id).filter(Boolean) as string[]);
      const remove = (existing || []).map((r: any) => r.id).filter((id: string) => !keep.has(id));
      if (remove.length > 0) {
        const { error } = await supabase.from("task_checkpoints").update({ active: false }).in("id", remove);
        if (error) throw error;
      }
      for (const [i, l] of input.labels.entries()) {
        const label = l.label.trim();
        if (!label) continue;
        if (l.id) {
          const { error } = await supabase
            .from("task_checkpoints")
            .update({ label, required: l.required, sort_order: i, active: true })
            .eq("id", l.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("task_checkpoints")
            .insert({ template_item_id: input.templateItemId, label, required: l.required, sort_order: i });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-checkpoints"] }),
  });
}

export function useTaskPauses(checklistItemId?: string | null) {
  return useQuery({
    queryKey: ["task-pauses", checklistItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_pauses")
        .select("id, reason, reason_note, paused_at, resumed_at")
        .eq("checklist_item_id", checklistItemId!)
        .order("paused_at");
      if (error) throw error;
      return (data || []) as TaskPause[];
    },
    enabled: !!checklistItemId,
  });
}

function invalidateRun(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["task-item"] });
  qc.invalidateQueries({ queryKey: ["day-tasks"] });
  qc.invalidateQueries({ queryKey: ["task-pauses"] });
  qc.invalidateQueries({ queryKey: ["map-tasks"] });
  qc.invalidateQueries({ queryKey: ["checklist-day"] });
}

/** Starta uppgiften: tiden börjar först här, aldrig när sidan öppnas. */
export function useStartTask() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({
          started_at: new Date().toISOString(),
          started_by_staff_id: staff?.id ?? null,
          run_status: "pagar",
          time_source: "timer",
          finished_at: null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRun(qc),
  });
}

/**
 * Nollställ klockan — uppgiften är varken startad eller pågående, och pauserna
 * tas bort. Används av "Börja om uppgiften" så tiden mäts från noll igen.
 */
export function useResetTaskRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("task_pauses").delete().eq("checklist_item_id", id);
      const { error } = await supabase
        .from("checklist_items")
        .update({
          started_at: null,
          started_by_staff_id: null,
          finished_at: null,
          run_status: "ej_startad",
          active_minutes: null,
          paused_minutes: null,
          actual_minutes: null,
          time_source: null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRun(qc),
  });
}

export function usePauseTask() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string; note?: string | null }) => {
      const { error } = await supabase.from("task_pauses").insert({
        checklist_item_id: input.id,
        reason: input.reason,
        reason_note: input.note?.trim() || null,
        staff_id: staff?.id ?? null,
      });
      if (error) throw error;
      const { error: uErr } = await supabase.from("checklist_items").update({ run_status: "pausad" }).eq("id", input.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => invalidateRun(qc),
  });
}

export function useResumeTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data: open } = await supabase
        .from("task_pauses")
        .select("id")
        .eq("checklist_item_id", id)
        .is("resumed_at", null)
        .order("paused_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (open) {
        const { error } = await supabase
          .from("task_pauses")
          .update({ resumed_at: new Date().toISOString() })
          .eq("id", (open as any).id);
        if (error) throw error;
      }
      const { error: uErr } = await supabase.from("checklist_items").update({ run_status: "pagar" }).eq("id", id);
      if (uErr) throw uErr;
    },
    onSuccess: () => invalidateRun(qc),
  });
}

/**
 * Markera klar: sparar sluttid, verklig tid, aktiv tid och väntetid.
 * Väntetiden räknas ur pauserna, resten är aktiv arbetstid.
 */
export function useFinishTask() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (input: { id: string; startedAt?: string | null }) => {
      const now = new Date().toISOString();

      // Stäng en pågående pause så väntetiden blir rätt.
      const { data: pauses } = await supabase
        .from("task_pauses")
        .select("id, paused_at, resumed_at")
        .eq("checklist_item_id", input.id);
      let paused = 0;
      for (const p of pauses || []) {
        const end = (p as any).resumed_at ?? now;
        if (!(p as any).resumed_at) {
          await supabase.from("task_pauses").update({ resumed_at: now }).eq("id", (p as any).id);
        }
        paused += minutesBetween((p as any).paused_at, end);
      }

      const total = input.startedAt ? minutesBetween(input.startedAt, now) : null;
      const active = total === null ? null : Math.max(0, Math.round((total - paused) * 10) / 10);

      const { error } = await supabase
        .from("checklist_items")
        .update({
          done: true,
          done_at: now,
          finished_at: now,
          run_status: "klar",
          actual_minutes: total,
          active_minutes: active,
          paused_minutes: Math.round(paused * 10) / 10,
          signature: staffInitials(staff?.first_name, staff?.last_name),
          completed_by_staff_id: staff?.id ?? null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRun(qc),
  });
}

/** Registrera i efterhand: arbetet är redan gjort, tiden fylls i manuellt. */
export function useLogTaskAfterwards() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (input: { id: string; minutes: number | null; startedAt?: string | null; finishedAt?: string | null }) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("checklist_items")
        .update({
          done: true,
          done_at: input.finishedAt ?? now,
          started_at: input.startedAt ?? null,
          finished_at: input.finishedAt ?? now,
          run_status: "klar",
          actual_minutes: input.minutes,
          active_minutes: input.minutes,
          paused_minutes: 0,
          time_source: "efterhand",
          signature: staffInitials(staff?.first_name, staff?.last_name),
          completed_by_staff_id: staff?.id ?? null,
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRun(qc),
  });
}

/** Återöppna uppgiften: tiderna nollas så nästa körning mäts rent. */
export function useReopenTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({
          done: false,
          done_at: null,
          finished_at: null,
          run_status: "ej_startad",
          started_at: null,
          actual_minutes: null,
          active_minutes: null,
          paused_minutes: null,
          time_source: null,
          signature: null,
          completed_by_staff_id: null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateRun(qc),
  });
}

/** Snitt av verklig tid för samma uppgift i butiken, som underlag för Kaizen. */
export function useTaskTimeStats(storeId?: string | null, taskName?: string | null, limit = 30) {
  return useQuery({
    queryKey: ["task-time-stats", storeId, taskName, limit],
    queryFn: async () => {
      const { data: days } = await supabase
        .from("checklist_days")
        .select("id")
        .eq("store_id", storeId!)
        .order("checklist_date", { ascending: false })
        .limit(120);
      const ids = (days || []).map((d: any) => d.id);
      if (ids.length === 0) return { count: 0, average: null as number | null, fastest: null as number | null, waiting: null as number | null };

      const { data, error } = await supabase
        .from("checklist_items")
        .select("actual_minutes, active_minutes, paused_minutes")
        .in("day_id", ids)
        .eq("task", taskName!)
        .not("actual_minutes", "is", null)
        .limit(limit);
      if (error) throw error;
      const rows = (data || []) as { actual_minutes: number; active_minutes: number | null; paused_minutes: number | null }[];
      if (rows.length === 0) return { count: 0, average: null, fastest: null, waiting: null };
      const total = rows.reduce((a, r) => a + r.actual_minutes, 0);
      const waiting = rows.reduce((a, r) => a + (r.paused_minutes ?? 0), 0);
      return {
        count: rows.length,
        average: Math.round((total / rows.length) * 10) / 10,
        fastest: Math.min(...rows.map((r) => r.actual_minutes)),
        waiting: Math.round((waiting / rows.length) * 10) / 10,
      };
    },
    enabled: !!storeId && !!taskName,
  });
}
