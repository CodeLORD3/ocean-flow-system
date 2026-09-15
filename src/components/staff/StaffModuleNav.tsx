import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSite } from "@/contexts/SiteContext";
import { staffSectionsForSite, staffSectionOf } from "@/lib/staffModuleNav";
import { staffLevelOf } from "@/lib/staffModuleAccess";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

/**
 * Flikraden för personalmodulen: alla huvudmenyer högst upp. Undermenyn visas
 * först när man trycker på sin förälder — inget öppnas av sig självt förutom
 * sektionen man står i. Behörighetsfiltreringen ligger i staffSectionsForSite.
 */
export function StaffModuleNav() {
  const { site } = useSite();
  const { staff } = useStaffAuth();
  const location = useLocation();
  const sections = staffSectionsForSite(site, staffLevelOf(staff));

  const active = staffSectionOf(sections, location.pathname);
  const activeKey = active?.key ?? (location.pathname === "/personal" ? "start" : null);
  const [openKey, setOpenKey] = useState<string | null>(activeKey);

  /** Byter man sida hör undermenyn till den nya sektionen. */
  useEffect(() => {
    setOpenKey(activeKey);
  }, [activeKey]);

  if (sections.length === 0) return null;

  const openSection = sections.find((section) => section.key === openKey) ?? null;
  const subItems = openSection?.items ?? [];

  return (
    <div className="sticky top-0 z-20 -mx-3 mb-4 bg-[var(--sl-bg)] px-3 sm:-mx-5 sm:px-5">
      <nav className="sl-tabs -mx-3 rounded-b-[var(--sl-radius)] px-3 sm:-mx-5 sm:px-5" aria-label="Personal och schema">
        {sections.map((section) => {
          const isOpen = openKey === section.key;
          const isActive = activeKey === section.key;
          if (section.items.length === 0) {
            return (
              <NavLink
                key={section.key}
                to={section.url || "/personal"}
                end
                onClick={() => setOpenKey(section.key)}
                className={cn("sl-tab", isActive && "sl-tab--active")}
              >
                <section.icon size={15} />
                <span>{section.label}</span>
              </NavLink>
            );
          }
          return (
            <button
              key={section.key}
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpenKey(isOpen ? null : section.key)}
              className={cn("sl-tab", (isActive || isOpen) && "sl-tab--active")}
            >
              <section.icon size={15} />
              <span>{section.label}</span>
              <ChevronDown size={13} className={cn("transition-transform", isOpen && "rotate-180")} />
            </button>
          );
        })}
      </nav>
      {subItems.length > 0 ? (
        <div className="sl-subtabs" aria-label={`${openSection?.label} — sidor`}>
          {subItems.map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end
              title={item.desc}
              className={({ isActive }) => cn("sl-subtab", isActive && "sl-subtab--active")}
            >
              {item.title}
            </NavLink>
          ))}
        </div>
      ) : null}
    </div>
  );
}


/** Tunn wrapper som lägger flikraden ovanför en befintlig personalsida. */
export function WithStaffNav({ children }: { children: ReactNode }) {
  return (
    <div className="staff-light flex h-full w-full flex-col overflow-auto px-3 pb-5 sm:px-5">
      <StaffModuleNav />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
