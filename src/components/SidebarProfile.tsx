import { useState } from "react";
import { STAFF_LANGS, useStaffT } from "@/lib/staffI18n";
import { supabase } from "@/integrations/supabase/client";
import { NavLink } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { thumbUrl, THUMB_AVATAR } from "@/lib/imageThumb";
import { useMyTaskAlerts } from "@/hooks/useMyTaskAlerts";

/** Egna profilen högst upp i sidomenyn — klick går till Min profil. */
export function SidebarProfile({ collapsed }: { collapsed?: boolean }) {
  const { t, lang, dir } = useStaffT();
  const { staff, refresh } = useStaffAuth();
  const [savingLanguage, setSavingLanguage] = useState(false);
  const [languageError, setLanguageError] = useState(false);
  const { alerts } = useMyTaskAlerts();
  if (!staff) return null;

  const name = `${staff.first_name ?? ""} ${staff.last_name ?? ""}`.trim();
  const initials = `${staff.first_name?.[0] ?? ""}${staff.last_name?.[0] ?? ""}` || "?";
  const count = alerts.length;

  return (
    <div lang={lang} dir={dir}>
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
          <p className="truncate text-xs font-medium">{name || t("meny.my_profile")}</p>
          <p className={`truncate text-[10px] ${count > 0 ? "font-semibold text-destructive" : "text-muted-foreground"}`}>
            {count > 0 ? t("meny.new_task").replace("{n}", String(count)) : t("meny.my_profile")}
          </p>
        </div>
      )}
    </NavLink>
    <select
      aria-label={t("meny.language")}
      title={t("meny.language")}
      value={lang}
      disabled={savingLanguage}
      className="mt-1 min-h-11 min-w-11 w-full max-w-full rounded-md border border-sidebar-border bg-sidebar text-base"
      onChange={async (event) => {
        const _lang = event.target.value;
        setSavingLanguage(true);
        setLanguageError(false);
        try {
          const { error } = await supabase.rpc("set_staff_lang", { _staff_id: staff.id, _lang });
          if (error) throw error;
          await refresh();
        } catch {
          setLanguageError(true);
        } finally {
          setSavingLanguage(false);
        }
      }}
    >
      {STAFF_LANGS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {languageError && <p role="alert" className="text-base text-destructive">{t("meny.language_error")}</p>}
    </div>
  );
}

