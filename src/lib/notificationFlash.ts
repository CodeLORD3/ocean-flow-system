import { useEffect, useState } from "react";

/**
 * Håller reda på vilka objekt som just fick en notis, så att sidan kan lysa upp
 * exakt det kort/rad som ändrats istället för att visa ett meddelande.
 *
 * Flödet: sidebaren markerar notiserna för sidan som lästa när man navigerar dit
 * — i samma steg sparas entity_type/entity_id här i ~90 sekunder. Sidan som
 * monteras läser sedan av nycklarna och sätter en kort highlight-animation.
 */

const TTL_MS = 90_000;

type Entry = { key: string; at: number };

let entries: Entry[] = [];
const listeners = new Set<() => void>();

function prune() {
  const now = Date.now();
  const before = entries.length;
  entries = entries.filter((e) => now - e.at < TTL_MS);
  return entries.length !== before;
}

function emit() {
  listeners.forEach((l) => l());
}

export function flashKey(entityType?: string | null, entityId?: string | null): string {
  return `${entityType ?? ""}:${entityId ?? ""}`;
}

/** Registrera nya notiser som ska lysa upp på målsidan. */
export function recordNotificationFlash(
  rows: { entity_type?: string | null; entity_id?: string | null }[]
) {
  prune();
  const now = Date.now();
  let added = false;
  for (const row of rows) {
    if (!row.entity_id) continue;
    const key = flashKey(row.entity_type, row.entity_id);
    if (!entries.some((e) => e.key === key)) {
      entries.push({ key, at: now });
      added = true;
    }
  }
  if (added) emit();
}

function currentKeys(): Set<string> {
  prune();
  return new Set(entries.map((e) => e.key));
}

/**
 * Ger tillbaka en funktion som säger om ett objekt precis fick en notis.
 * Highlighten släcks automatiskt efter ett par sekunder.
 */
export function useNotificationFlash(entityType: string, visibleMs = 6000) {
  const [keys, setKeys] = useState<Set<string>>(() => currentKeys());

  useEffect(() => {
    const update = () => setKeys(currentKeys());
    listeners.add(update);
    update();
    const timer = window.setTimeout(() => setKeys(new Set()), visibleMs);
    return () => {
      listeners.delete(update);
      window.clearTimeout(timer);
    };
  }, [visibleMs]);

  const isNew = (entityId?: string | null) =>
    !!entityId && keys.has(flashKey(entityType, entityId));

  /** Tailwind-klasser för highlighten (semantiska tokens). */
  const flashClass = (entityId?: string | null) =>
    isNew(entityId) ? "animate-notice-flash" : "";

  return { isNew, flashClass, hasAny: keys.size > 0 };
}
