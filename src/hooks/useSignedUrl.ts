import { useEffect, useState } from "react";
import { resolveStorageUrl } from "@/lib/signedStorage";

/**
 * Resolves a stored storage URL to something the browser can load.
 * Private-bucket files are signed on demand; public URLs pass straight through.
 */
export function useSignedUrl(url: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!url) {
      setResolved(null);
      return;
    }
    resolveStorageUrl(url).then((next) => {
      if (active) setResolved(next);
    });
    return () => {
      active = false;
    };
  }, [url]);

  return resolved;
}
