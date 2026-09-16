import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { staffInitials, todayIso, DEFAULT_CHECKLIST_TEMPLATE_ID } from "@/hooks/useChecklist";
import type { EntityImage } from "@/hooks/useEntityImages";

/**
 * Uppgifter = samma rader som checklistorna (checklist_items för dagens
 * tillfälle, checklist_template_items för standarduppgiften). Här ligger bara
 * de extra hookarna som uppgiftsvyn behöver: tilldelning, tidsmodell,
 * fotokrav, historik per tillfälle och kategorilistan.
 */

export type TaskCategory = {
  id: string;
  store_id: string | null;
  name: string;
  color: string;
  icon: string | null;
  sort_order: number;
  active: boolean;
};

export type TaskRow = {
  id: string;
  day_id: string;
  task: string;
  section: string;
  note: string | null;
  sort_order: number;
  done: boolean;
  done_at: string | null;
  signature: string | null;
  category: string | null;
  category_id: string | null;
  work_type: string | null;
  zone_id: string | null;
  map_object_id: string | null;
  assigned_staff_id: string | null;
  completed_by_staff_id: string | null;
  specific_time: string | null;
  time_from: string | null;
  time_to: string | null;
  daypart: string | null;
  estimated_minutes: number | null;
  instructions: string[] | null;
  important_note: string | null;
  requires_photo: boolean;
  template_item_id: string | null;
  time_label: string | null;
};

const TASK_FIELDS =
  "id, day_id, task, section, note, sort_order, done, done_at, signature, category, category_id, work_type, zone_id, map_object_id, assigned_staff_id, completed_by_staff_id, specific_time, time_from, time_to, daypart, estimated_minutes, instructions, important_note, requires_photo, template_item_id, time_label";

function normalize<T = TaskRow>(row: any): T {
  const raw = row.instructions;
  const steps = Array.isArray(raw)
    ? raw.map((s: unknown) => String(s)).filter((s) => s.trim().length > 0)
    : typeof raw === "string" && raw.trim()
      ? raw.split("\n").map((s) => s.trim()).filter(Boolean)
      : null;
  return { ...row, instructions: steps && steps.length > 0 ? steps : null } as T;
}

/** Administrerbara kategorier: gemensamma plus butikens egna. */
export function useTaskCategories(storeId?: string | null) {
  return useQuery({
    queryKey: ["task-categories", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("task_categories").select("*").eq("active", true);
      if (storeId) q = q.or(`store_id.is.null,store_id.eq.${storeId}`);
      const { data, error } = await q.order("sort_order").order("name");
      if (error) throw error;
      return (data || []) as TaskCategory[];
    },
  });
}

export function useSaveTaskCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; name: string; color: string; storeId?: string | null }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Ge kategorin ett namn.");
      if (input.id) {
        const { error } = await supabase
          .from("task_categories")
          .update({ name, color: input.color })
          .eq("id", input.id);
        if (error) throw error;
        return input.id;
      }
      const { data, error } = await supabase
        .from("task_categories")
        .insert({ name, color: input.color, store_id: input.storeId ?? null })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-categories"] }),
  });
}

/** Dagens uppgifter för en butik — alla checklistor för datumet i en lista. */
export function useDayTasks(storeId?: string | null, date?: string) {
  const iso = date || todayIso();
  return useQuery({
    queryKey: ["day-tasks", storeId, iso],
    queryFn: async () => {
      const { data: days, error: dErr } = await supabase
        .from("checklist_days")
        .select("id, template_id, checklist_templates(name)")
        .eq("store_id", storeId!)
        .eq("checklist_date", iso);
      if (dErr) throw dErr;
      const ids = (days || []).map((d: any) => d.id);
      if (ids.length === 0) return { tasks: [] as TaskRow[], dayIds: [] as string[] };

      const { data, error } = await supabase
        .from("checklist_items")
        .select(TASK_FIELDS)
        .in("day_id", ids)
        .order("sort_order");
      if (error) throw error;
      return { tasks: (data || []).map(normalize), dayIds: ids };
    },
    enabled: !!storeId,
  });
}

