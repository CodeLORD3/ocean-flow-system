/**
 * Systemets version. Namn + löpnummer som höjs vid varje ny publicering,
 * samt byggtiden så man ser när versionen skapades.
 */
export const VERSION_NAME = "Wanderson do Carmo";
export const VERSION_NUMBER = 3;

const BUILD_TIME: string =
  typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : new Date().toISOString();

/** T.ex. "Wanderson do Carmo 3 · uppdaterad 19 sep 10:22" (svensk tid).
 *  Tiden är när versionen skapades — inte klockan just nu. */
export function versionLabel(): string {
  let when = "";
  try {
    when = new Date(BUILD_TIME).toLocaleString("sv-SE", {
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
