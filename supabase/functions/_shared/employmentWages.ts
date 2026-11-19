/**
 * Lön per dag när lön eller lönetyp byts mitt i en period (som Fortnox DatedWages).
 * Utan rader i employment_wages gäller anställningens egna fält — samma som tidigare.
 * Används av både löneberäkningen och Granska lön så att siffrorna aldrig skiljer sig.
 */
export interface WageSource {
  pay_type: string | null;
  monthly_salary: number | string | null;
  hourly_rate: number | string | null;
}
export interface DatedWage extends WageSource {
  first_day: string;
}
export interface WageOnDay {
  pay_type: "monthly" | "hourly";
  monthly_salary: number;
  hourly_rate: number;
}

const toWage = (w: WageSource): WageOnDay => ({
  pay_type: w.pay_type === "monthly" ? "monthly" : "hourly",
  monthly_salary: Number(w.monthly_salary ?? 0),
  hourly_rate: Number(w.hourly_rate ?? 0),
});

/** Lönen som gäller ett visst datum: senaste raden med first_day ≤ datum, annars anställningens fält. */
export function wageOn(emp: WageSource, wages: DatedWage[] | undefined, date: string): WageOnDay {
  let best: DatedWage | null = null;
  for (const w of wages ?? []) {
    if (w.first_day <= date && (!best || w.first_day > best.first_day)) best = w;
  }
  return toWage(best ?? emp);
}

/** Timbas för kronor: timlön, eller månadslön / 165. */
export function hourlyBaseOn(emp: WageSource, wages: DatedWage[] | undefined, date: string): number {
  const w = wageOn(emp, wages, date);
  return w.pay_type === "monthly" ? w.monthly_salary / 165 : w.hourly_rate;
}

function days(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Fast månadslön för löneperioden. Utan lönebyte: hela månadslönen (som tidigare).
 * Med lönebyte i perioden: en period över ett månadsskifte (16–15) delas i två halvor,
 * före och efter månadsskiftet, och varje halva är halva månadslönen. Inom en halva
 * räknas lönen per kalenderdag. Byte den 1:a ger alltså exakt halva månadslönen.
 * Period utan månadsskifte: per kalenderdag i perioden.
 */
export function fixedSalaryForPeriod(emp: WageSource, wages: DatedWage[] | undefined, from: string, to: string): number {
  const inPeriod = (wages ?? []).some((w) => w.first_day > from && w.first_day <= to);
  if (!inPeriod) {
    const w = wageOn(emp, wages, to);
    return w.pay_type === "monthly" ? w.monthly_salary : 0;
  }
  const all = days(from, to);
  const months = [...new Set(all.map((d) => d.slice(0, 7)))];
  const halves = months.length === 2;
  const daysInPart = (day: string) => (halves ? all.filter((d) => d.slice(0, 7) === day.slice(0, 7)).length : all.length);
  const share = halves ? 0.5 : 1;
  let sum = 0;
  for (const day of all) {
    const w = wageOn(emp, wages, day);
    if (w.pay_type === "monthly") sum += (w.monthly_salary * share) / daysInPart(day);
  }
  return Math.round(sum * 100) / 100;
}

/** En del av löneperioden med samma lön: fast månadslön eller timlön. */
export interface WagePart {
  from: string;
  to: string;
  pay_type: "monthly" | "hourly";
  monthly_salary: number;
  hourly_rate: number;
  /** Fast lön för delen (0 för timlön) — samma halvor som fixedSalaryForPeriod. */
  fixed: number;
}

/**
 * Periodens delar när lön eller lönetyp byts i perioden, t.ex. fast månadslön 16–31 okt
 * och timlön från 1 nov. Summan av delarnas fasta lön är alltid fixedSalaryForPeriod.
 */
export function wagePartsInPeriod(emp: WageSource, wages: DatedWage[] | undefined, from: string, to: string): WagePart[] {
  const all = days(from, to);
  const months = [...new Set(all.map((d) => d.slice(0, 7)))];
  const halves = months.length === 2;
  const share = halves ? 0.5 : 1;
  const daysInPart = (day: string) => (halves ? all.filter((d) => d.slice(0, 7) === day.slice(0, 7)).length : all.length);
  const parts: WagePart[] = [];
  for (const day of all) {
    const w = wageOn(emp, wages, day);
    const last = parts[parts.length - 1];
    const perDay = w.pay_type === "monthly" ? (w.monthly_salary * share) / daysInPart(day) : 0;
    if (last && last.pay_type === w.pay_type && last.monthly_salary === w.monthly_salary && last.hourly_rate === w.hourly_rate) {
      last.to = day;
      last.fixed += perDay;
    } else {
      parts.push({ from: day, to: day, pay_type: w.pay_type, monthly_salary: w.monthly_salary, hourly_rate: w.hourly_rate, fixed: perDay });
    }
  }
  const inPeriod = (wages ?? []).some((w) => w.first_day > from && w.first_day <= to);
  if (!inPeriod && parts.length === 1) parts[0].fixed = parts[0].pay_type === "monthly" ? parts[0].monthly_salary : 0;
  return parts.map((p) => ({ ...p, fixed: Math.round(p.fixed * 100) / 100 }));
}

/**
 * Timlöner som gäller i perioden, en post per byte: { from, rate }.
 * Dagar med månadslön hoppas över. Används av Excel och PAXml så att filerna visar samma timlön.
 */
export function hourlyRatesInPeriod(emp: WageSource, wages: DatedWage[] | undefined, from: string, to: string): { from: string; rate: number }[] {
  const out: { from: string; rate: number }[] = [];
  let prev: string | null = null;
  for (const day of days(from, to)) {
    const w = wageOn(emp, wages, day);
    const key = w.pay_type === "hourly" ? `h:${w.hourly_rate}` : "m";
    if (key !== prev && w.pay_type === "hourly" && w.hourly_rate > 0) out.push({ from: day, rate: w.hourly_rate });
    prev = key;
  }
  return out;
}
