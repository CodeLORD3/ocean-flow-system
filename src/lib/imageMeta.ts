/** Initialer från ett namn, t.ex. "Erik Franzén" → "EF". Faller tillbaka till "?" */
export function initialsOf(name?: string | null): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Datumnyckel (YYYY-MM-DD) i lokal tid för en ISO-tidsstämpel. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Läsbar etikett för en datumnyckel, t.ex. "Idag", "Igår" eller "ons 5 aug". */
export function dayLabel(key: string): string {
  const today = dayKey(new Date().toISOString());
  const yesterday = dayKey(new Date(Date.now() - 86400000).toISOString());
  if (key === today) return "Idag";
  if (key === yesterday) return "Igår";
  const d = new Date(`${key}T12:00:00`);
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short" });
}
