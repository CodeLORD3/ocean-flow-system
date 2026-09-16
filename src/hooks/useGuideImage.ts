import { useMutation } from "@tanstack/react-query";
import { prepareUpload, COMPRESS_PHOTO } from "@/lib/imageCompress";
import { supabase } from "@/integrations/supabase/client";

const BUCKET = "logos";

/**
 * Laddar upp en bild som hör till en uppgifts arbetsbeskrivning (mål, vara
 * eller steg) och ger tillbaka adressen. Bilden hamnar inte i bildflödet —
 * den är en del av beskrivningen, inte dokumentation av dagens arbete.
 */
export function useUploadGuideImage() {
  return useMutation({
    mutationFn: async ({ file, taskId }: { file: File; taskId: string }) => {
      const prepared = await prepareUpload(file, COMPRESS_PHOTO);
      const path = `task-guides/${taskId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${prepared.ext}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(path, prepared.file, { upsert: true, contentType: prepared.contentType });
      if (error) throw error;
      return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
  });
}
