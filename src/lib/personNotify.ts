import { supabase } from "@/integrations/supabase/client";

/**
 * Personliga notiser: "någon kommenterade din bild", "någon ändrade något du
 * gjort", "du har fått en uppgift".
 *
 * Reglerna:
 * - Notisen är alltid personlig (notifications.user_id = mottagarens konto) och
 *   ligger i portal "personal" så att den aldrig räknas in i sidornas siffror.
 * - Man får aldrig en notis om sin egen handling.
 * - dedupe_key hindrar dubbletter om samma handling råkar sparas två gånger.
 */

const PERSONAL_PORTAL = "personal";

export type PersonNotice = {
  /** Mottagare som personal-id (löses upp till konto). */
  staffIds?: (string | null | undefined)[];
  /** Mottagare som konto-id, när det redan är känt. */
  userIds?: (string | null | undefined)[];
  message: string;
  /** Sidan notisen leder till, t.ex. "/image-feed?bild=…". */
  targetPage: string;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
};

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function usersForStaff(staffIds: string[]): Promise<string[]> {
  if (!staffIds.length) return [];
  const { data } = await supabase.from("staff").select("user_id").in("id", staffIds);
  return (data ?? []).map((r: any) => r.user_id).filter(Boolean);
}

/** Skickar en personlig notis till alla mottagare utom den som utförde handlingen. */
export async function sendPersonNotices(notice: PersonNotice): Promise<void> {
  try {
    const me = await currentUserId();
    const fromStaff = await usersForStaff(
      (notice.staffIds ?? []).filter((v): v is string => !!v),
    );
    const targets = [...new Set([...fromStaff, ...(notice.userIds ?? [])])]
      .filter((v): v is string => !!v)
      .filter((uid) => uid !== me);
    if (!targets.length) return;

    const rows = targets.map((user_id) => ({
      user_id,
      portal: PERSONAL_PORTAL,
      target_page: notice.targetPage,
      message: notice.message,
      entity_type: notice.entityType ?? null,
      entity_id: notice.entityId ?? null,
      dedupe_key: notice.dedupeKey ? `${notice.dedupeKey}:${user_id}` : null,
    }));

    await supabase.from("notifications").insert(rows as never);
  } catch {
    // En notis får aldrig stoppa själva handlingen.
  }
}

/* ----------------------------------------------------------------- bilder */

async function imageRecipients(mediaId: string) {
  const [{ data: img }, { data: comments }] = await Promise.all([
    supabase
      .from("entity_images")
      .select("id, title, uploaded_by_staff_id")
      .eq("id", mediaId)
      .maybeSingle(),
    supabase.from("entity_image_comments").select("user_id").eq("image_id", mediaId).limit(200),
  ]);
  return {
    title: (img as any)?.title as string | null,
    staffIds: [(img as any)?.uploaded_by_staff_id ?? null],
    userIds: [...new Set((comments ?? []).map((c: any) => c.user_id).filter(Boolean))] as string[],
  };
}

/** Någon kommenterade en bild — uppladdaren och tidigare kommentatorer får notis. */
export async function notifyImageComment(mediaId: string, actorName: string | null, body: string) {
  const r = await imageRecipients(mediaId);
  const what = r.title ? `bilden ${r.title}` : "bilden";
  const short = body.length > 60 ? `${body.slice(0, 60)}…` : body;
  await sendPersonNotices({
    staffIds: r.staffIds,
    userIds: r.userIds,
    message: `${actorName || "Någon"} kommenterade ${what}: ${short}`,
    targetPage: `/image-feed?bild=${mediaId}`,
    entityType: "image",
    entityId: mediaId,
    dedupeKey: `image-comment:${mediaId}:${Date.now()}`,
  });
}

/** Någon ändrade en bild som någon annan lagt ut eller kommenterat. */
export async function notifyImageEdited(mediaId: string, actorName: string | null, what: string) {
  const r = await imageRecipients(mediaId);
  const title = r.title ? `bilden ${r.title}` : "en bild du lagt ut";
  await sendPersonNotices({
    staffIds: r.staffIds,
    userIds: r.userIds,
    message: `${actorName || "Någon"} ändrade ${title} (${what})`,
    targetPage: `/image-feed?bild=${mediaId}`,
    entityType: "image",
    entityId: mediaId,
    dedupeKey: `image-edit:${mediaId}:${Date.now()}`,
  });
}

/* --------------------------------------------------------------- uppgifter */

/** Du har blivit tilldelad en uppgift. */
export async function notifyTaskAssigned(
  taskId: string,
  staffId: string | null | undefined,
  taskName: string,
  actorName: string | null,
) {
  if (!staffId) return;
  await sendPersonNotices({
    staffIds: [staffId],
    message: `${actorName || "Någon"} tilldelade dig uppgiften ${taskName}`,
    targetPage: `/uppgift/${taskId}`,
    entityType: "task",
    entityId: taskId,
    dedupeKey: `task-assigned:${taskId}:${staffId}`,
  });
}
