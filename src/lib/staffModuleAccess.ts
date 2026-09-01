import type { StaffProfile } from "@/contexts/StaffAuthContext";

/**
 * Rollstyrd åtkomst inom personalmodulen.
 *
 * Portalen (butik/grossist/admin) avgör vilka sidor som finns — nivån nedan
 * avgör vad *personen* får se. En vanlig anställd ser bara sitt eget.
 */

export type StaffLevel = "employee" | "manager" | "admin";

/** Sidor en vanlig anställd får öppna. */
const EMPLOYEE_PATHS = ["/my-shifts", "/my-time", "/profile"];

/** Sidor som är stängda för butikschef (lön, regler, integrationer, register). */
const MANAGER_BLOCKED = [
  "/payroll-review",
  "/payroll-exports",
  "/staff-rules",
  "/personalkollen",
  "/clock-vs-pk",
  "/clock-stations",
  "/employees",
];

const MANAGER_ROLES = ["store_manager", "multi_store_manager"];
const ADMIN_ROLES = [
  "platform_admin",
  "group_admin",
  "region_admin",
  "company_admin",
  "wholesale_staff",
];

/**
 * Nivån härleds ur rollen. Saknas roll behandlas kontot som vanlig anställd —
 * chefsbehörighet ska alltid vara medvetet satt.
 */
export function staffLevelOf(staff: StaffProfile | null | undefined): StaffLevel {
  if (!staff) return "employee";
  if (staff.is_platform_admin) return "admin";
  const role = staff.primary_role ?? "";
  if (role === "admin" || ADMIN_ROLES.includes(role)) return "admin";
  if (MANAGER_ROLES.includes(role)) return "manager";
  // Äldre konton med admin-portal i behörigheten behåller full åtkomst.
  if ((staff.portal_access ?? []).includes("admin")) return "admin";
  return "employee";
}

/** Får nivån öppna den här personalsidan? */
export function canOpenStaffPage(level: StaffLevel, path: string): boolean {
  if (level === "admin") return true;
  if (level === "manager") return !MANAGER_BLOCKED.includes(path);
  return EMPLOYEE_PATHS.includes(path);
}

export const staffLevelLabel = (level: StaffLevel) =>
  level === "admin" ? "Administration" : level === "manager" ? "Butikschef" : "Anställd";
