import {
  UserCheck, IdCard, Clock, ClipboardCheck, Activity, Scale, CalendarRange,
  CalendarCheck, Settings, FileText, Plug,
} from "lucide-react";
import type { SiteMode } from "@/contexts/SiteContext";
import { canAccessRoute } from "@/lib/pageAccess";

/**
 * En enda källa för hela personalmodulen (personal, tid, schema, frånvaro,
 * attest och lön). Både navsidan /personal och flikraden på varje personalsida
 * läser den här listan, så inget som är byggt kan bli osynligt.
 */

export type StaffNavItem = {
  title: string;
  url: string;
  icon: any;
  desc: string;
};

export type StaffNavGroup = {
  label: string;
  desc: string;
  items: StaffNavItem[];
};

export const STAFF_MODULE_GROUPS: StaffNavGroup[] = [
  {
    label: "Personal",
    desc: "Personalkort, kontaktuppgifter, behörigheter och anställningar",
    items: [
      { title: "Personal", url: "/staff", icon: UserCheck, desc: "Personalkort, kontakt, portalbehörighet och lön" },
      { title: "Personalregister", url: "/employees", icon: IdCard, desc: "Anställningar, personnummer och dokument" },
      { title: "Min profil", url: "/profile", icon: UserCheck, desc: "Dina egna kontaktuppgifter och profilinställningar" },
    ],
  },
  {
    label: "Tid & Stämpling",
    desc: "Stämpelklocka, rapporterad tid och vem som är på plats",
    items: [
      { title: "Stämpelklocka", url: "/clock-stations", icon: Clock, desc: "Stationer, koder och driftövervakning" },
      { title: "Rapporterad tid", url: "/time-entries", icon: ClipboardCheck, desc: "Alla stämplingar, faktisk och avrundad tid" },
      { title: "Min tid", url: "/my-time", icon: Clock, desc: "Egen tid, saldon och pass" },
      { title: "På plats nu", url: "/live-staff", icon: Activity, desc: "Live-vy över vilka som arbetar just nu" },
      { title: "Klocka vs PK", url: "/clock-vs-pk", icon: Scale, desc: "Jämförelse mot Personalkollen" },
    ],
  },
  {
    label: "Schema",
    desc: "Planering, publicerat schema och egna pass",
    items: [
      { title: "Schema", url: "/staff-schedule", icon: CalendarRange, desc: "Publicerat schema per butik och vecka" },
      { title: "Schemaplanering", url: "/schedule-planner", icon: CalendarRange, desc: "Planera pass, mallar och bemanningsbehov" },
      { title: "Mina pass", url: "/my-shifts", icon: CalendarRange, desc: "Egna pass, byten och tillgänglighet" },
    ],
  },
  {
    label: "Frånvaro",
    desc: "Sjukanmälan, semester, saldon och notiser",
    items: [
      { title: "Frånvaro & bemanning", url: "/hr-control", icon: CalendarCheck, desc: "Ansökningar, sjukperioder, semestersaldon och notiser" },
    ],
  },
  {
    label: "Attest & Regler",
    desc: "Godkännande av tid samt OB- och övertidsregler",
    items: [
      { title: "Attest", url: "/attestations", icon: ClipboardCheck, desc: "Godkänn arbetad tid per period" },
      { title: "Regler & OB", url: "/staff-rules", icon: Settings, desc: "OB-fönster, övertid, raster och avrundning" },
    ],
  },
  {
    label: "Lön",
    desc: "Löneunderlag och export till lönesystem",
    items: [
      { title: "Granska lön", url: "/payroll-review", icon: ClipboardCheck, desc: "Granska löneperiod rad för rad" },
      { title: "Löneunderlag", url: "/payroll-exports", icon: FileText, desc: "Exportfiler och exportlogg" },
    ],
  },
  {
    label: "Integration",
    desc: "Synk mot externa personalsystem",
    items: [
      { title: "Personalkollen", url: "/personalkollen", icon: Plug, desc: "Synkstatus, personal och loggade tider" },
    ],
  },
];

/** Alla rutter som hör till personalmodulen. */
export const STAFF_MODULE_PATHS = STAFF_MODULE_GROUPS.flatMap(g => g.items.map(i => i.url));

/** Grupper filtrerade på vad portalen får se. Tomma grupper faller bort. */
export function staffGroupsForSite(site: SiteMode): StaffNavGroup[] {
  return STAFF_MODULE_GROUPS
    .map(g => ({ ...g, items: g.items.filter(i => canAccessRoute(site, i.url)) }))
    .filter(g => g.items.length > 0);
}
