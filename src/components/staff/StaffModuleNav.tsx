import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSite } from "@/contexts/SiteContext";
import { staffSectionsForSite, staffSectionOf } from "@/lib/staffModuleNav";
import { staffLevelOf } from "@/lib/staffModuleAccess";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

/**
 * Flikraden för personalmodulen i två nivåer: fem sektioner högst upp och
 * sektionens sidor som pillerflikar under. Behörighetsfiltreringen ligger i
 * staffSectionsForSite — den här komponenten ritar bara.
 */
export function StaffModuleNav() {
  const { site } = useSite();
  const { staff } = useStaffAuth();
  const location = useLocation();
  const sections = staffSectionsForSite(site, staffLevelOf(staff));
  if (sections.length === 0) return null;

  const active = staffSectionOf(sections, location.pathname);
  const activeKey = active?.key ?? (location.pathname === "/personal" ? "start" : null);
  const subItems = active?.items ?? [];

  return (
    <div className="sticky top-0 z-20 -mx-3 mb-4 bg-[var(--sl-bg)] px-3 sm:-mx-5 sm:px-5">
      <nav className="sl-tabs -mx-3 rounded-b-[var(--sl-radius)] px-3 sm:-mx-5 sm:px-5" aria-label="Personal och schema">
        {sections.map((section) => (
          <NavLink
            key={section.key}
            to={section.url || "/personal"}
            end={section.key === "start"}
            className={cn("sl-tab", activeKey === section.key && "sl-tab--active")}
          >
            <section.icon size={15} />
            <span>{section.label}</span>
          </NavLink>
        ))}
      </nav>
      {subItems.length > 1 ? (
        <div className="sl-subtabs" aria-label={`${active?.label} — sidor`}>
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
