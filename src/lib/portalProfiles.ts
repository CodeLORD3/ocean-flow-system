import type { SiteMode } from "@/contexts/SiteContext";

export type PortalKind = "admin" | "grossist" | "store";

export type PortalProfile = {
  /** Stabil nyckel som används i chattsystemet */
  key: string;
  name: string;
  kind: PortalKind;
  storeId?: string | null;
};

export const ADMIN_PROFILE: PortalProfile = { key: "admin", name: "Admin", kind: "admin" };
export const GROSSIST_PROFILE: PortalProfile = { key: "grossist", name: "Grossist", kind: "grossist" };

export function storePortalKey(storeId: string) {
  return `store:${storeId}`;
}

/** Nuvarande portal som chattidentitet, baserat på aktivt portalläge. */
export function currentPortalProfile(
  site: SiteMode,
  activeStoreId: string | null,
  activeStoreName: string | null
): PortalProfile | null {
  if (site === "wholesale") return ADMIN_PROFILE;
  if (site === "production") return GROSSIST_PROFILE;
  if (site === "shop" && activeStoreId) {
    return {
      key: storePortalKey(activeStoreId),
      name: activeStoreName || "Butik",
      kind: "store",
      storeId: activeStoreId,
    };
  }
  return null;
}

/**
 * Vem får en portal chatta med?
 * - Butik: bara Grossist
 * - Grossist: Admin + alla butiker
 * - Admin: Grossist + alla butiker (samt specialmeddelanden till alla butiker)
 */
export function canChatWith(mine: PortalProfile, other: PortalProfile) {
  if (mine.key === other.key) return false;
  if (mine.kind === "store") return other.kind === "grossist";
  if (mine.kind === "grossist") return other.kind === "admin" || other.kind === "store";
  if (mine.kind === "admin") return other.kind === "grossist" || other.kind === "store";
  return false;
}
