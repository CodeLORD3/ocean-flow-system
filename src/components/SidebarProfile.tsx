import { NavLink } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { thumbUrl, THUMB_AVATAR } from "@/lib/imageThumb";
import { useMyTaskAlerts } from "@/hooks/useMyTaskAlerts";

/** Egna profilen högst upp i sidomenyn — klick går till Min profil. */
export function SidebarProfile({ collapsed }: { collapsed?: boolean }) {
  const { staff } = useStaffAuth();
  const { alerts } = useMyTaskAlerts();
  if (!staff) return null;

  const name = `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim();
  const initials = `${staff.first_name?.[0] ?? ""}${staff.last_name?.[0] ?? ""}` || "?";
  const count = alerts.length;

  return (
    <NavLink
      to="/profile"
      end
      title={name}
      className={({ isActive }) =>
        `flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"
        } ${collapsed ? "justify-center px-0" : ""}`
      }
    >
      <span className="relative">
        <Avatar className="h-8 w-8 border border-sidebar-border">
          {staff.profile_image_url && <AvatarImage src={thumbUrl(staff.profile_image_url, THUMB_AVATAR)} alt={name} />}
          <AvatarFallback className="text-[10px] font-semibold">{initials}</AvatarFallback>
        </Avatar>
        {count > 0 && (
          <span className="animate-alert-dot absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {count}
          </span>
        )}
      </span>
      {!collapsed && (
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-medium">{name || "Min profil"}</p>
          <p className={`truncate text-[10px] ${count > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
            {count > 0 ? `${count} ny uppgift` : "Min profil"}
          </p>
        </div>
      )}
    </NavLink>
  );
}

