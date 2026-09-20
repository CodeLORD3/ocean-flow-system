/**
 * Systemets version. Namn + löpnummer som höjs vid varje ny publicering,
 * samt tidpunkten då versionen skapades.
 *
 * VERSION_UPDATED_AT sätts för hand i samma steg som numret höjs — den ska
 * alltid peka på när den publicerade versionen gjordes, inte när
 * förhandsvisningen startades.
 */
export const VERSION_NAME = "Wanderson do Carmo";
export const VERSION_NUMBER = 3;
export const VERSION_UPDATED_AT = "2026-09-20T18:58:00Z";

/** T.ex. "Wanderson do Carmo 3 · uppdaterad 20 sep 20:58" (svensk tid). */
export function versionLabel(): string {
  let when = "";
  try {
    when = new Date(VERSION_UPDATED_AT).toLocaleString("sv-SE", {
      timeZone: "Europe/Stockholm",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    when = "";
  }
  return `${VERSION_NAME} ${VERSION_NUMBER}${when ? ` · uppdaterad ${when}` : ""}`;
}
