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
  template_id?: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  page_comments?: Record<string, string> | null;
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

export const DEFAULT_CHECKLIST_TEMPLATE_ID = "00000000-0000-4000-8000-0000000000c1";

export type ChecklistTemplate = {
  id: string;
  store_id: string | null;
  name: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  /** 0=Söndag … 6=Lördag. Tom lista = gäller alla dagar. */
  weekdays: number[];
};

/** Gäller checklistan given veckodag? Tom weekdays = alla dagar. */
export function templateAppliesOn(tpl: ChecklistTemplate, iso: string) {
  const wd = tpl.weekdays ?? [];
  if (wd.length === 0) return true;
  const [y, m, d] = iso.split("-").map(Number);
  return wd.includes(new Date(y, m - 1, d).getDay());
}

export const WEEKDAY_SHORT = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];


/** Menyn med butikens checklistor (globala mallar + butikens egna). */
export function useChecklistTemplates(storeId?: string | null) {
  return useQuery({
    queryKey: ["checklist-templates", storeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("checklist_templates").select("*").eq("active", true);
      if (storeId) q = q.or(`store_id.is.null,store_id.eq.${storeId}`);
      const { data, error } = await q.order("sort_order").order("name");
      if (error) throw error;
      return (data || []) as ChecklistTemplate[];
    },
  });
}

export function useCreateChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; description?: string; storeId?: string | null }) => {
      const name = input.name.trim();
      if (!name) throw new Error("Ge checklistan ett namn.");
      const { data, error } = await supabase
        .from("checklist_templates")
        .insert({
          name,
          description: input.description?.trim() || null,
          store_id: input.storeId ?? null,
          sort_order: 100,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as ChecklistTemplate;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-templates"] }),
  });
}

export function useRenameChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const clean = name.trim();
      if (!clean) throw new Error("Namnet kan inte vara tomt.");
      const { error } = await supabase.from("checklist_templates").update({ name: clean }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-templates"] }),
  });
}

/** Arkiverar en checklista (behåller historiken/rapporterna). */
export function useArchiveChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      if (id === DEFAULT_CHECKLIST_TEMPLATE_ID) throw new Error("Standardlistan kan inte tas bort.");
      const { error } = await supabase.from("checklist_templates").update({ active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-templates"] }),
  });
}

