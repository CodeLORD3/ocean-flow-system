/**
 * Engångsjobb: komprimerar bilder som redan ligger i lagringen.
 *
 * Äldre uppladdningar sparades i full kamerastorlek (flera MB per bild), vilket
 * gör gallerierna långsamma. Funktionen laddar ner varje bild, skalar den till
 * max 1600 px och skriver tillbaka den som JPEG på samma sökväg — URL:erna i
 * databasen ändras alltså inte, bilderna visas precis som förut.
 *
 * Anropas i omgångar med rubriken `x-job-token`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import {
  ImageMagick,
  initializeImageMagick,
  MagickFormat,
} from "https://deno.land/x/imagemagick_deno@0.0.31/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-job-token",
};

const MAX_EDGE = 1600;
const QUALITY = 82;

let magickReady = false;
async function ensureMagick() {
  if (!magickReady) {
    await initializeImageMagick();
    magickReady = true;
  }
}

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!m) return null;
  return { bucket: m[1], path: decodeURIComponent(m[2]) };
}

async function shrink(bytes: Uint8Array): Promise<Uint8Array | null> {
  await ensureMagick();
  return await new Promise<Uint8Array | null>((resolve) => {
    try {
      ImageMagick.read(bytes, (img) => {
        const scale = Math.min(1, MAX_EDGE / img.width, MAX_EDGE / img.height);
        if (scale < 1) {
          img.resize(Math.round(img.width * scale), Math.round(img.height * scale));
        }
        img.quality = QUALITY;
        img.write(MagickFormat.Jpeg, (data) => resolve(new Uint8Array(data)));
      });
    } catch (_e) {
      resolve(null);
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = req.headers.get("x-job-token");
  if (!token || token !== Deno.env.get("IMAGE_JOB_TOKEN")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const table: string = body.table ?? "entity_images";
  const column: string = body.column ?? "url";
  const limit: number = Math.min(Number(body.limit ?? 10), 40);
  const offset: number = Number(body.offset ?? 0);
  const minBytes: number = Number(body.minBytes ?? 400_000);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: rows, error } = await supabase
    .from(table)
    .select(`id, ${column}`)
    .not(column, "is", null)
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let processed = 0;
  let skipped = 0;
  let savedBytes = 0;
  const failures: string[] = [];

  for (const row of rows ?? []) {
    const url = (row as Record<string, string>)[column];
    const parsed = url ? parseStorageUrl(url) : null;
    if (!parsed) {
      skipped++;
      continue;
    }
    try {
      const dl = await supabase.storage.from(parsed.bucket).download(parsed.path);
      if (dl.error || !dl.data) {
        skipped++;
        continue;
      }
      const original = new Uint8Array(await dl.data.arrayBuffer());
      if (original.byteLength < minBytes) {
        skipped++;
        continue;
      }
      const smaller = await shrink(original);
      if (!smaller || smaller.byteLength >= original.byteLength) {
        skipped++;
        continue;
      }
      const up = await supabase.storage
        .from(parsed.bucket)
        .upload(parsed.path, smaller, { upsert: true, contentType: "image/jpeg" });
      if (up.error) {
        failures.push(`${parsed.path}: ${up.error.message}`);
        continue;
      }
      processed++;
      savedBytes += original.byteLength - smaller.byteLength;
    } catch (e) {
      failures.push(`${parsed.path}: ${e instanceof Error ? e.message : "okänt fel"}`);
    }
  }

  return new Response(
    JSON.stringify({
      table,
      offset,
      fetched: rows?.length ?? 0,
      processed,
      skipped,
      savedMb: +(savedBytes / 1_048_576).toFixed(1),
      failures,
      nextOffset: offset + (rows?.length ?? 0),
      done: (rows?.length ?? 0) < limit,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
