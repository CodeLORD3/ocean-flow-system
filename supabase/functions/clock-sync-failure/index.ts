import { requireStation, corsHeaders, json, service, normalizePnr, pnrHash } from "../_shared/clock.ts";

/**
 * Stationens felkö.
 * - mode saknas / "record": lägg en offlinepost som inte kunde synkas i felkön (krypterad identifierare).
 * - mode "list": stationen hämtar sina egna öppna fel för att kunna dekryptera dem lokalt
 *   (nyckeln finns bara i enheten).
 * - mode "restore": enheten skickar den dekrypterade identifieraren för ett fel. Servern knyter
 *   den till anställd och skapar stämplingen med ursprunglig tid på butikens driftställe.
 *   Historiska poster går inte via vanliga stämpelregler (de gäller "nu"); dubbletter stoppas
 *   av client_punch_id = felets id. PK-importen körs sedan om så att regel om konflikt/matchning gäller.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const db = service();
  const ctx = await requireStation(db, req, body);
  if (!ctx) return json(req, { error: "Stationens session har gått ut." }, 401);
  const mode = String(body.mode ?? "record");

  if (mode === "list") {
    const { data, error } = await db
      .from("clock_sync_failures")
      .select("id, identifier_cipher, identifier_iv, punch_type, occurred_at")
      .eq("station_id", ctx.station.id)
      .eq("status", "open")
      .not("identifier_cipher", "is", null)
      .order("occurred_at")
      .limit(200);
    if (error) return json(req, { error: "Kunde inte läsa felkön." }, 500);
    return json(req, { failures: data ?? [] });
  }

  if (mode === "restore") {
    const id = String(body.id ?? "");
    const identifier = String(body.identifier ?? "").trim();
    const { data: f } = await db
      .from("clock_sync_failures")
      .select("id, station_id, store_id, legal_entity_id, punch_type, occurred_at, status")
      .eq("id", id)
      .maybeSingle();
    if (!f || f.station_id !== ctx.station.id) return json(req, { error: "Felet tillhör inte stationen." }, 404);
    if (f.status !== "open") return json(req, { ok: true, already: true });
    const pnr = normalizePnr(identifier);
    let emp: { id: string; is_test: boolean | null } | null = null;
    if (pnr) {
      const { data } = await db.from("employees").select("id, is_test").eq("pnr_hash", await pnrHash(pnr)).maybeSingle();
      emp = data ?? null;
    }
    if (!emp && identifier) {
      const { data } = await db.from("employees").select("id, is_test").eq("alt_clock_identifier", identifier).maybeSingle();
      emp = data ?? null;
    }
    if (!emp) {
      await db.from("clock_sync_failures").update({ resolution_note: "Dekrypterad på enheten men ingen anställd matchar identifieraren", updated_at: new Date().toISOString() }).eq("id", id);
      return json(req, { ok: false, reason: "ingen_anstalld" });
    }
    if (emp.is_test) {
      await db.from("clock_sync_failures").update({ status: "registered", resolution_note: "Testperson – ingen stämpling skapad", handled_at: new Date().toISOString() }).eq("id", id);
      return json(req, { ok: true, test: true });
    }
    const { data: sites } = await db.from("work_sites").select("id, cost_center").eq("store_id", f.store_id).eq("is_active", true).order("sort_order").limit(1);
    const site = sites?.[0] ?? null;
    const { data: entry, error } = await db
      .from("time_entries")
      .upsert({
        employee_id: emp.id,
        station_id: f.station_id,
        store_id: f.store_id,
        work_site_id: site?.id ?? null,
        cost_center: site?.cost_center ?? null,
        type: f.punch_type,
        occurred_at: f.occurred_at,
        registered_at: new Date().toISOString(),
        source: "clock",
        offline_queued: true,
        client_punch_id: f.id,
        note: "Återställd från synkfel (driftställe rättat till butikens)",
      }, { onConflict: "employee_id,client_punch_id", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (error) return json(req, { error: error.message }, 500);
    let entryId = entry?.id as string | undefined;
    if (!entryId) {
      const { data: ex } = await db.from("time_entries").select("id").eq("employee_id", emp.id).eq("client_punch_id", f.id).maybeSingle();
      entryId = ex?.id;
    }
    await db.from("clock_sync_failures").update({
      status: "registered", resolved_entry_id: entryId ?? null, handled_at: new Date().toISOString(),
      resolution_note: "Dekrypterad på stationen och återskapad på butikens driftställe", updated_at: new Date().toISOString(),
    }).eq("id", id);
    await db.rpc("pk_import_run", {});
    return json(req, { ok: true, entry_id: entryId });
  }

  const payload = {
    station_id: ctx.station.id,
    store_id: ctx.station.store_id,
    legal_entity_id: ctx.station.legal_entity_id,
    identifier_masked: typeof body.identifier_masked === "string" ? body.identifier_masked.slice(0, 80) : "Offlinepost",
    identifier_cipher: typeof body.identifier_cipher === "string" ? body.identifier_cipher.slice(0, 20000) : null,
    identifier_iv: typeof body.identifier_iv === "string" ? body.identifier_iv.slice(0, 500) : null,
    punch_type: String(body.action ?? ""),
    occurred_at: String(body.occurred_at ?? new Date().toISOString()),
    queued_at: body.queued_at ? String(body.queued_at) : new Date().toISOString(),
    work_site_id: typeof body.work_site_id === "string" ? body.work_site_id : null,
    cost_center: typeof body.cost_center === "string" ? body.cost_center.slice(0, 30) : null,
    reason: String(body.reason ?? "Offlinepost kunde inte synkroniseras").slice(0, 500),
    attempts: Number.isFinite(Number(body.attempts)) ? Math.max(1, Number(body.attempts)) : 1,
    status: "open",
  };
  if (!(["in", "ut", "rast_start", "rast_slut"] as string[]).includes(payload.punch_type)) {
    return json(req, { error: "Ogiltig stämplingstyp." }, 400);
  }
  const { error } = await db.from("clock_sync_failures").insert(payload);
  if (error) return json(req, { error: "Kunde inte registrera synkroniseringsfelet." }, 500);
  return json(req, { ok: true });
});
