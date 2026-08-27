import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Availability, Shift, ShiftRequest, ShiftTemplate, ShiftType } from "@/lib/schedule";
import { shiftStart, weekDates } from "@/lib/schedule";

/**
 * Schemamodulen (etapp 3). Alla skrivningar går via RLS: bara chefer med
 * butiksbehörighet kan skapa/ändra/publicera pass, anställda ser publicerade
 * pass och hanterar enbart sin egen tillgänglighet.
 */

const KEY = {
  types: ["shift_types"],
  shifts: (storeId: string | null, from: string, to: string) => ["shifts", storeId, from, to],
  templates: (storeId: string | null) => ["shift_templates", storeId],
  availability: (employeeId?: string | null) => ["availability", employeeId ?? "all"],
  requests: (storeId: string | null) => ["shift_requests", storeId],
  history: (shiftId: string | null) => ["shift_history", shiftId],
  competencies: ["employee_competencies"],
};

export function useShiftTypes() {
  return useQuery({
    queryKey: KEY.types,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_types")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ShiftType[];
    },
    staleTime: 5 * 60_000,
  });
}

export function useShifts(storeId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: KEY.shifts(storeId, from, to),
    queryFn: async () => {
      let q = supabase.from("shifts").select("*").gte("date", from).lte("date", to);
      if (storeId) q = q.eq("store_id", storeId);
      const { data, error } = await q.order("date").order("start_time");
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });
}

/** Alla pass för en person i ett datumintervall — underlag till regelmotorn. */
export function useEmployeeShifts(employeeIds: string[], from: string, to: string) {
  const ids = [...employeeIds].sort().join(",");
  return useQuery({
    queryKey: ["shifts-by-employee", ids, from, to],
    enabled: employeeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .in("employee_id", employeeIds)
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return (data ?? []) as Shift[];
    },
  });
}

export function useSaveShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Shift> & { store_id: string; date: string; start_time: string; end_time: string }) => {
      const { data: auth } = await supabase.auth.getUser();
      const payload = { ...input, updated_by: auth.user?.id ?? null };
      if (input.id) {
        const { data, error } = await supabase.from("shifts").update(payload).eq("id", input.id).select().single();
        if (error) throw error;
        return data as Shift;
      }
      const { data, error } = await supabase
        .from("shifts")
        .insert({ ...payload, created_by: auth.user?.id ?? null })
        .select()
        .single();
      if (error) throw error;
      return data as Shift;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shifts"] });
      qc.invalidateQueries({ queryKey: ["shifts-by-employee"] });
    },
  });
}

export function useDeleteShift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shifts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

/** Publicerar veckans utkast och skickar in-app-notis till berörda enheter. */
export function usePublishWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ storeId, anchor }: { storeId: string; anchor: string }) => {
      const week = weekDates(anchor);
      const { data, error } = await supabase
        .from("shifts")
        .update({ status: "published", published_at: new Date().toISOString() })
        .eq("store_id", storeId)
        .eq("status", "draft")
        .gte("date", week[0])
        .lte("date", week[6])
        .select("id");
      if (error) throw error;
      const count = data?.length ?? 0;
      if (count > 0) {
        await supabase.rpc("notify_event", {
          _portals: ["shop", "wholesale", "admin"],
          _page: "/my-shifts",
          _store: storeId,
          _msg: `Schemat för vecka ${week[0]} – ${week[6]} är publicerat (${count} pass).`,
          _etype: "schedule_published",
          _eid: `${storeId}:${week[0]}`,
        });
      }
      return count;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useShiftTemplates(storeId: string | null) {
  return useQuery({
    queryKey: KEY.templates(storeId),
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_templates")
        .select("*")
        .eq("store_id", storeId!)
        .order("weekday")
        .order("start_time");
      if (error) throw error;
      return (data ?? []) as ShiftTemplate[];
    },
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<ShiftTemplate> & { store_id: string; name: string; weekday: number; start_time: string; end_time: string }) => {
      if (input.id) {
        const { error } = await supabase.from("shift_templates").update(input).eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("shift_templates").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shift_templates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shift_templates"] }),
  });
}

/** Skapar veckans pass från enhetens mallar — alltid som utkast. */
export function useCreateWeekFromTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      storeId,
      legalEntityId,
      anchor,
      templates,
    }: {
      storeId: string;
      legalEntityId: string | null;
      anchor: string;
      templates: ShiftTemplate[];
    }) => {
      const week = weekDates(anchor);
      const { data: auth } = await supabase.auth.getUser();
      const rows = templates.flatMap((t) =>
        Array.from({ length: Math.max(1, t.count) }, () => ({
          store_id: storeId,
          legal_entity_id: legalEntityId,
          employee_id: null,
          shift_type_id: t.shift_type_id,
          date: week[t.weekday - 1],
          start_time: t.start_time,
          end_time: t.end_time,
          break_minutes: t.break_minutes,
          status: "draft" as const,
          note: t.name,
          created_by: auth.user?.id ?? null,
        })),
      );
      if (!rows.length) return 0;
      const { error } = await supabase.from("shifts").insert(rows);
      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

/** Kopiera vecka: källveckans pass klonas till målveckan som utkast. */
export function useCopyWeek() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      storeId,
      fromAnchor,
      toAnchor,
      keepEmployees,
    }: {
      storeId: string;
      fromAnchor: string;
      toAnchor: string;
      keepEmployees: boolean;
    }) => {
      const src = weekDates(fromAnchor);
      const dst = weekDates(toAnchor);
      const { data, error } = await supabase
        .from("shifts")
        .select("*")
        .eq("store_id", storeId)
        .gte("date", src[0])
        .lte("date", src[6])
        .neq("status", "cancelled");
      if (error) throw error;
      const { data: auth } = await supabase.auth.getUser();
      const rows = (data ?? []).map((s) => ({
        store_id: s.store_id,
        legal_entity_id: s.legal_entity_id,
        employee_id: keepEmployees ? s.employee_id : null,
        shift_type_id: s.shift_type_id,
        date: dst[src.indexOf(s.date)],
        start_time: s.start_time,
        end_time: s.end_time,
        break_minutes: s.break_minutes,
        status: "draft" as const,
        note: s.note,
        created_by: auth.user?.id ?? null,
      }));
      if (!rows.length) return 0;
      const { error: insErr } = await supabase.from("shifts").insert(rows);
      if (insErr) throw insErr;
      return rows.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });
}

