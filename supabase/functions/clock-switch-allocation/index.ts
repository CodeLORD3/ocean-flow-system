import { corsHeaders, json, normalizePnr, pnrHash, requireStation, service } from "../_shared/clock.ts";

type WorkSite = { id: string; name: string; posting_cost_center: string; store_id: string | null; legal_entity_id: string | null };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const db = service();
  const ctx = await requireStation(db, req, body);
  if (!ctx) return json(req, { error: "Stationens session har gått ut." }, 401);

  const identifier = String(body.identifier ?? "").trim();
  const workSiteId = String(body.work_site_id ?? "");
  if (!identifier || !workSiteId) return json(req, { error: "Person och nytt kostnadsställe krävs." }, 400);

  const pnr = normalizePnr(identifier);
  let employee: { id: string; first_name: string } | null = null;
  if (pnr) {
    const hash = await pnrHash(pnr);
    const { data } = await db.from("employees").select("id, first_name, is_active").eq("pnr_hash", hash).eq("is_active", true).maybeSingle();
    employee = data as typeof employee;
  }
  if (!employee) {
    const { data } = await db.from("employees").select("id, first_name, is_active").eq("alt_clock_identifier", identifier).eq("is_active", true).maybeSingle();
    employee = data as typeof employee;
  }
  if (!employee) return json(req, { error: "Personen kunde inte hittas." }, 404);

  const { data: site } = await db.from("work_sites")
    .select("id, name, posting_cost_center, store_id, legal_entity_id")
    .eq("id", workSiteId).eq("is_active", true).maybeSingle();
  const workSite = site as WorkSite | null;
  if (!workSite) return json(req, { error: "Driftstället är inte aktivt." }, 400);
  if (ctx.station.store_id && workSite.store_id !== ctx.station.store_id) return json(req, { error: "Driftstället tillhör en annan butik." }, 403);

  const now = new Date().toISOString();
  const { data: current } = await db.from("time_allocations")
    .select("id, work_site_id, cost_center, started_at")
    .eq("employee_id", employee.id).is("ended_at", null)
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!current) return json(req, { error: "Ingen pågående kostnadsställevistelse hittades." }, 409);
  if (current.work_site_id === workSite.id) return json(req, { error: "Personen är redan på detta kostnadsställe." }, 409);

  const { error: closeError } = await db.from("time_allocations").update({ ended_at: now }).eq("id", current.id);
  if (closeError) return json(req, { error: "Kunde inte avsluta föregående kostnadsställe." }, 500);
  const { data: next, error: openError } = await db.from("time_allocations").insert({
    employee_id: employee.id,
    work_site_id: workSite.id,
    cost_center: workSite.posting_cost_center,
    legal_entity_id: workSite.legal_entity_id ?? ctx.station.legal_entity_id,
    store_id: workSite.store_id ?? ctx.station.store_id,
    started_at: now,
    corrects_allocation_id: current.id,
    correction_reason: "Kostnadsställebyte i stämpelklockan",
  }).select("id, work_site_id, cost_center, started_at").single();
  if (openError) return json(req, { error: "Kunde inte öppna det nya kostnadsstället." }, 500);
  return json(req, { ok: true, employee: { first_name: employee.first_name }, allocation: next });
});
