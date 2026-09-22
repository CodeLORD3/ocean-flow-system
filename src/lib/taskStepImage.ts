import { supabase } from "@/integrations/supabase/client";
import { prepareUpload, COMPRESS_PHOTO } from "@/lib/imageCompress";

const BUCKET = "logos";

/**
 * Bilden till ett steg i arbetsbeskrivningen.
 * Filen läggs upp och registreras också i bildbiblioteket, så den går att
 * hitta igen — den gamla bilden tas aldrig bort, steget pekar bara på en ny.
 */
export async function uploadTaskStepImage(file: File, taskId: string): Promise<string> {
  const prepared = await prepareUpload(file, COMPRESS_PHOTO);
  const path = `entity-images/task-step/${taskId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${prepared.ext}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, prepared.file, { upsert: true, contentType: prepared.contentType });
  if (upErr) throw upErr;
  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const url = urlData.publicUrl;

  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id ?? null;
  let uploaderName: string | null = auth?.user?.email ?? null;
  if (uid) {
    const { data: st } = await supabase
      .from("staff")
      .select("first_name, last_name")
      .eq("user_id", uid)
      .maybeSingle();
    if (st) uploaderName = `${st.first_name ?? ""} ${st.last_name ?? ""}`.trim() || uploaderName;
  }
  await supabase.from("entity_images").insert({
    entity_type: "task",
    entity_id: taskId,
    url,
    caption: "Stegbild",
    uploaded_by: uid,
    uploaded_by_name: uploaderName,
    checklist_item_id: taskId,
  } as never);

  return url;
}
