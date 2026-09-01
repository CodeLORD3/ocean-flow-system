import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutGrid } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { staffGroupsForSite } from "@/lib/staffModuleNav";
import { staffLevelOf } from "@/lib/staffModuleAccess";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

/**
 * Gemensam flikrad för hela personalmodulen. Ligger högst upp på varje
 * personalsida så man kan hoppa mellan schema, attest och lön direkt.
 */
export function StaffModuleNav() {
  const { site } = useSite();
  const { staff } = useStaffAuth();
  const location = useLocation();
  const groups = staffGroupsForSite(site, staffLevelOf(staff));
  const items = groups.flatMap(g => g.items);
  if (items.length === 0) return null;

  return (
    <div className="sticky top-0 z-20 -mx-4 mb-3 border-b border-border/60 bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <NavLink
          to="/personal"
          end
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-md border border-border/60 px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            location.pathname === "/personal" && "border-primary/40 bg-primary/10 text-foreground",
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span>Personal &amp; Schema</span>
        </NavLink>
        <span className="h-5 w-px shrink-0 bg-border" />
        {items.map((item) => {
          const active = location.pathname === item.url;
          return (
            <NavLink
              key={item.url}
              to={item.url}
              end
              title={item.desc}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                active && "bg-primary/15 text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              <span>{item.title}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

/** Tunn wrapper som lägger flikraden ovanför en befintlig personalsida. */
export function WithStaffNav({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col">
      <StaffModuleNav />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
