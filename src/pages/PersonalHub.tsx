import { NavLink } from "react-router-dom";
import { ArrowUpRight, Users } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { staffGroupsForSite } from "@/lib/staffModuleNav";
import { staffLevelOf, staffLevelLabel } from "@/lib/staffModuleAccess";
import { StaffModuleNav } from "@/components/staff/StaffModuleNav";

/** Samlad ingång till personalmodulen, med rollstyrda länkar. */
export default function PersonalHub() {
  const { site } = useSite();
  const { staff } = useStaffAuth();
  const level = staffLevelOf(staff);
  const groups = staffGroupsForSite(site, level);

  return (
    <div className="ind h-full overflow-auto p-3 sm:p-5">
      <StaffModuleNav />

      <main className="mx-auto max-w-[1400px]">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-5 border-b border-[var(--color-divider)] pb-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent-700)] text-[var(--color-neutral-100)]">
              <Users size={20} />
            </div>
            <div>
              <span className="ind-label">Makrill Trade · Personal</span>
              <h1 className="ind-h1 mt-1">Personal &amp; Schema</h1>
              <p className="mt-2 max-w-xl text-sm ind-muted">
                {level === "employee" ? "Dina pass, tider, frånvaro och profil." : `Personalmodulen · ${staffLevelLabel(level)}.`}
              </p>
            </div>
          </div>
          <span className="ind-meta-chip ind-num">{groups.reduce((sum, group) => sum + group.items.length, 0)} funktioner</span>
        </header>

        <div className="space-y-8">
          {groups.map((group, gi) => (
            <section key={group.label} aria-labelledby={`staff-group-${gi}`}>
              <div className="mb-3 flex items-center gap-2 border-b border-[var(--color-divider)] pb-2">
                <span className="ind-groupnum">{String(gi + 1).padStart(2, "0")}</span>
                <h2 id={`staff-group-${gi}`} className="ind-h3">{group.label}</h2>
                <span className="text-xs ind-muted">{group.desc}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {group.items.map((item) => (
                  <NavLink key={item.url} to={item.url} end className="group block">
                    <div className="ind-modcard">
                      <item.icon className="ind-modcard__icon" size={19} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="ind-modcard__title">{item.title}</div>
                          <ArrowUpRight size={15} className="shrink-0 text-[var(--ind-muted)] transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </div>
                        <div className="ind-modcard__desc mt-1">{item.desc}</div>
                      </div>
                    </div>
                  </NavLink>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
