import {
  UserCheck, IdCard, Clock, ClipboardCheck, Activity, Scale, CalendarRange,
  CalendarCheck, Settings, Plug, LayoutGrid, BarChart3,
} from "lucide-react";
import type { SiteMode } from "@/contexts/SiteContext";
import { canAccessRoute } from "@/lib/pageAccess";
import { canOpenStaffPage, type StaffLevel } from "@/lib/staffModuleAccess";

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
      { title: "Stämplingar", url: "/time-entries", icon: ClipboardCheck, desc: "Alla stämplingar, faktisk och avrundad tid, och vem som är på plats" },
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
      { title: "Månadskalender", url: "/schedule", icon: CalendarCheck, desc: "Månadsvy med pass, frånvaro och Ej tillgänglig" },
      { title: "Mina pass", url: "/my-shifts", icon: CalendarRange, desc: "Egna pass, byten och tillgänglighet" },
    ],
  },
  {
    label: "Frånvaro",
    desc: "Sjukanmälan, semester, saldon och notiser",
    items: [
      { title: "Frånvaro", url: "/hr-control", icon: CalendarCheck, desc: "Ansökningar, semesterår, sjukperioder, saldon och notiser" },
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
      { title: "Granska lön", url: "/payroll-review", icon: ClipboardCheck, desc: "Löneperiod 16:e–15:e rad för rad, Fortnox, PAXml och Excel" },
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

/**
 * Grupper filtrerade på vad portalen får se och vad nivån (rollen) får se.
 * Tomma grupper faller bort.
 */
export function staffGroupsForSite(site: SiteMode, level: StaffLevel = "admin"): StaffNavGroup[] {
  return STAFF_MODULE_GROUPS
    .map(g => ({
      ...g,
      items: g.items.filter(i => canAccessRoute(site, i.url) && canOpenStaffPage(level, i.url)),
    }))
    .filter(g => g.items.length > 0);
}

/* ------------------------------------------------------------------ sektioner */

const ITEM_BY_URL = new Map(STAFF_MODULE_GROUPS.flatMap(g => g.items).map(i => [i.url, i]));

/** En vy inom ett sammanslaget menyval, t.ex. Planering inom Schema. */
export type StaffView = { title: string; url: string };

export type StaffSection = {
  /** Stabilt id, används i flikraden. */
  key: string;
  label: string;
  icon: any;
  /** Sektionens startsida. */
  url: string;
  items: (StaffNavItem & { views: StaffView[] })[];
};

/**
 * Sammanslagna menyval: ett menyval, flera vyer av samma sak. Sidorna finns kvar
 * på sina adresser men nås via vyväljaren under menyvalet — färre menyer och flikar.
 */
export const STAFF_MERGED_VIEWS: Record<string, StaffView[]> = {
  "/staff-schedule": [
    { title: "Vecka", url: "/staff-schedule" },
    { title: "Planering", url: "/schedule-planner" },
    { title: "Månad", url: "/schedule" },
  ],
  "/time-entries": [
    { title: "Alla stämplingar", url: "/time-entries" },
    { title: "På plats nu", url: "/live-staff" },
  ],
  "/payroll-review": [
    { title: "Granska lön", url: "/payroll-review" },
    { title: "Attest", url: "/attestations" },
  ],
  "/staff": [
    { title: "Personal", url: "/staff" },
    { title: "Personalregister", url: "/employees" },
  ],
  "/personalkollen": [
    { title: "Personalkollen", url: "/personalkollen" },
    { title: "Klocka vs PK", url: "/clock-vs-pk" },
  ],
};

/** Fem sektioner och tio menyval. Min profil ligger i användarmenyn. */
const SECTION_LAYOUT: { key: string; label: string; icon: any; urls: string[] }[] = [
  { key: "start", label: "Start", icon: LayoutGrid, urls: [] },
  { key: "schema", label: "Schema", icon: CalendarRange, urls: ["/staff-schedule", "/my-shifts"] },
  { key: "tider", label: "Tider", icon: Clock, urls: ["/time-entries", "/my-time", "/clock-stations"] },
  { key: "lon", label: "Lön", icon: BarChart3, urls: ["/payroll-review", "/staff-rules"] },
  { key: "personal", label: "Personal", icon: UserCheck, urls: ["/staff", "/hr-control", "/personalkollen"] },
];

/** Sektioner filtrerade på portal och nivå. Menyval utan någon öppningsbar vy faller bort. */
export function staffSectionsForSite(site: SiteMode, level: StaffLevel = "admin"): StaffSection[] {
  const allowed = (url: string) => canAccessRoute(site, url) && canOpenStaffPage(level, url);
  return SECTION_LAYOUT.map(section => {
    const items = section.urls.flatMap(url => {
      const item = ITEM_BY_URL.get(url);
      if (!item) return [];
      const views = (STAFF_MERGED_VIEWS[url] ?? [{ title: item.title, url }]).filter(v => allowed(v.url));
      if (!views.length) return [];
      return [{ ...item, url: views[0].url, views }];
    });
    return { key: section.key, label: section.label, icon: section.icon, url: section.key === "start" ? "/personal" : items[0]?.url ?? "", items };
  }).filter(section => section.key === "start" || section.items.length > 0);
}

/** Vilken sektion en rutt hör till (även vyer inom sammanslagna menyval). */
export function staffSectionOf(sections: StaffSection[], path: string): StaffSection | null {
  return sections.find(section => section.items.some(item => item.views.some(v => v.url === path))) ?? null;
}

/** Menyvalet som en rutt hör till. */
export function staffItemOf(section: StaffSection | null, path: string) {
  return section?.items.find(item => item.views.some(v => v.url === path)) ?? null;
}
