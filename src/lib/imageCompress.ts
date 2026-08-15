/**
 * Bildkomprimering i webbläsaren innan uppladdning till lagringen.
 *
 * Bokningssidan visar bilderna små, så en bred kant på 1200 px och JPEG-kvalitet
 * 0,82 räcker. Det håller nere både uppladdningstiden i butiken och
 * sidladdningen för kunden.
 */

export interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

/** Komprimerar en bildfil till JPEG. Returnerar originalet om något inte går. */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.82 } = opts;
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

/** Förinställningar: foton visas stora, avatarer/logotyper alltid små. */
export const COMPRESS_PHOTO: CompressOptions = { maxWidth: 1600, maxHeight: 1600, quality: 0.82 };
export const COMPRESS_AVATAR: CompressOptions = { maxWidth: 512, maxHeight: 512, quality: 0.85 };

/**
 * Komprimerar inför uppladdning och returnerar även filändelse + content type
 * så anropande kod kan bygga rätt lagringsnyckel.
 */
export async function prepareUpload(
  file: File,
  opts: CompressOptions = COMPRESS_PHOTO,
): Promise<{ file: File; ext: string; contentType: string }> {
  const out = await compressImage(file, opts);
  const ext = out.name.split(".").pop()?.toLowerCase() || "jpg";
  return { file: out, ext, contentType: out.type || "application/octet-stream" };
}
