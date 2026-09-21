import { supabase } from "@/integrations/supabase/client";

/**
 * Skapa det en bild ska ligga på, direkt från bilden.
 *
 * Ibland finns saken eller varan inte i registret ännu — man har bara bilden.
 * Då skapas den här, med bilden som första bild, och kan fyllas på senare.
 */

function slug(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[åä]/g, "a")
      .replace(/ö/g, "o")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 18) || "vara"
  );
}

/** Ny sak i registret Utrustning & material. */
export async function createResourceTarget(name: string, imageUrl?: string | null) {
  const { data, error } = await supabase
    .from("resource_items")
    .insert({ name, ...(imageUrl ? { image: imageUrl } : {}) } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}

/** Ny vara i produktlistan. Kategori krävs så varan hamnar rätt i listan. */
export async function createProductTarget(
  name: string,
  category: string,
  imageUrl?: string | null,
) {
  const sku = `NY-${slug(name)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const { data, error } = await supabase
    .from("products")
    .insert({
      sku,
      name,
      category,
      active: true,
      ...(imageUrl ? { image_url: imageUrl } : {}),
    } as never)
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as string;
}