export function useAvailability(employeeId?: string | null) {
  return useQuery({
    queryKey: KEY.availability(employeeId),
    queryFn: async () => {
      let q = supabase.from("availability").select("*");
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q.order("weekday", { nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as Availability[];
    },
  });
}

export function useSaveAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Availability> & { employee_id: string; from_time: string; to_time: string; type: Availability["type"] }) => {
      if (input.id) {
        const { error } = await supabase.from("availability").update(input).eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("availability").insert(input);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useDeleteAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability"] }),
  });
}

export function useShiftRequests(shiftIds: string[]) {
  const ids = [...shiftIds].sort().join(",");
  return useQuery({
    queryKey: ["shift_requests", ids],
    enabled: shiftIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_requests")
        .select("*")
        .in("shift_id", shiftIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShiftRequest[];
    },
  });
}

export function useMyShiftRequests(employeeId?: string | null) {
  return useQuery({
    queryKey: ["my_shift_requests", employeeId],
    enabled: Boolean(employeeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_requests")
        .select("*")
        .or(`from_employee_id.eq.${employeeId},to_employee_id.eq.${employeeId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShiftRequest[];
    },
  });
}

/**
 * Skapar en förfrågan. Byten som avgörs tidigare än enhetens cutoff före
 * passtart auto-godkänns; inom cutoff krävs chefsbeslut.
 */
export function useCreateShiftRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shift,
      type,
      fromEmployeeId,
      toEmployeeId,
      cutoffHours,
      note,
    }: {
      shift: Shift;
      type: ShiftRequest["type"];
      fromEmployeeId: string | null;
      toEmployeeId: string | null;
      cutoffHours: number;
      note?: string;
    }) => {
      const hoursUntil = (shiftStart(shift).getTime() - Date.now()) / 3600_000;
      const auto = hoursUntil > cutoffHours && type !== "swap";
      const { data, error } = await supabase
        .from("shift_requests")
        .insert({
          shift_id: shift.id,
          type,
          from_employee_id: fromEmployeeId,
          to_employee_id: toEmployeeId,
          note: note ?? null,
          status: auto ? "auto_approved" : "pending",
          decided_at: auto ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;
      if (auto) await applyRequest(data as ShiftRequest);
      return data as ShiftRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift_requests"] });
      qc.invalidateQueries({ queryKey: ["my_shift_requests"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

async function applyRequest(req: ShiftRequest) {
  const patch =
    req.type === "handover"
      ? { employee_id: null }
      : { employee_id: req.to_employee_id };
  const { error } = await supabase.from("shifts").update(patch).eq("id", req.shift_id);
  if (error) throw error;
}

export function useDecideShiftRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ request, approve }: { request: ShiftRequest; approve: boolean }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("shift_requests")
        .update({
          status: approve ? "approved" : "rejected",
          decided_by: auth.user?.id ?? null,
          decided_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (error) throw error;
      if (approve) await applyRequest(request);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shift_requests"] });
      qc.invalidateQueries({ queryKey: ["my_shift_requests"] });
      qc.invalidateQueries({ queryKey: ["shifts"] });
    },
  });
}

export function useShiftHistory(shiftId: string | null) {
  return useQuery({
    queryKey: KEY.history(shiftId),
    enabled: Boolean(shiftId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_history")
        .select("*")
        .eq("shift_id", shiftId!)
        .order("changed_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEmployeeCompetencies() {
  return useQuery({
    queryKey: KEY.competencies,
    queryFn: async () => {
      const { data, error } = await supabase.from("employee_competencies").select("*");
      if (error) throw error;
      return (data ?? []) as { id: string; employee_id: string; competency: string; note: string | null }[];
    },
  });
}

export function useSaveCompetency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ employee_id, competency }: { employee_id: string; competency: string }) => {
      const { error } = await supabase
        .from("employee_competencies")
        .upsert({ employee_id, competency }, { onConflict: "employee_id,competency" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.competencies }),
  });
}

export function useDeleteCompetency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_competencies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY.competencies }),
  });
}
