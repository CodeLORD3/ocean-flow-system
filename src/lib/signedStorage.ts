import { supabase } from "@/integrations/supabase/client";

/** Buckets that are private — their files must be served through signed URLs. */
const PRIVATE_BUCKETS = ["trade-offers", "purchase-documents"] as const;

const SIGNED_TTL_SECONDS = 60 * 60; // 1 h

const cache = new Map<string, { url: string; expires: number }>();

/**
 * Extracts { bucket, path } from a stored Supabase storage URL.
 * Handles both public (`/storage/v1/object/public/<bucket>/<path>`) and
 * already-signed (`/storage/v1/object/sign/<bucket>/<path>`) forms.
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+?)(?:\?|$)/);
  if (!match) return null;
  return { bucket: match[1], path: decodeURIComponent(match[2]) };
}

export function isPrivateStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const parsed = parseStorageUrl(url);
  return !!parsed && (PRIVATE_BUCKETS as readonly string[]).includes(parsed.bucket);
}

/**
 * Returns a usable URL for a stored file. Files in private buckets get a
 * short-lived signed URL; everything else is returned untouched.
 */
export async function resolveStorageUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const parsed = parseStorageUrl(url);
  if (!parsed || !(PRIVATE_BUCKETS as readonly string[]).includes(parsed.bucket)) return url;

  const key = `${parsed.bucket}/${parsed.path}`;
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.url;

  const { data, error } = await supabase.storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.path, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;

  cache.set(key, { url: data.signedUrl, expires: Date.now() + (SIGNED_TTL_SECONDS - 60) * 1000 });
  return data.signedUrl;
}