/** Bockar av / återöppnar. Tilldelad person och den som bockade av hålls isär. */
export function useSetTaskDone() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({
          done,
          done_at: done ? new Date().toISOString() : null,
          signature: done ? staffInitials(staff?.first_name, staff?.last_name) : null,
          completed_by_staff_id: done ? (staff?.id ?? null) : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-tasks"] });
      qc.invalidateQueries({ queryKey: ["map-tasks"] });
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
      qc.invalidateQueries({ queryKey: ["task-item"] });
    },
  });
}

/** Uppdaterar valfria fält på dagens uppgift (tilldelning, tid, fotokrav …). */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase.from("checklist_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-tasks"] });
      qc.invalidateQueries({ queryKey: ["map-tasks"] });
      qc.invalidateQueries({ queryKey: ["task-item"] });
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
    },
  });
}

/** Tillfällig uppgift: gäller bara valt datum och blir aldrig en standarduppgift. */
export function useAddAdhocTask() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (input: {
      storeId: string;
      date: string;
      task: string;
      zoneId?: string | null;
      categoryId?: string | null;
      assignedStaffId?: string | null;
      specificTime?: string | null;
      estimatedMinutes?: number | null;
      note?: string | null;
      requiresPhoto?: boolean;
    }) => {
      const task = input.task.trim();
      if (!task) throw new Error("Skriv vad som ska göras.");

      let { data: day } = await supabase
        .from("checklist_days")
        .select("id")
        .eq("store_id", input.storeId)
        .eq("checklist_date", input.date)
        .limit(1)
        .maybeSingle();

      if (!day) {
        const { data: created, error: cErr } = await supabase
          .from("checklist_days")
          .insert({
            store_id: input.storeId,
            checklist_date: input.date,
            template_id: DEFAULT_CHECKLIST_TEMPLATE_ID,
            shift: "Öppning",
            responsible_name: staff ? `${staff.first_name} ${staff.last_name}` : null,
            responsible_staff_id: staff?.id ?? null,
          })
          .select("id")
          .single();
        if (cErr) throw cErr;
        day = created;
      }

      const { data, error } = await supabase
        .from("checklist_items")
        .insert({
          day_id: day!.id,
          section: "Tillfälliga uppgifter",
          task,
          sort_order: 900,
          zone_id: input.zoneId ?? null,
          category_id: input.categoryId ?? null,
          assigned_staff_id: input.assignedStaffId ?? null,
          specific_time: input.specificTime || null,
          time_label: input.specificTime || null,
          estimated_minutes: input.estimatedMinutes ?? null,
          note: input.note?.trim() || null,
          requires_photo: !!input.requiresPhoto,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-tasks"] });
      qc.invalidateQueries({ queryKey: ["map-tasks"] });
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
    },
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["day-tasks"] });
      qc.invalidateQueries({ queryKey: ["map-tasks"] });
    },
  });
}

/** En uppgift med sitt datum och sin butik — underlag för detaljsidan. */
export function useTaskItem(id?: string | null) {
  return useQuery({
    queryKey: ["task-item", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select(`${TASK_FIELDS}, checklist_days(id, store_id, checklist_date, template_id, checklist_templates(name, weekdays))`)
        .eq("id", id!)
        .single();
      if (error) throw error;
      const day = (data as any).checklist_days;
      return {
        task: normalize(data),
        storeId: day?.store_id as string | null,
        date: day?.checklist_date as string | null,
        templateId: day?.template_id as string | null,
        listName: day?.checklist_templates?.name as string | undefined,
        weekdays: (day?.checklist_templates?.weekdays ?? []) as number[],
      };
    },
    enabled: !!id,
  });
}

export type TaskOccurrence = {
  id: string;
  date: string;
  done: boolean;
  done_at: string | null;
  signature: string | null;
  completed_by_staff_id: string | null;
  images: EntityImage[];
};

/**
 * Historik för samma uppgift över tid: varje tidigare tillfälle i butiken,
 * med bilderna som togs vid just det tillfället.
 */
