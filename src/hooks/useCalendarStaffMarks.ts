import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Frånvaro (absence_requests) och Ej tillgänglig (availability) per datum,
 * för visning i kalendern. Endast läsning — registreras i schemat.
 */
export type CalendarStaffMark = {
  key: string;
  kind: "absence" | "unavailable";
  name: string;
  label: string;
  note: string | null;
  pending: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");
const key = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function useCalendarStaffMarks(year: number, storeId: string | null) {
  return useQuery({
    queryKey: ["calendar-staff-marks", year, storeId],
    queryFn: async () => {
      const from = `${year}-01-01`;
      const to = `${year}-12-31`;
      let absQ = supabase
        .from("absence_requests")
        .select("id, employee_id, absence_type_id, start_date, end_date, date_from, date_to, extent_pct, note, status, store_id")
        .in("status", ["pending", "approved", "auto_approved"])
        .lte("start_date", to)
        .or(`end_date.gte.${from},end_date.is.null`)
        .range(0, 999);
      if (storeId) absQ = absQ.eq("store_id", storeId);
      const [abs, types, avail] = await Promise.all([
        absQ,
        supabase.from("absence_types").select("id, name, is_sick"),
        supabase
          .from("availability")
          .select("id, employee_id, weekday, date, from_time, to_time, note")
          .eq("type", "otillganglig")
          .range(0, 999),
      ]);
      if (abs.error) throw abs.error;
      if (avail.error) throw avail.error;

      let allowed: Set<string> | null = null;
      if (storeId) {
        const { data } = await supabase.from("employments").select("employee_id").eq("store_id", storeId).eq("is_active", true);
        allowed = new Set((data ?? []).map((r: any) => r.employee_id));
        (abs.data ?? []).forEach((r: any) => allowed!.add(r.employee_id));
      }

      const ids = Array.from(
        new Set([...(abs.data ?? []).map((r: any) => r.employee_id), ...(avail.data ?? []).map((r: any) => r.employee_id)]),
      );
      const names = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await supabase.from("employees").select("id, first_name, last_name").in("id", ids.slice(i, i + 200));
        (data ?? []).forEach((e: any) => names.set(e.id, `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim()));
      }
      const typeById = new Map((types.data ?? []).map((t: any) => [t.id, t]));
      const map = new Map<string, CalendarStaffMark[]>();
      const push = (d: string, m: CalendarStaffMark) => map.set(d, [...(map.get(d) ?? []), m]);
      const today = key(new Date());

      (abs.data ?? []).forEach((r: any) => {
        const type: any = typeById.get(r.absence_type_id);
        const start = r.date_from ?? r.start_date;
        const end = r.date_to ?? r.end_date ?? (type?.is_sick ? (today > start ? today : start) : start);
        const cur = new Date(`${start > from ? start : from}T12:00:00`);
        const stop = new Date(`${end < to ? end : to}T12:00:00`);
        const pct = Number(r.extent_pct ?? 100);
        while (cur <= stop) {
          push(key(cur), {
            key: `abs:${r.id}:${key(cur)}`,
            kind: "absence",
            name: names.get(r.employee_id) ?? "Okänd",
            label: `${type?.name ?? "Frånvaro"}${pct < 100 ? ` ${pct} %` : ""}`,
            note: r.note ?? null,
            pending: r.status === "pending",
          });
          cur.setDate(cur.getDate() + 1);
        }
      });

      (avail.data ?? [])
        .filter((a: any) => !allowed || allowed.has(a.employee_id))
        .forEach((a: any) => {
          const whole = a.from_time.slice(0, 5) <= "00:00" && a.to_time.slice(0, 5) >= "23:59";
          const label = whole ? "Ej tillgänglig" : `Ej tillgänglig ${a.from_time.slice(0, 5)}–${a.to_time.slice(0, 5)}`;
          const mk = (d: string) =>
            push(d, { key: `ua:${a.id}:${d}`, kind: "unavailable", name: names.get(a.employee_id) ?? "Okänd", label, note: a.note ?? null, pending: false });
          if (a.date) {
            if (a.date >= from && a.date <= to) mk(a.date);
          } else if (a.weekday != null) {
            const cur = new Date(`${from}T12:00:00`);
            while (cur.getFullYear() === year) {
              if (cur.getDay() === a.weekday % 7) mk(key(cur));
              cur.setDate(cur.getDate() + 1);
            }
          }
        });
      return map;
    },
  });
}
