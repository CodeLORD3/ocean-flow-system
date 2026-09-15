import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, CalendarDays, PieChart, User, Users } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { staffGroupsForSite } from "@/lib/staffModuleNav";
import { staffLevelOf, staffLevelLabel } from "@/lib/staffModuleAccess";
import { KpiCard, LinkCard, PersonRow, SectionHead, SegmentSwitch, SlEmpty, StatusPill, GroupHeader, SubHeader } from "@/components/staff/ui";
import { useLiveStaffDay } from "@/hooks/useLiveStaff";
import { useStaffKpi } from "@/hooks/useStaffKpi";
import { useLegalEntities } from "@/hooks/useLegalEntities";
import { dateKey, STATUS_LABEL, type LiveStatus } from "@/lib/liveStaff";
import { formatHm, formatKr } from "@/lib/scheduleFormat";

/** Datumnyckel för idag eller igår. */
function dayFor(which: "today" | "yesterday"): string {
  const date = new Date();
  if (which === "yesterday") date.setDate(date.getDate() - 1);
  return dateKey(date);
}

const STATUS_TONE: Record<LiveStatus, "ok" | "warn" | "alert" | "neutral" | "info"> = {
  working: "ok",
  planned: "info",
  break: "warn",
  deviation: "alert",
  done: "neutral",
  closed: "neutral",
};

