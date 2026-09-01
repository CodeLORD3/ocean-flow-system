import { NavLink } from "react-router-dom";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { staffGroupsForSite } from "@/lib/staffModuleNav";
import { staffLevelOf, staffLevelLabel } from "@/lib/staffModuleAccess";
import { StaffModuleNav } from "@/components/staff/StaffModuleNav";

/**
 * Samlad ingång till hela personalmodulen: personal, tid, schema, frånvaro,
 * attest och lön. Varje kort länkar till den befintliga sidan.
 */
export default function PersonalHub() {
  const { site } = useSite();
  const { staff } = useStaffAuth();
  const level = staffLevelOf(staff);
  const groups = staffGroupsForSite(site, level);

  return (
    <div className="h-full overflow-auto p-4">
      <StaffModuleNav />

      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-md bg-primary/15 p-2">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold leading-tight">Personal &amp; Schema</h1>
          <p className="text-xs text-muted-foreground">
            {level === "employee" ? "Dina pass, tider, frånvaro och profil." : `Personalmodulen · ${staffLevelLabel(level)}.`}
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((group, gi) => (
          <section key={group.label}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold tabular-nums">
                <span className="mr-2 text-muted-foreground">{gi + 1}.</span>
                {group.label}
              </h2>
              <span className="text-xs text-muted-foreground">{group.desc}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <NavLink key={item.url} to={item.url} end className="block">
                  <Card className="h-full border-border/60 p-3 transition-colors hover:border-primary/40 hover:bg-muted/40">
                    <div className="flex items-start gap-2.5">
                      <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{item.title}</div>
                        <div className="text-xs leading-snug text-muted-foreground">{item.desc}</div>
                      </div>
                    </div>
                  </Card>
                </NavLink>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
