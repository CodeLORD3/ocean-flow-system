import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutGrid } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { staffGroupsForSite } from "@/lib/staffModuleNav";
import { staffLevelOf } from "@/lib/staffModuleAccess";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

/**
 * Gemensam flikrad för hela personalmodulen, satt i Industry-språket:
 * kondenserad rubriktypografi, understruken aktiv flik och inga färgade pillren.
 */
export function StaffModuleNav() {
  const { site } = useSite();
  const { staff } = useStaffAuth();
  const location = useLocation();
  const groups = staffGroupsForSite(site, staffLevelOf(staff));
  const items = groups.flatMap(g => g.items);
  if (items.length === 0) return null;

  return (
    <nav className="ind-tabrail sticky top-0 z-20 -mx-3 mb-3 px-3 sm:-mx-5 sm:px-5" aria-label="Personalmodulen">
      <div className="ind-tabrail__track">
        <NavLink
          to="/personal"
          end
          className={cn("ind-tab", location.pathname === "/personal" && "ind-tab--active")}
        >
          <LayoutGrid size={14} />
          <span>Översikt</span>
        </NavLink>
        <span className="ind-tabrail__sep" aria-hidden="true" />
        {items.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end
            title={item.desc}
            className={cn("ind-tab", location.pathname === item.url && "ind-tab--active")}
          >
            <item.icon size={14} />
            <span>{item.title}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/** Tunn wrapper som lägger flikraden ovanför en befintlig personalsida. */
export function WithStaffNav({ children }: { children: ReactNode }) {
  return (
    <div className="ind flex h-full w-full flex-col">
      <StaffModuleNav />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
