/**
 * Bildoptimering vid visning.
 *
 * Många bilder i lagringen är originalfoton på flera megabyte (kameran i
 * butiken laddar upp 7–8 MB). Att visa dem i små rutor gör systemet segt,
 * särskilt på mobil. Här skickas publika lagrings-URL:er genom Supabase
 * bildtransformering så webbläsaren bara hämtar den storlek som faktiskt visas.
 */

const PUBLIC_OBJECT = "/storage/v1/object/public/";
const RENDER_IMAGE = "/storage/v1/render/image/public/";

/**
 * Returnerar en nedskalad variant av en publik lagringsbild.
 * Externa URL:er, blob/data-URL:er och signerade privata filer lämnas orörda.
 */
export function thumbUrl(
  url: string | null | undefined,
  width: number,
  quality = 70,
): string | undefined {
  if (!url) return undefined;
  if (!url.includes(PUBLIC_OBJECT)) return url;
  const [base, query] = url.split("?");
  const rendered = base.replace(PUBLIC_OBJECT, RENDER_IMAGE);
  const params = new URLSearchParams(query || "");
  params.set("width", String(Math.round(width)));
  params.set("quality", String(quality));
  params.set("resize", "contain");
  return `${rendered}?${params.toString()}`;
}

/** Förinställningar för de storlekar som används i gränssnittet. */
export const THUMB_AVATAR = 96;
export const THUMB_TILE = 400;
export const THUMB_CARD = 800;
export const THUMB_FULL = 1600;