/** Startvyn för Personal & Schema: dagens nyckeltal, dagens pass och genvägar. */
export default function PersonalHub() {
  const { site } = useSite();
  const { staff: me } = useStaffAuth();
  const level = staffLevelOf(me);
  const groups = staffGroupsForSite(site, level);
  const [which, setWhich] = useState<"today" | "yesterday">("today");
  const day = dayFor(which);

  const { rows, staffById, isLoading } = useLiveStaffDay(day);
  const entities = useLegalEntities();

  const kpiSources = useMemo(
    () =>
      rows.map((row) => ({
        storeId: row.id,
        name: row.name,
        city: row.city,
        workingNow: row.workingNow,
        deviations: row.deviations.length,
        workedMinutes: row.workedMinutes,
        plannedMinutes: row.plannedMinutes,
        staffRows: row.staffRows.map((item) => ({ staffId: item.staffId, workedMinutes: item.workedMinutes })),
      })),
    [rows],
  );
  const kpi = useStaffKpi(day, kpiSources);

  const totals = kpi.totals;
  const workedMinutes = totals?.workedMinutes ?? 0;
  const workedHours = workedMinutes / 60;
  const laborCost = totals?.laborCost ?? null;
  const revenue = totals?.revenue ?? null;
  const costRatio = totals?.costRatioPct ?? null;
  const perHour = revenue !== null && workedHours > 0 ? revenue / workedHours : null;

  const entityName = (id: string | null) => {
    if (!id) return "Utan bolag";
    const found = (entities.data ?? []).find((entity) => entity.legal_entity_id === id);
    return found?.legal_name ?? "Utan bolag";
  };

  /** Dagens pass grupperade per bolag och därunder per enhet. */
  const shiftGroups = useMemo(() => {
    const byEntity = new Map<string, { entity: string; stores: { name: string; people: any[] }[] }>();
    rows.forEach((row) => {
      const people = row.staffRows.filter((item) => item.plannedMinutes > 0 || item.workedMinutes > 0);
      if (people.length === 0) return;
      const key = row.legalEntityId ?? "none";
      const bucket = byEntity.get(key) ?? { entity: entityName(row.legalEntityId), stores: [] };
      bucket.stores.push({ name: row.name, people });
      byEntity.set(key, bucket);
    });
    return Array.from(byEntity.values());
  }, [rows, entities.data]);

  const firstIn = (person: any): string | null => {
    const segment = person.actualSegments?.find((item: any) => item.kind === "work");
    if (!segment) return null;
    const hours = Math.floor(segment.from / 60);
    const minutes = segment.from % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const personName = (id: string) => {
    const person = staffById.get(id);
    if (!person) return "Okänd person";
    return `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() || "Okänd person";
  };

  return (
    <div className="staff-light h-full overflow-auto px-3 pb-8 sm:px-5">

      <main className="mx-auto max-w-[1400px]">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="sl-kpi__icon sl-kpi__icon--blue" aria-hidden="true">
              <Users size={20} />
            </span>
            <div>
              <span className="sl-label">Makrill Trade · Personal</span>
              <h1 className="sl-h1 mt-1">Personal &amp; Schema</h1>
              <p className="mt-1 text-[14px] sl-muted">
                {level === "employee" ? "Dina pass, tider, frånvaro och profil." : `Personalmodulen · ${staffLevelLabel(level)}.`}
              </p>
            </div>
          </div>
          <SegmentSwitch<"today" | "yesterday">
            value={which}
            onChange={setWhich}
            ariaLabel="Dag"
            options={[
              { value: "today", label: "Idag" },
              { value: "yesterday", label: "Igår" },
            ]}
          />
        </header>

        {level === "employee" ? null : (
          <section className="mb-8" aria-label="Nyckeltal">
            <SectionHead
              title={which === "today" ? "Dagens utfall" : "Gårdagens utfall"}
              action={
                <NavLink to="/payroll-basis" className="sl-btn">
                  Gå till analys
                </NavLink>
              }
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <KpiCard
                label="Försäljning"
                tone="blue"
                icon={<BarChart3 size={19} />}
                value={revenue === null ? "—" : formatKr(revenue)}
                history={revenue === null ? "—" : "—"}
              />
              <KpiCard
                label="Personalkostnad"
                tone="yellow"
                icon={<User size={19} />}
                value={laborCost === null ? "—" : formatKr(laborCost)}
                history="—"
                diff={laborCost === null ? "±0 kr" : `+${formatKr(laborCost)}`}
                diffDirection={laborCost ? "up" : null}
              />
              <KpiCard
                label="Personalkostnad %"
                tone="purple"
                icon={<User size={19} />}
                value={costRatio === null ? "—" : `${costRatio.toFixed(1)} %`}
                history="—"
                diff={costRatio === null ? "±0 %-enheter" : `${costRatio.toFixed(1)} %-enheter`}
                diffDirection={costRatio ? "up" : null}
              />
              <KpiCard
                label="Arbetade timmar"
                tone="yellow"
                icon={<CalendarDays size={19} />}
                value={`${formatHm(workedMinutes)}`}
                history="—"
                diff={workedMinutes ? `+${formatHm(workedMinutes)}` : "±0 tim"}
                diffDirection={workedMinutes ? "up" : null}
              />
              <KpiCard
                label="Försäljning per arbetad timme"
                tone="purple"
                icon={<PieChart size={19} />}
                value={perHour === null ? "—" : formatKr(perHour)}
                history="—"
              />
            </div>
          </section>
        )}

        <section className="mb-8" aria-label="Dagens pass">
          <SectionHead
            title={which === "today" ? "Dagens pass" : "Gårdagens pass"}
            action={
              <NavLink to="/staff-schedule" className="sl-btn">
                Gå till schema
              </NavLink>
            }
          />
          <div className="sl-card overflow-hidden">
            {isLoading ? (
              <SlEmpty>Hämtar dagens pass …</SlEmpty>
            ) : shiftGroups.length === 0 ? (
              <SlEmpty>Inga planerade eller stämplade pass den här dagen.</SlEmpty>
            ) : (
              shiftGroups.map((group) => (
                <div key={group.entity}>
                  <GroupHeader>{group.entity}</GroupHeader>
                  {group.stores.map((store) => (
                    <div key={`${group.entity}-${store.name}`}>
                      <SubHeader>{store.name}</SubHeader>
                      {store.people.map((person: any) => (
                        <PersonRow
                          key={`${store.name}-${person.staffId}`}
                          name={personName(person.staffId)}
                          secondary={store.name}
                          avatarUrl={staffById.get(person.staffId)?.profile_image_url ?? null}
                          middle={firstIn(person) ? `Instämplad ${firstIn(person)}` : "Ingen stämpling"}
                          status={<StatusPill tone={STATUS_TONE[person.status as LiveStatus]}>{STATUS_LABEL[person.status as LiveStatus]}</StatusPill>}
                          trailing={person.workedMinutes > 0 ? formatHm(person.workedMinutes) : undefined}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        </section>

        <section aria-label="Alla funktioner">
          <SectionHead title="Alla funktioner" />
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group.label}>
                <div className="mb-2 flex items-center gap-2">
                  <h3 className="sl-h3">{group.label}</h3>
                  <span className="text-[13px] sl-muted">{group.desc}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((item) => (
                    <NavLink key={item.url} to={item.url} end>
                      <LinkCard title={item.title} desc={item.desc} icon={<item.icon size={18} />} />
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
