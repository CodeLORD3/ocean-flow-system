import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PersonEvent } from "@/lib/personEvents";
import { taskRoute, imageRoute } from "@/lib/personEvents";

const LIMIT = 100;

export interface PersonProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  workplace: string | null;
  profile_image_url: string | null;
  store_id: string | null;
  store_name: string | null;
  user_id: string | null;
  primary_role: string | null;
  created_at: string | null;
}

/** En persons grunduppgifter. Känsliga uppgifter ligger kvar i Personalregistret. */
export function usePersonProfile(staffId?: string | null) {
  return useQuery({
    queryKey: ["person-profile", staffId],
    enabled: !!staffId,
    queryFn: async (): Promise<PersonProfile | null> => {
      const { data, error } = await supabase
        .from("staff_access")
        .select("id, first_name, last_name, phone, email, workplace, profile_image_url, store_id, store_name, user_id, primary_role, created_at")
        .eq("id", staffId!)
        .maybeSingle();
      if (error) throw error;
      return (data as PersonProfile) ?? null;
    },
  });
}

export interface PersonTaskRow {
  id: string;
  task: string;
  note: string | null;
  done: boolean;
  done_at: string | null;
  checklist_date: string | null;
  mine: "assigned" | "done";
}

export interface PersonImageRow {
  id: string;
  url: string;
  title: string | null;
  created_at: string;
}

export interface PersonTimeline {
  events: PersonEvent[];
  tasks: PersonTaskRow[];
  images: PersonImageRow[];
  doneCount30d: number;
  openAssigned: number;
  imageCount: number;
  lastActiveAt: string | null;
}

