import { supabase } from "@/integrations/supabase/client";
import { todayIso } from "@/hooks/useChecklist";

/** Restrict register edits to this store's unfinished work, never completed history. */
export async function registerTaskDayIds(storeId: string | null | undefined) {
  if (!storeId) throw new Error("Välj en butik innan uppgiften ändras.");
  const ids: string[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("checklist_days").select("id")
      .eq("store_id", storeId).gte("checklist_date", todayIso()).order("id").range(offset, offset + 499);
    if (error) throw error;
    ids.push(...(data ?? []).map((row) => row.id));
    if ((data?.length ?? 0) < 500) return ids;
  }
}

export async function assertLocalTemplate(templateItemId: string | null | undefined, storeId: string) {
  if (!templateItemId) return;
  const { data, error } = await supabase.from("checklist_template_items").select("store_id")
    .eq("id", templateItemId).single();
  if (error) throw error;
  if (data.store_id !== storeId) throw new Error("Det här är en gemensam uppgift. Ändra den i checklistans mall, inte i butikens register.");
}