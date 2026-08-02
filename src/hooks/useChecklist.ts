import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

export type ChecklistItem = {
  id: string;
  day_id: string;
  section: string;
  time_label: string | null;
  category: string | null;
  task: string;
  sort_order: number;
  done: boolean;
  done_at: string | null;
  signature: string | null;
  note: string | null;
};

export type ChecklistDay = {
  id: string;
  store_id: string;
  checklist_date: string;
  shift: string;
  responsible_name: string | null;
  responsible_staff_id: string | null;
  status: string;
  completed_at: string | null;
  completed_by_name: string | null;
};

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAYS = ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"];

export function weekdayName(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}

export function formatSwedishDate(iso: string) {
  return iso;
}

export function staffInitials(firstName?: string | null, lastName?: string | null) {
  const a = (firstName || "").trim().charAt(0).toUpperCase();
  const b = (lastName || "").trim().charAt(0).toUpperCase();
  return `${a}${b}` || "–";
}

/** Dagens checklista för en butik — skapas automatiskt från mallen om den inte finns. */
export function useDailyChecklist(storeId?: string | null, date?: string) {
  const iso = date || todayIso();
  const { staff } = useStaffAuth();

  return useQuery({
    queryKey: ["checklist-day", storeId, iso],
    queryFn: async () => {
      // Hämta eller skapa dagens checklista
      let { data: day, error } = await supabase
        .from("checklist_days")
        .select("*")
        .eq("store_id", storeId!)
        .eq("checklist_date", iso)
        .maybeSingle();
      if (error) throw error;

      if (!day) {
        const { data: created, error: cErr } = await supabase
          .from("checklist_days")
          .insert({
            store_id: storeId!,
            checklist_date: iso,
            shift: "Öppning",
            responsible_name: staff ? `${staff.first_name} ${staff.last_name.charAt(0)}.` : null,
            responsible_staff_id: staff?.id ?? null,
          })
          .select("*")
          .single();
        if (cErr) {
          // Kan ha skapats parallellt av annan användare
          const { data: again } = await supabase
            .from("checklist_days")
            .select("*")
            .eq("store_id", storeId!)
            .eq("checklist_date", iso)
            .maybeSingle();
          if (!again) throw cErr;
          day = again;
        } else {
          day = created;
        }
      }

      let { data: items, error: iErr } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("day_id", day!.id)
        .order("sort_order");
      if (iErr) throw iErr;

      if (!items || items.length === 0) {
        const { data: tpl, error: tErr } = await supabase
          .from("checklist_template_items")
          .select("*")
          .eq("active", true)
          .or(`store_id.is.null,store_id.eq.${storeId}`)
          .order("sort_order");
        if (tErr) throw tErr;
        if (tpl && tpl.length > 0) {
          const { data: inserted, error: insErr } = await supabase
            .from("checklist_items")
            .insert(
              tpl.map((t: any) => ({
                day_id: day!.id,
                section: t.section,
                time_label: t.time_label,
                category: t.category,
                task: t.task,
                sort_order: t.sort_order,
              }))
            )
            .select("*");
          if (insErr) throw insErr;
          items = (inserted || []).sort((a: any, b: any) => a.sort_order - b.sort_order);
        }
      }

      return { day: day as ChecklistDay, items: (items || []) as ChecklistItem[] };
    },
    enabled: !!storeId,
  });
}

export function useToggleChecklistItem() {
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
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-day"] }),
  });
}

export function useSetChecklistNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({ note: note.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-day"] }),
  });
}

export function useMarkAllChecklistItems() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (dayId: string) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({
          done: true,
          done_at: new Date().toISOString(),
          signature: staffInitials(staff?.first_name, staff?.last_name),
        })
        .eq("day_id", dayId)
        .eq("done", false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-day"] }),
  });
}

export function useCompleteChecklist() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async (dayId: string) => {
      const { data: open, error: oErr } = await supabase
        .from("checklist_items")
        .select("id")
        .eq("day_id", dayId)
        .eq("done", false);
      if (oErr) throw oErr;
      if ((open || []).length > 0) {
        throw new Error(
          `Checklistan kan inte slutföras — ${open!.length} uppgift${open!.length === 1 ? "" : "er"} är inte markerade som klara.`
        );
      }
      const { error } = await supabase
        .from("checklist_days")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by_name: staff ? `${staff.first_name} ${staff.last_name}` : null,
        })
        .eq("id", dayId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
      qc.invalidateQueries({ queryKey: ["checklist-reports"] });
    },
  });
}

/** Rapportvy för Admin: alla slutförda (och pågående) checklistor per butik. */
export function useChecklistReports() {
  return useQuery({
    queryKey: ["checklist-reports"],
    queryFn: async () => {
      const { data: days, error } = await supabase
        .from("checklist_days")
        .select("*, stores(name)")
        .order("checklist_date", { ascending: false })
        .limit(200);
      if (error) throw error;

      const ids = (days || []).map((d: any) => d.id);
      if (ids.length === 0) return [] as any[];

      const { data: items, error: iErr } = await supabase
        .from("checklist_items")
        .select("day_id, done")
        .in("day_id", ids);
      if (iErr) throw iErr;

      const counts = new Map<string, { total: number; done: number }>();
      (items || []).forEach((i: any) => {
        const c = counts.get(i.day_id) || { total: 0, done: 0 };
        c.total += 1;
        if (i.done) c.done += 1;
        counts.set(i.day_id, c);
      });

      return (days || []).map((d: any) => ({
        ...d,
        storeName: d.stores?.name ?? "Butik",
        total: counts.get(d.id)?.total ?? 0,
        doneCount: counts.get(d.id)?.done ?? 0,
      }));
    },
  });
}

export function useChecklistDayItems(dayId?: string | null) {
  return useQuery({
    queryKey: ["checklist-day-items", dayId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_items")
        .select("*")
        .eq("day_id", dayId!)
        .order("sort_order");
      if (error) throw error;
      return (data || []) as ChecklistItem[];
    },
    enabled: !!dayId,
  });
}
