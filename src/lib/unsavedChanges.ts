import { useEffect, useId } from "react";

/**
 * Litet register över formulär med osparade ändringar. Appens uppdatering
 * läser det för att aldrig ladda om mitt i ett arbete.
 */
const dirty = new Set<string>();
const listeners = new Set<() => void>();

export function hasUnsavedChanges() {
  return dirty.size > 0;
}

export function onUnsavedChange(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function set(id: string, isDirty: boolean) {
  const had = dirty.has(id);
  if (isDirty) dirty.add(id); else dirty.delete(id);
  if (had !== isDirty) listeners.forEach((l) => l());
}

/** Anropa i formulär: useUnsavedChanges(harÄndringar). */
export function useUnsavedChanges(isDirty: boolean) {
  const id = useId();
  useEffect(() => {
    set(id, isDirty);
    return () => set(id, false);
  }, [id, isDirty]);
}