/** Dagens checklista för en butik och vald lista — skapas automatiskt från mallen om den inte finns. */
export function useDailyChecklist(storeId?: string | null, date?: string, templateId?: string | null) {
  const iso = date || todayIso();
  const tplId = templateId || DEFAULT_CHECKLIST_TEMPLATE_ID;
  const { staff } = useStaffAuth();

  return useQuery({
    queryKey: ["checklist-day", storeId, iso, tplId],
    queryFn: async () => {
      // Hämta eller skapa dagens checklista
      let { data: day, error } = await supabase
        .from("checklist_days")
        .select("*")
        .eq("store_id", storeId!)
        .eq("checklist_date", iso)
        .eq("template_id", tplId)
        .maybeSingle();
      if (error) throw error;

      if (!day) {
        const { data: created, error: cErr } = await supabase
          .from("checklist_days")
          .insert({
            store_id: storeId!,
            checklist_date: iso,
            template_id: tplId,
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
            .eq("template_id", tplId)
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
          .eq("template_id", tplId)
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

/** Ändrar signatur i efterhand — t.ex. när någon annan gjort uppgiften i den inloggades konto. */
export function useSetChecklistSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, signature }: { ids: string[]; signature: string }) => {
      const sig = signature.trim().toUpperCase().slice(0, 8);
      if (!sig) throw new Error("Skriv en signatur, t.ex. initialer.");
      if (ids.length === 0) throw new Error("Inga uppgifter valda.");
      const { error } = await supabase
        .from("checklist_items")
        .update({ signature: sig })
        .in("id", ids);
      if (error) throw error;
      return sig;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
      qc.invalidateQueries({ queryKey: ["checklist-day-items"] });
    },
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
        .select("*, stores(name), checklist_templates(name)")
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
        listName: d.checklist_templates?.name ?? "Daglig checklista",
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

/* ── Redigering: tid, nya rader, borttagning ──────────────────────────────── */

/** Normaliserar användarinmatning till "HH:MM". Returnerar null om tomt/ogiltigt. */
export function normalizeTimeLabel(raw: string): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2})[:.\s-]?(\d{2})?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function timeValue(label: string | null | undefined) {
  const n = normalizeTimeLabel(label || "");
  if (!n) return Number.MAX_SAFE_INTEGER; // rader utan tid hamnar sist i sektionen
  const [h, m] = n.split(":").map(Number);
  return h * 60 + m;
}

/** Sorterar om alla rader: sektionerna behåller sin ordning, raderna sorteras på tid. */
async function resequenceDay(dayId: string) {
  const { data: items, error } = await supabase
    .from("checklist_items")
    .select("id, section, time_label, sort_order")
    .eq("day_id", dayId)
    .order("sort_order");
  if (error) throw error;
  const list = items || [];

  const sectionOrder: string[] = [];
  list.forEach((i: any) => {
    if (!sectionOrder.includes(i.section)) sectionOrder.push(i.section);
  });

  const sorted = [...list].sort((a: any, b: any) => {
    const sa = sectionOrder.indexOf(a.section);
    const sb = sectionOrder.indexOf(b.section);
    if (sa !== sb) return sa - sb;
    const ta = timeValue(a.time_label);
    const tb = timeValue(b.time_label);
    if (ta !== tb) return ta - tb;
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  const updates = sorted
    .map((row: any, idx: number) => ({ row, next: (idx + 1) * 10 }))
    .filter(({ row, next }) => row.sort_order !== next);

  for (const { row, next } of updates) {
    const { error: uErr } = await supabase
      .from("checklist_items")
      .update({ sort_order: next })
      .eq("id", row.id);
    if (uErr) throw uErr;
  }
}

/** Uppdaterar tiden för en rad och flyttar raden till rätt plats i sektionen. */
export function useSetChecklistItemTime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dayId, time }: { id: string; dayId: string; time: string }) => {
      const normalized = normalizeTimeLabel(time);
      if (time.trim() && !normalized) throw new Error("Ogiltig tid — skriv t.ex. 07:30.");
      const { error } = await supabase.from("checklist_items").update({ time_label: normalized }).eq("id", id);
      if (error) throw error;
      await resequenceDay(dayId);
      return normalized;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-day"] }),
  });
}

/** Lägger till en ny rad i en sektion — placeras direkt på rätt plats efter tid. */
export function useAddChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      dayId: string;
      section: string;
      task: string;
      time?: string;
      category?: string;
    }) => {
      const task = input.task.trim();
      if (!task) throw new Error("Skriv vad uppgiften är.");
      const normalized = normalizeTimeLabel(input.time || "");
      if ((input.time || "").trim() && !normalized) throw new Error("Ogiltig tid — skriv t.ex. 07:30.");

      const { data: last } = await supabase
        .from("checklist_items")
        .select("sort_order")
        .eq("day_id", input.dayId)
        .order("sort_order", { ascending: false })
        .limit(1);
      const nextOrder = ((last?.[0]?.sort_order as number) ?? 0) + 10;

      const { error } = await supabase.from("checklist_items").insert({
        day_id: input.dayId,
        section: input.section,
        task,
        time_label: normalized,
        category: input.category?.trim() || null,
        sort_order: nextOrder,
      });
      if (error) throw error;
      await resequenceDay(input.dayId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-day"] }),
  });
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; dayId?: string }) => {
      const { error } = await supabase.from("checklist_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist-day"] }),
  });
}

/* ---------------- Signaturförfrågningar ---------------- */

export type SignatureRequest = {
  id: string;
  item_id: string;
  day_id: string | null;
  store_id: string | null;
  requested_signature: string;
  target_staff_id: string | null;
  requested_by_staff_id: string | null;
  requested_by_name: string | null;
  previous_signature: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
};

/** Väntande signaturförfrågningar för en checklistdag. */
export function useSignatureRequests(dayId?: string | null) {
  return useQuery({
    queryKey: ["checklist-signature-requests", dayId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_signature_requests")
        .select("*")
        .eq("day_id", dayId!)
        .eq("status", "pending");
      if (error) throw error;
      return (data || []) as SignatureRequest[];
    },
    enabled: !!dayId,
  });
}