export function useTaskHistory(storeId?: string | null, taskName?: string | null, limit = 60) {
  return useQuery({
    queryKey: ["task-history", storeId, taskName, limit],
    queryFn: async () => {
      const { data: days, error: dErr } = await supabase
        .from("checklist_days")
        .select("id, checklist_date")
        .eq("store_id", storeId!)
        .order("checklist_date", { ascending: false })
        .limit(limit);
      if (dErr) throw dErr;
      const dayIds = (days || []).map((d: any) => d.id);
      if (dayIds.length === 0) return [] as TaskOccurrence[];
      const dateOf = new Map<string, string>((days || []).map((d: any) => [d.id, d.checklist_date]));

      const { data: items, error } = await supabase
        .from("checklist_items")
        .select("id, day_id, done, done_at, signature, completed_by_staff_id")
        .in("day_id", dayIds)
        .eq("task", taskName!);
      if (error) throw error;
      const rows = items || [];
      if (rows.length === 0) return [] as TaskOccurrence[];

      const { data: images } = await supabase
        .from("entity_images")
        .select("*")
        .in("checklist_item_id", rows.map((r: any) => r.id))
        .order("created_at", { ascending: false });

      const byItem = new Map<string, EntityImage[]>();
      (images || []).forEach((img: any) => {
        const list = byItem.get(img.checklist_item_id) ?? [];
        list.push(img as EntityImage);
        byItem.set(img.checklist_item_id, list);
      });

      return rows
        .map((r: any) => ({
          id: r.id,
          date: dateOf.get(r.day_id) ?? "",
          done: r.done,
          done_at: r.done_at,
          signature: r.signature,
          completed_by_staff_id: r.completed_by_staff_id,
          images: byItem.get(r.id) ?? [],
        }))
        .sort((a, b) => b.date.localeCompare(a.date)) as TaskOccurrence[];
    },
    enabled: !!storeId && !!taskName,
  });
}

/** Bilderna som hör till en enskild uppgift (dagens tillfälle). */
export function useTaskImages(taskId?: string | null) {
  return useQuery({
    queryKey: ["task-images", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("*")
        .eq("checklist_item_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as EntityImage[];
    },
    enabled: !!taskId,
  });
}

export type StandardTask = {
  id: string;
  template_id: string;
  store_id: string | null;
  section: string;
  task: string;
  time_label: string | null;
  category: string | null;
  category_id: string | null;
  work_type: string | null;
  zone_id: string | null;
  map_object_id: string | null;
  sort_order: number;
  active: boolean;
  assigned_staff_id: string | null;
  specific_time: string | null;
  time_from: string | null;
  time_to: string | null;
  daypart: string | null;
  estimated_minutes: number | null;
  instructions: string[] | null;
  important_note: string | null;
  requires_photo: boolean;
  listName: string;
  weekdays: number[];
};

/** Standarduppgifter: mallraderna som återkommer, med sin checklistas schema. */
export function useStandardTasks(storeId?: string | null) {
  return useQuery({
    queryKey: ["standard-tasks", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_template_items")
        .select("*, checklist_templates(name, weekdays, active)")
        .eq("active", true)
        .or(`store_id.is.null,store_id.eq.${storeId}`)
        .order("sort_order");
      if (error) throw error;
      return (data || [])
        .filter((r: any) => r.checklist_templates?.active !== false)
        .map((r: any) => ({
          ...normalize<StandardTask>(r),
          listName: r.checklist_templates?.name ?? "Daglig checklista",
          weekdays: r.checklist_templates?.weekdays ?? [],
        })) as StandardTask[];
    },
    enabled: !!storeId,
  });
}

export function useUpdateStandardTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Record<string, unknown>) => {
      const { error } = await supabase.from("checklist_template_items").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["standard-tasks"] });
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
    },
  });
}

/** Referensbilder på standarduppgiften — "så här ska det se ut". */
export function useTaskReferenceImages(templateItemId?: string | null) {
  return useQuery({
    queryKey: ["task-reference-images", templateItemId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entity_images")
        .select("*")
        .eq("entity_type", "checklist_template_item")
        .eq("entity_id", templateItemId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data || []) as EntityImage[];
    },
    enabled: !!templateItemId,
  });
}
