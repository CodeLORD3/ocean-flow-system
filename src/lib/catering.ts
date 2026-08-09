/**
 * Catering: allergener, gästskalning, öppettider och kapacitet.
 *
 * Reglerna hör till kundbeställningar (privatkunder) och rör aldrig
 * shop_orders eller kassan.
 */

/** De fjorton allergengrupperna enligt märkningsreglerna. */
export const ALLERGENS: { key: string; label: string }[] = [
  { key: "fisk", label: "Fisk" },
  { key: "skaldjur", label: "Kräftdjur (skaldjur)" },
  { key: "blotdjur", label: "Blötdjur" },
  { key: "gluten", label: "Gluten" },
  { key: "agg", label: "Ägg" },
  { key: "mjolk", label: "Mjölk" },
  { key: "notter", label: "Nötter" },
  { key: "jordnotter", label: "Jordnötter" },
  { key: "soja", label: "Soja" },
  { key: "selleri", label: "Selleri" },
  { key: "senap", label: "Senap" },
  { key: "sesam", label: "Sesamfrön" },
  { key: "sulfit", label: "Svaveldioxid och sulfit" },
  { key: "lupin", label: "Lupin" },
];

export const allergenLabel = (key: string) =>
  ALLERGENS.find((a) => a.key === key)?.label ?? key;

export interface AllergenConflict {
  /** Allergener som både kunden undviker och varan innehåller. */
  hits: string[];
  /** Klarspråksvarning, eller null när varan är fri från kundens allergener. */
  message: string | null;
  /** Varan saknar allergenuppgifter — vi kan inte lova något. */
  unknown: boolean;
}

/**
 * Varning vid artikelval när kunden angett allergi.
 * Ingen spärr: personalen bekräftar med kunden och kan lägga till ändå.
 */
export function checkAllergens(params: {
  productName: string;
  productAllergens?: string[] | null;
  excluded?: string[] | null;
}): AllergenConflict {
  const excluded = (params.excluded || []).filter(Boolean);
  const own = params.productAllergens || [];
  if (excluded.length === 0) return { hits: [], message: null, unknown: false };
  if (own.length === 0) {
    return {
      hits: [],
      unknown: true,
      message: `${params.productName} saknar allergenuppgifter. Kontrollera med kunden innan varan läggs till.`,
    };
  }
  const hits = own.filter((a) => excluded.includes(a));
  if (hits.length === 0) return { hits: [], message: null, unknown: false };
  return {
    hits,
    unknown: false,
    message: `${params.productName} innehåller ${hits.map(allergenLabel).join(", ").toLowerCase()}. Kunden har angett att detta ska undvikas.`,
  };
}

/* ------------------------------------------------------------- gästskalning */

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Räknar om en rad utifrån antal gäster.
 * Portion per gäst gånger gästantal. Låsta rader (t.ex. en tårta eller ett
 * fast upplägg) räknas aldrig om.
 */
export function scaleQuantity(params: {
  portionPerGuest?: number | null;
  guestCount?: number | null;
  lockedFromScaling?: boolean;
  currentQuantity: number;
}): number {
  const portion = Number(params.portionPerGuest || 0);
  const guests = Number(params.guestCount || 0);
  if (params.lockedFromScaling || !portion || !guests) return round3(params.currentQuantity);
  return round3(portion * guests);
}

/** Portion per gäst utifrån en redan angiven mängd. */
export function portionFromQuantity(quantity: number, guestCount?: number | null) {
  const guests = Number(guestCount || 0);
  if (!guests) return null;
  return round3(Number(quantity || 0) / guests);
}

/* ------------------------------------------------ öppettider och kapacitet */

export interface OpeningHours {
  [weekday: string]: { open: string; close: string } | null;
}

export interface StoreOrderSettings {
  id: string;
  store_id: string;
  opening_hours: OpeningHours;
  max_catering_per_day: number;
  max_deliveries_per_slot: number;
}

export interface SpecialDay {
  id: string;
  store_id: string;
  day: string;
  closed: boolean;
  open_time: string | null;
  close_time: string | null;
  note: string | null;
}

export interface MajorHoliday {
  id: string;
  name: string;
  holiday_date: string;
  last_order_date: string;
  capacity_cap: number | null;
  open_time: string | null;
  close_time: string | null;
  store_id: string | null;
  note: string | null;
}

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];

export const weekdayName = (date: string) =>
  WEEKDAYS[new Date(date + "T00:00:00").getDay()] ?? "";

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export interface DayWindow {
  closed: boolean;
  open: string | null;
  close: string | null;
  /** Varifrån tiden kommer: ordinarie, avvikande dag eller storhelg. */
  sourceLabel: string;
}