/** Alla väntande förfrågningar som gäller den inloggade personen. */
export function useMySignatureRequests() {
  const { staff } = useStaffAuth();
  return useQuery({
    queryKey: ["my-signature-requests", staff?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_signature_requests")
        .select("*, checklist_items(task, section, time_label)")
        .eq("target_staff_id", staff!.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as (SignatureRequest & {
        checklist_items: { task: string; section: string; time_label: string | null } | null;
      })[];
    },
    enabled: !!staff?.id,
  });
}

/** Skapar förfrågan om signaturbyte — signaturen ändras först när mottagaren accepterar. */
export function useRequestSignatureChange() {
  const qc = useQueryClient();
  const { staff } = useStaffAuth();
  return useMutation({
    mutationFn: async ({
      items,
      signature,
      targetStaffId,
      dayId,
      storeId,
    }: {
      items: ChecklistItem[];
      signature: string;
      targetStaffId: string;
      dayId: string;
      storeId?: string | null;
    }) => {
      const sig = signature.trim().toUpperCase().slice(0, 8);
      if (!sig) throw new Error("Välj vilken person signaturen ska ändras till.");
      if (!targetStaffId) throw new Error("Välj en person med konto — förfrågan måste kunna accepteras.");
      if (items.length === 0) throw new Error("Inga uppgifter valda.");

      // Ta bort tidigare väntande förfrågningar på samma uppgifter
      const ids = items.map((i) => i.id);
      await supabase
        .from("checklist_signature_requests")
        .delete()
        .in("item_id", ids)
        .eq("status", "pending");

      const { error } = await supabase.from("checklist_signature_requests").insert(
        items.map((i) => ({
          item_id: i.id,
          day_id: dayId,
          store_id: storeId ?? null,
          requested_signature: sig,
          target_staff_id: targetStaffId,
          requested_by_staff_id: staff?.id ?? null,
          requested_by_name: staff ? `${staff.first_name} ${staff.last_name}` : null,
          previous_signature: i.signature,
        }))
      );
      if (error) throw error;
      return { sig, count: items.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-signature-requests"] });
      qc.invalidateQueries({ queryKey: ["my-signature-requests"] });
    },
  });
}

/** Mottagaren accepterar eller avvisar förfrågan. Signaturen ändras bara vid accept. */
export function useRespondSignatureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ request, accept }: { request: SignatureRequest; accept: boolean }) => {
      if (accept) {
        const { error } = await supabase
          .from("checklist_items")
          .update({ signature: request.requested_signature })
          .eq("id", request.item_id);
        if (error) throw error;
      }
      const { error: rErr } = await supabase
        .from("checklist_signature_requests")
        .update({ status: accept ? "accepted" : "rejected", responded_at: new Date().toISOString() })
        .eq("id", request.id);
      if (rErr) throw rErr;
      return accept;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
      qc.invalidateQueries({ queryKey: ["checklist-day-items"] });
      qc.invalidateQueries({ queryKey: ["checklist-signature-requests"] });
      qc.invalidateQueries({ queryKey: ["my-signature-requests"] });
    },
  });
}

/** Avbryter en väntande förfrågan. */
export function useCancelSignatureRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_signature_requests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-signature-requests"] });
      qc.invalidateQueries({ queryKey: ["my-signature-requests"] });
    },
  });
}

/** Kommentar per sida i checklistan (nyckel = sidnummer, 1-baserat). */
export function useSetChecklistPageComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      dayId,
      page,
      comment,
      current,
    }: {
      dayId: string;
      page: number;
      comment: string;
      current?: Record<string, string> | null;
    }) => {
      const next = { ...(current || {}) };
      const text = comment.trim();
      if (text) next[String(page)] = text;
      else delete next[String(page)];
      const { error } = await supabase
        .from("checklist_days")
        .update({ page_comments: next })
        .eq("id", dayId);
      if (error) throw error;
      return next;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checklist-day"] });
      qc.invalidateQueries({ queryKey: ["checklist-reports"] });
    },
  });
}
