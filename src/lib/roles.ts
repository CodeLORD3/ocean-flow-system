/**
 * Rollhierarki (Etapp 3). Rollen styr vad kontot får göra, scopes styr
 * vilken del av koncernen kontot får se. Rollen ersätter aldrig scope-kontrollen
 * i RLS — den kompletterar den.
 */

export type RoleKey =
  | "platform_admin"
  | "group_admin"
  | "region_admin"
  | "company_admin"
  | "wholesale_staff"
  | "multi_store_manager"
  | "store_manager"
  | "store_staff";

export type ScopeLevel = "platform" | "tenant" | "region" | "company" | "store";

export interface RoleDef {
  key: RoleKey;
  label: string;
  description: string;
  /** Vilken scope-nivå rollen kräver att man väljer. */
  scope: ScopeLevel;
  /** Föreslagna portaler när rollen väljs. */
  portals: string[];
  rank: number;
}

export const ROLE_DEFS: RoleDef[] = [
  {
    key: "platform_admin",
    label: "Plattformsadmin",
    description: "Ser och administrerar alla koncerner, bolag och butiker. Enda rollen utan gränser.",
    scope: "platform",
    portals: ["admin", "wholesale", "production", "shop"],
    rank: 1,
  },
  {
    key: "group_admin",
    label: "Koncernadmin",
    description: "Full åtkomst inom en koncern (tenant) — alla bolag och butiker i koncernen.",
    scope: "tenant",
    portals: ["admin", "wholesale", "production", "shop"],
    rank: 2,
  },
  {
    key: "region_admin",
    label: "Regionadmin",
    description: "Åtkomst till alla bolag i ett land, t.ex. SE eller CH.",
    scope: "region",
    portals: ["wholesale", "production", "shop"],
    rank: 3,
  },
  {
    key: "company_admin",
    label: "Bolagsadmin",
    description: "Åtkomst till ett eller flera bolag och deras butiker.",
    scope: "company",
    portals: ["wholesale", "production", "shop"],
    rank: 4,
  },
  {
    key: "wholesale_staff",
    label: "Grossistpersonal",
    description: "Inköp, produktion och lager inom valda bolag.",
    scope: "company",
    portals: ["production"],
    rank: 5,
  },
  {
    key: "multi_store_manager",
    label: "Flerbutikschef",
    description:
      "Butikschef för flera enheter. Krävs för att medvetet se och attestera mer än en butik — utan rollen gäller endast den egna butiken.",
    scope: "store",
    portals: ["shop"],
    rank: 6,
  },
  {
    key: "store_manager",
    label: "Butikschef",
    description: "Butiksportalen med rapporter och personal för den egna butiken.",
    scope: "store",
    portals: ["shop"],
    rank: 7,
  },
  {
    key: "store_staff",
    label: "Butikspersonal",
    description: "Daglig drift i den egna butiken.",
    scope: "store",
    portals: ["shop"],
    rank: 8,
  },
];

export const roleDef = (key?: string | null) =>
  ROLE_DEFS.find((r) => r.key === key) ?? null;

export const roleLabel = (key?: string | null) => {
  if (!key) return null;
  if (key === "admin") return "Admin (äldre)";
  return roleDef(key)?.label ?? key;
};