/** Butikens öppettider för ett datum, med avvikande dagar och storhelger. */
export function dayWindow(params: {
  date: string;
  settings?: StoreOrderSettings | null;
  specialDays?: SpecialDay[];
  holidays?: MajorHoliday[];
}): DayWindow {
  const special = (params.specialDays || []).find((s) => s.day === params.date);
  if (special) {
    return {
      closed: special.closed,
      open: special.open_time?.slice(0, 5) ?? null,
      close: special.close_time?.slice(0, 5) ?? null,
      sourceLabel: special.note || "Avvikande dag",
    };
  }
  const holiday = (params.holidays || []).find(
    (h) => h.holiday_date === params.date && (h.open_time || h.close_time),
  );
  if (holiday) {
    return {
      closed: false,
      open: holiday.open_time?.slice(0, 5) ?? null,
      close: holiday.close_time?.slice(0, 5) ?? null,
      sourceLabel: holiday.name,
    };
  }
  const weekday = String(new Date(params.date + "T00:00:00").getDay());
  const hours = params.settings?.opening_hours?.[weekday];
  if (!params.settings) {
    return { closed: false, open: null, close: null, sourceLabel: "Öppettider saknas" };
  }
  if (!hours) {
    return { closed: true, open: null, close: null, sourceLabel: "Stängt" };
  }
  return {
    closed: false,
    open: hours.open?.slice(0, 5) ?? null,
    close: hours.close?.slice(0, 5) ?? null,
    sourceLabel: "Ordinarie öppettider",
  };
}

/** Tvåtimmarsintervall som en tid hör till, t.ex. 14:30 → "14:00–16:00". */
export function deliverySlot(time?: string | null) {
  if (!time) return null;
  const start = Math.floor(toMinutes(time.slice(0, 5)) / 120) * 120;
  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:00`;
  return `${fmt(start)}–${fmt(start + 120)}`;
}

export interface CapacityCheck {
  /** Varningar som personalen ska se, i klarspråk. Ingen av dem spärrar. */
  warnings: string[];
  /** Hård stopp: butiken är stängd eller sista beställningsdag passerad. */
  blocking: string | null;
}

/**
 * Kontroll av önskad tid mot öppettider, cateringtak, leveranstak per
 * tvåtimmarsintervall och storhelgernas sista beställningsdag.
 */
export function checkCapacity(params: {
  date: string;
  time?: string | null;
  orderType: string;
  category: string;
  settings?: StoreOrderSettings | null;
  specialDays?: SpecialDay[];
  holidays?: MajorHoliday[];
  /** Befintliga order samma datum i samma butik. */
  sameDayOrders: { category: string; order_type: string; wanted_time: string | null }[];
}): CapacityCheck {
  const warnings: string[] = [];
  let blocking: string | null = null;

  const win = dayWindow({
    date: params.date,
    settings: params.settings,
    specialDays: params.specialDays,
    holidays: params.holidays,
  });

  if (win.closed) {
    blocking = `Butiken är stängd ${weekdayName(params.date)} ${params.date} (${win.sourceLabel}).`;
  } else if (params.time && win.open && win.close) {
    const t = toMinutes(params.time.slice(0, 5));
    if (t < toMinutes(win.open) || t > toMinutes(win.close)) {
      warnings.push(
        `Kl ${params.time.slice(0, 5)} ligger utanför öppettiderna ${win.open}–${win.close} (${win.sourceLabel}).`,
      );
    }
  }

  const holiday = (params.holidays || []).find((h) => h.holiday_date === params.date);
  if (holiday) {
    const today = new Date().toISOString().slice(0, 10);
    if (today > holiday.last_order_date) {
      blocking = `${holiday.name}: sista beställningsdag var ${holiday.last_order_date}.`;
    } else {
      warnings.push(
        `${holiday.name} — beställ senast ${holiday.last_order_date}. Storhelg, planera packningen.`,
      );
    }
  }

  const cateringToday = params.sameDayOrders.filter((o) => o.category === "catering").length;
  const cateringCap = holiday?.capacity_cap ?? params.settings?.max_catering_per_day ?? null;
  if (params.category === "catering" && cateringCap != null && cateringToday >= cateringCap) {
    warnings.push(
      `Butiken har redan ${cateringToday} cateringorder ${params.date} och taket är ${cateringCap}. Kontrollera att ni hinner.`,
    );
  }

  if (params.orderType === "leverans" && params.time) {
    const slot = deliverySlot(params.time);
    const inSlot = params.sameDayOrders.filter(
      (o) => o.order_type === "leverans" && deliverySlot(o.wanted_time) === slot,
    ).length;
    const cap = params.settings?.max_deliveries_per_slot ?? null;
    if (cap != null && inSlot >= cap) {
      warnings.push(
        `${inSlot} leveranser är redan inbokade ${slot}. Taket är ${cap} — välj en annan tid om ni inte hinner.`,
      );
    }
  }

  return { warnings, blocking };
}
