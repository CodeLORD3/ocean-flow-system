import { useCallback, useEffect, useRef, useState } from "react";
import { useUnsavedChanges } from "@/lib/unsavedChanges";

/**
 * Utkast som överlever omladdning: sparas i localStorage per användare och butik.
 * `clear()` anropas när formuläret har skickats.
 */
export function useDraft<T>(
  key: string,
  initial: T,
  opts: { userId?: string | null; storeId?: string | null; enabled?: boolean } = {},
) {
  const enabled = opts.enabled !== false;
  const storageKey = `draft:${key}:${opts.userId ?? "anon"}:${opts.storeId ?? "-"}`;
  const initialRef = useRef(initial);
  const [value, setValue] = useState<T>(() => {
    if (!enabled) return initial;
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const dirty = enabled && JSON.stringify(value) !== JSON.stringify(initialRef.current);
  useUnsavedChanges(dirty);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (dirty) localStorage.setItem(storageKey, JSON.stringify(value));
      else localStorage.removeItem(storageKey);
    } catch {
      /* fullt eller avstängt lagringsutrymme */
    }
  }, [storageKey, value, dirty, enabled]);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignoreras */
    }
    setValue(initialRef.current);
  }, [storageKey]);

  return [value, setValue, clear, dirty] as const;
}
