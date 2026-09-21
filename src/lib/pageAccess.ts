import type { SiteMode } from "@/contexts/SiteContext";

/**
 * Sidbaserad behörighet.
 *
 * En enda källa för vilka rutter varje portal får se. Både sidomenyerna och
 * ruttrenderingen (KeepAliveTabs) läser den här tabellen, så meny och spärr
 * aldrig kan glida ifrån varandra.
 *
 * site-värden: "shop" = Butik, "production" = Grossist, "wholesale" = Admin.
 */

const BUTIK: SiteMode[] = ["shop"];
const GROSSIST: SiteMode[] = ["production"];
const ADMIN: SiteMode[] = ["wholesale"];

const all = (...groups: SiteMode[][]) => Array.from(new Set(groups.flat()));

/** Rutt → portaler som får öppna rutten. Rutt som saknas här är endast Admin. */
export const ROUTE_ACCESS: Record<string, SiteMode[]> = {
  // Gemensamt
  "/": all(BUTIK, GROSSIST, ADMIN),
  "/organisation": all(BUTIK, GROSSIST, ADMIN),
  "/chat": all(BUTIK, GROSSIST, ADMIN),
  "/image-feed": all(BUTIK, GROSSIST, ADMIN),

  "/checklist": all(BUTIK, GROSSIST, ADMIN),
  "/uppgifter": all(BUTIK, GROSSIST, ADMIN),
  "/utrustning": all(BUTIK, GROSSIST, ADMIN),
  "/store-map": all(BUTIK, GROSSIST, ADMIN),
  "/schedule": all(BUTIK, GROSSIST, ADMIN),
  "/meetings": all(BUTIK, GROSSIST, ADMIN),
  "/tasks": all(BUTIK, GROSSIST, ADMIN),
  "/profile": all(BUTIK, GROSSIST, ADMIN),
  "/personal": all(BUTIK, GROSSIST, ADMIN),
  "/staff": all(BUTIK, GROSSIST, ADMIN),
  "/person": all(BUTIK, GROSSIST, ADMIN),
  "/employees": ADMIN,
  "/clock-stations": ADMIN,
  "/time-entries": ADMIN,
  "/my-time": all(BUTIK, GROSSIST, ADMIN),
  "/staff-rules": ADMIN,
  "/hr-control": all(BUTIK, GROSSIST, ADMIN),
  "/payroll-exports": ADMIN,
  "/clock-vs-pk": ADMIN,
  "/fortnox": ADMIN,
  "/staff-schedule": all(BUTIK, GROSSIST, ADMIN),
  "/my-shifts": all(BUTIK, GROSSIST, ADMIN),
  "/schedule-planner": ADMIN,
  // Butikschefen attesterar sin egen butik i butiksportalen.
  "/attestations": all(BUTIK, ADMIN),
  "/payroll-review": ADMIN,
  "/payroll-basis": ADMIN,
  "/reports": all(BUTIK, GROSSIST, ADMIN),
  "/dagsrapport": all(BUTIK, GROSSIST, ADMIN),
  "/viktiga-papper": all(BUTIK, GROSSIST, ADMIN),
  "/audit": all(BUTIK, GROSSIST, ADMIN),
  "/manual": all(BUTIK, GROSSIST, ADMIN),

  // Lager och spårbarhet — butik ser sin egen enhet, grossist och admin allt
  "/inventory": all(BUTIK, GROSSIST, ADMIN),
  "/rakna": all(BUTIK, GROSSIST, ADMIN),
  "/auktion": all(GROSSIST, ADMIN),
  "/m/inventering": all(BUTIK, GROSSIST, ADMIN),
  "/dagens-bestallning": all(BUTIK, GROSSIST, ADMIN),
  "/inkomna-bestallningar": all(GROSSIST, ADMIN),
  "/stock-movements": all(BUTIK, GROSSIST, ADMIN),
  "/stock-transfers": all(BUTIK, GROSSIST, ADMIN),
  "/waste": all(BUTIK, GROSSIST, ADMIN),
  "/stock-disappearance": all(BUTIK, GROSSIST, ADMIN),
  "/arrivals": all(GROSSIST, ADMIN),
  "/external-production": all(GROSSIST, ADMIN),

  "/traceability": all(BUTIK, GROSSIST, ADMIN),
  "/food-safety": all(BUTIK, GROSSIST, ADMIN),
  "/receiving": all(BUTIK, GROSSIST, ADMIN),
  "/products": all(BUTIK, GROSSIST, ADMIN),
  "/barcodes": all(BUTIK, GROSSIST, ADMIN),

  // Försäljning
  "/orders": all(BUTIK, GROSSIST, ADMIN),
  "/customers": all(BUTIK, GROSSIST, ADMIN),
  "/customer-orders": all(BUTIK, GROSSIST, ADMIN),
  "/wishes": all(BUTIK, GROSSIST, ADMIN),
  "/store-wishes": all(GROSSIST, ADMIN),
  "/invoices": all(GROSSIST, ADMIN),

  // Inköp och prissättning — inte för butik
  "/purchase-reporting": all(GROSSIST, ADMIN),
  "/purchase-reconciliation": all(GROSSIST, ADMIN),
  "/size-grades": all(GROSSIST, ADMIN),
  "/transformation-recipes": all(GROSSIST, ADMIN),
  "/produktion-recept": all(BUTIK, GROSSIST, ADMIN),
  "/purchase-schedule": all(GROSSIST, ADMIN),
  "/suppliers": all(GROSSIST, ADMIN),
  "/pricing": all(GROSSIST, ADMIN),

  // Tillverkning — inte för butik
  "/production": all(GROSSIST, ADMIN),
  "/production-schedule": all(GROSSIST, ADMIN),
  "/production-reporting": all(GROSSIST, ADMIN),

  // Ekonomi
  "/finance": all(GROSSIST, ADMIN),
  "/forecasts": all(GROSSIST, ADMIN),

  // Bokningssidan (bokafiskskaldjur.se)
  "/booking-settings": all(BUTIK, ADMIN),
  "/booking-assortment": ADMIN,
  "/booking-blocklist": ADMIN,
  "/booking-holidays": all(BUTIK, ADMIN),

  // Endast Admin
  "/stores": ADMIN,
  "/live-staff": ADMIN,
  "/personalkollen": ADMIN,
  "/on-site-now": ADMIN,
  "/vehicles": ADMIN,
  "/establishments": ADMIN,
  "/legal-entities": ADMIN,
  "/coverage": ADMIN,
  "/system-status": ADMIN,
  "/lager-blueprint": ADMIN,
  "/pos-live": ADMIN,
  "/shopify": ADMIN,
  "/settings": ADMIN,
  "/landing-settings": ADMIN,
  "/companies": ADMIN,
  "/contact-settings": ADMIN,
  "/about-settings": ADMIN,
  "/admin-payments": ADMIN,
  "/map-settings": ADMIN,
  "/trade-offers": ADMIN,
  "/trade-history": ADMIN,
  "/investment-log": ADMIN,
  "/payouts": ADMIN,
  "/investor-portal": ADMIN,
  "/investor-list": ADMIN,
};

/** Får den aktiva portalen öppna rutten? */
export function canAccessRoute(site: SiteMode, pathWithQuery: string): boolean {
  // Menylänkar kan ha frågesträng (t.ex. förvald flik) — behörigheten gäller sidan.
  const path = pathWithQuery.split("?")[0];
  // Kundkortet ligger under Kundbeställningar och ärver dess behörighet.
  // Uppgiftens egen sida ärver behörigheten från uppgiftslistan.
  const key = path.startsWith("/customer-orders/")
    ? "/customer-orders"
    : path.startsWith("/uppgift/")
      ? "/uppgifter"
      : path.startsWith("/person/")
        ? "/person"
        : path;
  const allowed = ROUTE_ACCESS[key];
  if (!allowed) return site === "wholesale";
  return allowed.includes(site);
}


/**
 * Får portalen se inköpspris, självkostnad och marginal?
 * Butiken ser kvantitet och sitt eget utpris — aldrig inköpsledet.
 */
export function canSeeCosts(site: SiteMode): boolean {
  return site !== "shop";
}

/** Etikett för portalen, används i felmeddelanden. */
export function siteLabel(site: SiteMode): string {
  return site === "shop" ? "Butik" : site === "production" ? "Grossist" : "Admin";
}
