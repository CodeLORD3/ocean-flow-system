import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Gemensam markering av det man kom för att titta på. Kommer man till en sida
 * med ?markera=<id> rullas raden fram och lyser upp en stund, så man ser
 * direkt vart man landade.
 */

/** Ramen som lyser runt raden/kortet man kom till. */
export const MARK_CLASS = "ring-2 ring-primary ring-offset-2 animate-notice-flash";

/**
 * @param domPrefix id-prefix på elementet, t.ex. "uppgift" ger id="uppgift-<id>"
 */
export function useMarkHighlight(domPrefix: string, visibleMs = 8000) {
  const [searchParams] = useSearchParams();
  const markId = searchParams.get("markera");
  const [marked, setMarked] = useState<string | null>(markId);

  useEffect(() => {
    if (!markId) {
      setMarked(null);
      return;
    }
    setMarked(markId);
    const scroll = window.setTimeout(() => {
      document
        .getElementById(`${domPrefix}-${markId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
    const clear = window.setTimeout(() => setMarked(null), visibleMs);
    return () => {
      window.clearTimeout(scroll);
      window.clearTimeout(clear);
    };
  }, [markId, domPrefix, visibleMs]);

  const isMarked = (id?: string | null) => !!id && id === marked;
  const markClass = (id?: string | null) => (isMarked(id) ? MARK_CLASS : "");

  return { markedId: marked, isMarked, markClass };
}

/** Bygg en länk som markerar raden man landar på. */
export function withMark(url: string, id: string): string {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}markera=${id}`;
}
