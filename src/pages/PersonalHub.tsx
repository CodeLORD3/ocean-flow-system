import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { BarChart3, CalendarDays, PieChart, User, Users } from "lucide-react";
import { useSite } from "@/contexts/SiteContext";
import { useStaffAuth } from "@/contexts/StaffAuthContext";
import { staffLevelOf, staffLevelLabel } from "@/lib/staffModuleAccess";
import { Avatar, SegmentSwitch, SlEmpty, StatusPill } from "@/components/staff/ui";
import { StaffModuleNav } from "@/components/staff/StaffModuleNav";
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

type Region = "all" | "goteborg" | "stockholm" | "schweiz";

/** Vilken region en enhet tillhör — bolaget avgör, orten är reserv. */
function regionOf(legalEntityId: string | null, city: string): Region | null {
  if (legalEntityId === "fsab-se") return "goteborg";
  if (legalEntityId === "de-no1") return "stockholm";
  if (legalEntityId === "fsab-ch") return "schweiz";
  const town = (city ?? "").toLowerCase();
  if (town.includes("stockholm")) return "stockholm";
  if (town.includes("zürich") || town.includes("zurich") || town.includes("morges")) return "schweiz";
  if (town) return "goteborg";
  return null;
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
  const [which, setWhich] = useState<"today" | "yesterday">("today");
  const day = dayFor(which);

  const [region, setRegion] = useState<Region>("all");

  const { rows: allRows, staffById, isLoading } = useLiveStaffDay(day);
  const entities = useLegalEntities();

  const rows = useMemo(
    () => (region === "all" ? allRows : allRows.filter((row) => regionOf(row.legalEntityId, row.city) === region)),
    [allRows, region],
  );

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

  const kpis = [
    { label: "Försäljning", icon: BarChart3, value: revenue === null ? "—" : formatKr(revenue) },
    { label: "Personalkostnad", icon: User, value: laborCost === null ? "—" : formatKr(laborCost) },
    { label: "Personalkostnad %", icon: PieChart, value: costRatio === null ? "—" : `${costRatio.toFixed(1)} %` },
    { label: "Arbetade timmar", icon: CalendarDays, value: formatHm(workedMinutes) },
    { label: "Försäljning/tim", icon: BarChart3, value: perHour === null ? "—" : formatKr(perHour) },
  ];

  const peopleCount = shiftGroups.reduce(
    (sum, group) => sum + group.stores.reduce((inner, store) => inner + store.people.length, 0),
    0,
  );

  return (
    <div className="staff-light flex h-full min-h-0 flex-col overflow-hidden px-3 pb-3 sm:px-5">
      <StaffModuleNav />

      {/* Rubrikrad — kompakt så hela vyn ryms utan att skrolla */}
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-grid-line pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
            <Users size={16} />
          </span>
          <div>
            <h1 className="text-[15px] font-semibold leading-tight text-foreground">Personal &amp; Schema</h1>
            <p className="text-[11px] text-muted-foreground">
              {level === "employee" ? "Dina pass, tider, frånvaro och profil." : `Personalmodulen · ${staffLevelLabel(level)}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentSwitch<Region>
            value={region}
            onChange={setRegion}
            ariaLabel="Ort"
            options={[
              { value: "all", label: "Alla" },
              { value: "goteborg", label: "Göteborg" },
              { value: "stockholm", label: "Stockholm" },
              { value: "schweiz", label: "Schweiz" },
            ]}
          />
          <SegmentSwitch<"today" | "yesterday">
            value={which}
            onChange={setWhich}
            ariaLabel="Dag"
            options={[
              { value: "today", label: "Idag" },
              { value: "yesterday", label: "Igår" },
            ]}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 pb-1 lg:flex-row">
      {level === "employee" ? null : (
        <section
          className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:min-h-0 lg:w-[19rem] lg:flex-col xl:w-[20rem]"
          aria-label="Nyckeltal"
        >
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="flex min-h-0 min-w-0 flex-col justify-center gap-1 rounded-xl border border-grid-line bg-card px-3 py-2 shadow-sm transition-colors hover:border-accent/40 lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <kpi.icon size={13} />
                </span>
                <span
                  title={kpi.label}
                  className="whitespace-nowrap text-[10px] font-medium uppercase tracking-normal text-muted-foreground"
                >
                  {kpi.label}
                </span>
              </div>
              <div className="shrink-0 truncate whitespace-nowrap font-mono text-[15px] font-semibold tabular-nums text-foreground">
                {kpi.value}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Dagens pass fyller resten av skärmen — personerna ligger sida vid sida */}
      <section
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-grid-line bg-card shadow-sm"
        aria-label="Dagens pass"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-grid-line px-3.5 py-2.5">
          <div className="flex items-baseline gap-2">
            <h2 className="text-[13px] font-semibold text-foreground">
              {which === "today" ? "Dagens pass" : "Gårdagens pass"}
            </h2>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10.5px] tabular-nums text-muted-foreground">
              {peopleCount} personer
            </span>
          </div>
          <NavLink
            to="/staff-schedule"
            className="rounded-lg border border-grid-line px-2.5 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
          >
            Gå till schema
          </NavLink>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          {isLoading ? (
            <SlEmpty>Hämtar dagens pass …</SlEmpty>
          ) : shiftGroups.length === 0 ? (
            <SlEmpty>Inga planerade eller stämplade pass den här dagen.</SlEmpty>
          ) : (
            <div className="space-y-4">
              {shiftGroups.map((group) => (
                <div key={group.entity} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.entity}
                    </span>
                    <span className="h-px flex-1 bg-grid-line" />
                  </div>
                  {group.stores.map((store) => (
                    <div key={`${group.entity}-${store.name}`} className="space-y-2">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px] font-medium text-foreground">{store.name}</span>
                        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                          {store.people.length}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                        {store.people.map((person: any) => (
                          <div
                            key={`${store.name}-${person.staffId}`}
                            className="flex items-center gap-2.5 rounded-xl border border-grid-line bg-background px-2.5 py-2 transition-colors hover:border-accent/40"
                          >
                            <Avatar
                              name={personName(person.staffId)}
                              url={staffById.get(person.staffId)?.profile_image_url ?? null}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold leading-tight text-foreground">
                                {personName(person.staffId)}
                              </p>
                              <p className="truncate font-mono text-[11px] tabular-nums text-muted-foreground">
                                {firstIn(person) ? `In ${firstIn(person)}` : "Ingen stämpling"}
                                {person.workedMinutes > 0 ? ` · ${formatHm(person.workedMinutes)}` : ""}
                              </p>
                            </div>
                            <StatusPill tone={STATUS_TONE[person.status as LiveStatus]}>
                              {STATUS_LABEL[person.status as LiveStatus]}
                            </StatusPill>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}

