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
