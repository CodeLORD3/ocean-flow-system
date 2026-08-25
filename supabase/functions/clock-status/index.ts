/** Vilka som är instämplade just nu på stationen. Aldrig personnummer. */
import { corsHeaders, json, requireStation, service } from "../_shared/clock.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const db = service();
  const ctx = await requireStation(db, req, body);
  if (!ctx) return json(req, { error: "Stationen är inte aktiverad." }, 401);
  const { station, expiresAt } = ctx;

  const since = new Date(Date.now() - 36 * 3600_000).toISOString();
  const { data: entries } = await db
    .from("time_entries")
    .select("employee_id, type, occurred_at, corrects_entry_id")
    .eq("station_id", station.id)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: true });

  const state = new Map<string, { type: string; at: string }>();
  for (const e of entries ?? []) {
    state.set(e.employee_id as string, { type: e.type as string, at: e.occurred_at as string });
  }
  const activeIds = [...state.entries()]
    .filter(([, v]) => v.type === "in" || v.type === "rast_start" || v.type === "rast_slut")
    .map(([id]) => id);

  let people: { first_name: string; initial: string; since: string; on_break: boolean }[] = [];
  if (activeIds.length) {
    const { data: emps } = await db
      .from("employees")
      .select("id, first_name, last_name")
      .in("id", activeIds);
    people = (emps ?? []).map((e) => {
      const s = state.get(e.id as string)!;
      return {
        first_name: (e.first_name as string) ?? "",
        initial: ((e.last_name as string) ?? "").slice(0, 1).toUpperCase(),
        since: s.at,
        on_break: s.type === "rast_start",
      };
    });
  }

  return json(req, {
    station: { id: station.id, name: station.name },
    on_site: people.sort((a, b) => a.first_name.localeCompare(b.first_name, "sv")),
    expires_at: expiresAt,
  });
});
