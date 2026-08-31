/**
 * Helpers for displaying the "week" of a shop order.
 *
 * Business rule: the week shown to users should reflect the *delivery* week
 * (when the goods are expected to arrive at the shop), not the week the
 * order was placed. The underlying `order_week` column in the database is
 * left unchanged — this is a presentation-only transformation. If no
 * delivery date is available, we fall back to the stored `order_week`.
 */

export function getIsoWeek(d: Date): number {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the year.
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Returns the week label to display for a shop order. Prefers the order's
 * `desired_delivery_date`, then the earliest `delivery_date` on its lines,
 * and finally the original `order_week` field.
 */
export function displayOrderWeek(order: any): string {
  if (!order) return "";

  const desired = parseDate(order.desired_delivery_date);
  if (desired) return `V${getIsoWeek(desired)}`;

  const lineDates: Date[] = Array.isArray(order.shop_order_lines)
    ? order.shop_order_lines
        .map((l: any) => parseDate(l?.delivery_date))
        .filter((d: Date | null): d is Date => d !== null)
    : [];
  if (lineDates.length > 0) {
    const earliest = new Date(Math.min(...lineDates.map((d) => d.getTime())));
    return `V${getIsoWeek(earliest)}`;
  }

  if (!order.order_week) return "";
  const raw = String(order.order_week);
  return raw.startsWith("V") ? raw : `V${raw}`;
}

/** ISO week + ISO year for a date, as a sortable ordinal (year * 100 + week). */
function isoOrdinalFromDate(d: Date): number {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  dt.setUTCDate(dt.getUTCDate() + 4 - (dt.getUTCDay() || 7));
  const isoYear = dt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return isoYear * 100 + week;
}

/** Sortable week ordinal for the week shown to users (delivery week first). */
export function orderWeekOrdinal(order: any): number | null {
  if (!order) return null;

  const desired = parseDate(order.desired_delivery_date);
  if (desired) return isoOrdinalFromDate(desired);

  const lineDates: Date[] = Array.isArray(order.shop_order_lines)
    ? order.shop_order_lines
        .map((l: any) => parseDate(l?.delivery_date))
        .filter((d: Date | null): d is Date => d !== null)
    : [];
  if (lineDates.length > 0) {
    return isoOrdinalFromDate(new Date(Math.min(...lineDates.map((d) => d.getTime()))));
  }

  const raw = order.order_week ? String(order.order_week) : "";
  const m = raw.match(/(\d{4})?\D*W?(\d{1,2})$/i);
  if (m) {
    const year = m[1] ? Number(m[1]) : new Date().getFullYear();
    return year * 100 + Number(m[2]);
  }
  return null;
}

/** Current week as a sortable ordinal. */
export function currentWeekOrdinal(): number {
  return isoOrdinalFromDate(new Date());
}

/** Human label for a week ordinal, e.g. "V34 2026". */
export function weekOrdinalLabel(ord: number): string {
  return `V${ord % 100} ${Math.floor(ord / 100)}`;
}
