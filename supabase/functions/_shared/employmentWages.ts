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
 * Med lönebyte i perioden: månadslönen räknas per kalenderdag den gäller (dagar / periodens dagar).
 */
export function fixedSalaryForPeriod(emp: WageSource, wages: DatedWage[] | undefined, from: string, to: string): number {
  const inPeriod = (wages ?? []).some((w) => w.first_day > from && w.first_day <= to);
  if (!inPeriod) {
    const w = wageOn(emp, wages, to);
    return w.pay_type === "monthly" ? w.monthly_salary : 0;
  }
  const all = days(from, to);
  let sum = 0;
  for (const day of all) {
    const w = wageOn(emp, wages, day);
    if (w.pay_type === "monthly") sum += w.monthly_salary / all.length;
  }
  return Math.round(sum * 100) / 100;
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