function fullName(p?: PersonProfile | null) {
  return [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();
}

/**
 * Personens händelser, hämtade ur de tabeller som redan loggar arbete.
 * Varje källa hämtas med egen limit — aldrig en fråga per rad.
 */
export function usePersonTimeline(staffId?: string | null, profile?: PersonProfile | null) {
  const name = fullName(profile);
  return useQuery({
    queryKey: ["person-timeline", staffId, name, profile?.user_id],
    enabled: !!staffId,
    staleTime: 30_000,
    queryFn: async (): Promise<PersonTimeline> => {
      const id = staffId!;
      const [doneTasks, assignedTasks, uploaded, edited, activity, comments, observations, shifts, logs, imageTotal] =
        await Promise.all([
          supabase
            .from("checklist_items")
            .select("id, task, note, done, done_at, day_id, checklist_days(checklist_date)")
            .eq("completed_by_staff_id", id)
            .order("done_at", { ascending: false })
            .limit(LIMIT),
          supabase
            .from("checklist_items")
            .select("id, task, note, done, done_at, created_at, day_id, checklist_days(checklist_date)")
            .eq("assigned_staff_id", id)
            .order("created_at", { ascending: false })
            .limit(LIMIT),
          supabase
            .from("entity_images")
            .select("id, url, title, created_at")
            .eq("uploaded_by_staff_id", id)
            .order("created_at", { ascending: false })
            .limit(LIMIT),
          supabase
            .from("entity_images")
            .select("id, url, title, last_edited_at")
            .eq("last_edited_by_staff_id", id)
            .not("last_edited_at", "is", null)
            .order("last_edited_at", { ascending: false })
            .limit(LIMIT),
          supabase
            .from("image_activity")
            .select("id, media_id, action_type, field_name, created_at")
            .eq("staff_id", id)
            .order("created_at", { ascending: false })
            .limit(LIMIT),
          profile?.user_id
            ? supabase
                .from("entity_image_comments")
                .select("id, image_id, body, created_at")
                .eq("user_id", profile.user_id)
                .order("created_at", { ascending: false })
                .limit(LIMIT)
            : Promise.resolve({ data: [], error: null } as any),
          supabase
            .from("image_observations")
            .select("id, comment, observation_type, created_at")
            .eq("created_by_staff_id", id)
            .order("created_at", { ascending: false })
            .limit(LIMIT),
          supabase
            .from("staff_shifts")
            .select("id, clocked_in_at, clocked_out_at, store_id")
            .eq("staff_id", id)
            .order("clocked_in_at", { ascending: false })
            .limit(50),
          name
            ? supabase
                .from("activity_logs")
                .select("id, description, action_type, created_at, entity_type, entity_id")
                .eq("performed_by", name)
                .order("created_at", { ascending: false })
                .limit(LIMIT)
            : Promise.resolve({ data: [], error: null } as any),
          supabase
            .from("entity_images")
            .select("id", { count: "exact", head: true })
            .eq("uploaded_by_staff_id", id),
        ]);

      const events: PersonEvent[] = [];
      const tasks: PersonTaskRow[] = [];

      (doneTasks.data ?? []).forEach((r: any) => {
        const date = r.checklist_days?.checklist_date ?? null;
        tasks.push({ id: r.id, task: r.task, note: r.note, done: !!r.done, done_at: r.done_at, checklist_date: date, mine: "done" });
        if (r.done_at) {
          events.push({
            id: `task-done-${r.id}`,
            at: r.done_at,
            kind: "task_done",
            title: `Utförde uppgift: ${r.task}`,
            meta: r.note || null,
            route: taskRoute(r.id),
          });
        }
      });

      (assignedTasks.data ?? []).forEach((r: any) => {
        const date = r.checklist_days?.checklist_date ?? null;
        if (!tasks.some((t) => t.id === r.id)) {
          tasks.push({ id: r.id, task: r.task, note: r.note, done: !!r.done, done_at: r.done_at, checklist_date: date, mine: "assigned" });
        }
        events.push({
          id: `task-assigned-${r.id}`,
          at: r.created_at ?? `${date ?? ""}T08:00:00`,
          kind: "task_assigned",
          title: `Tilldelades uppgift: ${r.task}`,
          meta: date ? `Gäller ${date}` : null,
          route: taskRoute(r.id),
        });
      });

      const images: PersonImageRow[] = (uploaded.data ?? []).map((r: any) => ({
        id: r.id, url: r.url, title: r.title, created_at: r.created_at,
      }));

      images.forEach((r) => {
        events.push({
          id: `img-up-${r.id}`,
          at: r.created_at,
          kind: "image_uploaded",
          title: r.title ? `Lade ut bilden ${r.title}` : "Lade ut en bild",
          route: imageRoute(r.id),
        });
      });

      (edited.data ?? []).forEach((r: any) => {
        events.push({
          id: `img-ed-${r.id}`,
          at: r.last_edited_at,
          kind: "image_edited",
          title: r.title ? `Ändrade bilden ${r.title}` : "Ändrade en bild",
          route: imageRoute(r.id),
        });
      });

      const ACTION_TEXT: Record<string, string> = {
        uploaded: "laddade upp en bild",
        classified: "kategoriserade en bild",
        reclassified: "ändrade en bilds uppgifter",
        unlinked: "tog bort en koppling på en bild",
        commented: "kommenterade en bild",
      };
      (activity.data ?? []).forEach((r: any) => {
        if (r.action_type === "uploaded") return; // redan täckt av bilden
        events.push({
          id: `act-${r.id}`,
          at: r.created_at,
          kind: "image_activity",
          title: ACTION_TEXT[r.action_type] ?? r.action_type,
          meta: r.field_name || null,
          route: r.media_id ? imageRoute(r.media_id) : null,
        });
      });

      (comments.data ?? []).forEach((r: any) => {
        events.push({
          id: `cmt-${r.id}`,
          at: r.created_at,
          kind: "image_comment",
          title: "Kommenterade en bild",
          meta: r.body || null,
          route: r.image_id ? imageRoute(r.image_id) : null,
        });
      });

      (observations.data ?? []).forEach((r: any) => {
        events.push({
          id: `obs-${r.id}`,
          at: r.created_at,
          kind: "observation",
          title: "Rapporterade en iakttagelse",
          meta: r.comment || r.observation_type || null,
        });
      });

      (shifts.data ?? []).forEach((r: any) => {
        events.push({ id: `in-${r.id}`, at: r.clocked_in_at, kind: "clock_in", title: "Stämplade in" });
        if (r.clocked_out_at) {
          events.push({ id: `out-${r.id}`, at: r.clocked_out_at, kind: "clock_out", title: "Stämplade ut" });
        }
      });

      (logs.data ?? []).forEach((r: any) => {
        events.push({
          id: `log-${r.id}`,
          at: r.created_at,
          kind: "system",
          title: r.description || r.action_type,
        });
      });

      events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
      const doneCount30d = tasks.filter((t) => t.mine === "done" && t.done_at && t.done_at >= cutoff).length;
      const openAssigned = tasks.filter((t) => t.mine === "assigned" && !t.done).length;

      return {
        events,
        tasks,
        images,
        doneCount30d,
        openAssigned,
        imageCount: imageTotal.count ?? images.length,
        lastActiveAt: events[0]?.at ?? null,
      };
    },
  });
}
