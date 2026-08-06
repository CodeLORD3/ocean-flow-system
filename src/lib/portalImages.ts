/**
 * Bildsystem för portaler som inte är butiker (grossist respektive admin).
 * entity_images.entity_id är uuid, så varje portal får ett eget sentinel-id
 * så att grossistens och adminportalens bilder hålls helt separerade.
 */
import type { SiteMode } from "@/contexts/SiteContext";

export const PORTAL_IMAGE_ENTITY_TYPE = "portal";

/** Grossistportalen (site === "production") */
export const WHOLESALE_IMAGE_ENTITY_ID = "00000000-0000-4000-8000-000000000001";

/** Adminportalen (site === "wholesale") */
export const ADMIN_IMAGE_ENTITY_ID = "00000000-0000-4000-8000-000000000002";

/** Vilken bildpool tillhör det aktiva portalläget? */
export function portalImageEntityId(site: SiteMode) {
  return site === "production" ? WHOLESALE_IMAGE_ENTITY_ID : ADMIN_IMAGE_ENTITY_ID;
}
