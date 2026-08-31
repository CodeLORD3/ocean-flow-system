import type { DailyReport } from "@/hooks/useDailyReport";

export type ReportDay = {
  date: string;
  weekday: string;
  gross_sales: number | null;
  net_sales: number | null;
  receipt_count: number | null;
  staff_hours: number;
  staff_shifts: number;
  comment?: string | null;
};

function addDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0"))
    .join("-");
}

function hours(entries: DailyReport["staff_entries"]) {
  return (entries ?? []).reduce((sum, entry) => {
    const [startHour, startMinute] = String(entry.start ?? "").split(":").map(Number);
    const [endHour, endMinute] = String(entry.end ?? "").split(":").map(Number);
    if ([startHour, startMinute, endHour, endMinute].some(Number.isNaN)) return sum;
    let minutes = endHour * 60 + endMinute - startHour * 60 - startMinute;
    if (minutes < 0) minutes += 1440;
    return sum + minutes / 60;
  }, 0);
}

export function weekDayList(from: string, to: string) {
  const days: string[] = [];
  let current = from;
  while (current <= to) {
    days.push(current);
    current = addDay(current);
  }
  return days;
}

export function dayRowsFrom(days: string[], reports: DailyReport[]): ReportDay[] {
  const byDate = new Map(reports.map((report) => [report.report_date, report]));
  return days.map((date) => {
    const report = byDate.get(date);
    const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("sv-SE", { weekday: "short" });
    return {
      date,
      weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
      gross_sales: report?.gross_sales ?? null,
      net_sales: report?.net_sales ?? null,
      receipt_count: report?.receipt_count ?? null,
      staff_hours: report ? hours(report.staff_entries) : 0,
      staff_shifts: report?.staff_entries?.length ?? 0,
      comment: report?.comment ?? null,
    };
  });
}
