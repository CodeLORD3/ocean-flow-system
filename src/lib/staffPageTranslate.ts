import type { StaffLang } from "@/lib/staffI18n";
import auto from "@/lib/staffDicts/ui_auto.json";

type Tr = Partial<Record<Exclude<StaffLang, "sv">, string>>;
const DICT = auto as Record<string, Tr>;

/** Byter en svensk gränssnittstext mot vald språk; okänd text (t.ex. produktnamn) lämnas orörd. */
export function translateUiText(text: string, lang: StaffLang): string {
  if (lang === "sv" || !text) return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  const hit = DICT[trimmed]?.[lang] ?? DICT[trimmed.replace(/\s+/g, " ")]?.[lang];
  if (!hit) {
    // "Etikett:" och "Etikett…" — översätt stammen och behåll tecknet.
    const m = trimmed.match(/^(.*?)([:…]|\.\.\.)$/);
    const stem = m && DICT[m[1].trim()]?.[lang];
    if (!stem) return text;
    return text.replace(trimmed, stem + m![2]);
  }
  return text.replace(trimmed, hit);
}
