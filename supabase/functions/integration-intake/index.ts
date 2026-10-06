// POST /integration-intake — enda dörren in för externa kopplingar (n8n, formulär, Telegram).
// Kräver X-CF-Secret = CF_INTAKE_SECRET. Dubblettskydd via kall_id. Bokför ingenting.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const cors = { ...corsHeaders, "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"]}, x-cf-secret` };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const Body = z.object({
  kall_id: z.string().trim().min(1).max(200),
  kalla: z.enum(["n8n", "formular", "telegram", "annat"]),
  action: z.enum(["svinn", "avvikelse", "lage"]),
  data: z.record(z.unknown()).default({}),
  butik: z.string().trim().min(1).max(100),
  av: z.string().trim().max(120).optional().nullable(),
});

const SvinnData = z.object({
  produkt_id: z.string().uuid().optional(),
  ean: z.string().trim().max(40).optional(),
  produkt: z.string().trim().max(200).optional(),
  mangd_kg: z.coerce.number().positive().max(10000),
  orsak: z.string().trim().min(1).max(100),
  kommentar: z.string().trim().max(500).optional(),
});
const AvvikelseData = z.object({
  text: z.string().trim().min(1).max(4000),
  kategori: z.string().trim().max(100).optional(),
  bild_url: z.string().url().max(1000).optional(),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PNR = /\b(19|20)?\d{6}[-+]?\d{4}\b/g;
const clean = (s: string) => s.replace(PNR, "[borttaget]");

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

function summarize(action: string, d: Record<string, unknown>): string {
  const pick = (k: string) => (d[k] == null ? null : `${k}=${String(d[k]).slice(0, 80)}`);
  const keys = action === "svinn"
    ? ["produkt_id", "ean", "produkt", "mangd_kg", "orsak"]
    : action === "avvikelse" ? ["kategori", "text"] : [];
  return clean(keys.map(pick).filter(Boolean).join("; ")).slice(0, 300);
}

const stockholmDay = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const t0 = Date.now();
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const log = (row: Record<string, unknown>) =>
    db.from("integration_log").insert({ ...row, duration_ms: Date.now() - t0 }).select("id").single();

  const secret = Deno.env.get("CF_INTAKE_SECRET") ?? "";
  const given = req.headers.get("x-cf-secret") ?? "";
  if (!secret || !given || !safeEqual(given, secret)) {
    await log({ result: "fel", error: "401 fel eller saknad X-CF-Secret" });
    return json({ status: "fel", error: "Obehörig" }, 401);
  }
  if (req.method !== "POST") {
    await log({ result: "fel", error: "Endast POST" });
    return json({ status: "fel", error: "Endast POST" }, 405);
  }

  let raw: unknown;
  try { raw = await req.json(); } catch { raw = null; }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    const r = raw as any;
    await log({
      result: "fel", error: "Ogiltig kropp",
      kalla: typeof r?.kalla === "string" ? r.kalla.slice(0, 40) : null,
      action: typeof r?.action === "string" ? r.action.slice(0, 40) : null,
    });
    return json({ status: "fel", error: parsed.error.flatten().fieldErrors }, 400);
  }
  const b = parsed.data;
  const base = {
    kalla: b.kalla, action: b.action, butik: b.butik.slice(0, 100),
    av: b.av ? clean(b.av).slice(0, 120) : null,
    data_sammanfattning: summarize(b.action, b.data) || null,
  };

  // Dubblettskydd: finns kall_id redan, svara samma sak igen utan att göra om något.
  const prior = async () => {
    const { data } = await db.from("integration_log").select("svar, result")
      .eq("kall_id", b.kall_id).neq("result", "dubblett").maybeSingle();
    return data;
  };
  const replay = async (p: any) => {
    await log({ ...base, kall_id: b.kall_id, result: "dubblett" });
    return json({ ...(p.svar ?? { status: p.result }), dubblett: true });
  };
  const existing = await prior();
  if (existing) return replay(existing);

  // Gör anspråk på kall_id innan något skrivs, så samtidiga anrop inte dubblar.
  const claim = await db.from("integration_log")
    .insert({ ...base, kall_id: b.kall_id, result: "fel", error: "pågår" }).select("id").single();
  if (claim.error) {
    const p = await prior();
    if (p) return replay(p);
    return json({ status: "fel", error: "Kunde inte logga anropet" }, 500);
  }
  const logId = claim.data.id;
  const finish = async (status: "ok" | "granskning" | "fel", svar: Record<string, unknown>, error?: string, http = 200) => {
    const full = { status, ...svar };
    await db.from("integration_log").update({
      result: status, error: error ?? null, svar: full, duration_ms: Date.now() - t0,
    }).eq("id", logId);
    return json(full, http);
  };

  try {
    // Butik via id eller butikskod.
    const sq = db.from("stores").select("id, name, store_code, inventory_location_id, currency");
    const { data: store } = await (UUID.test(b.butik) ? sq.eq("id", b.butik) : sq.ilike("store_code", b.butik)).maybeSingle();
    if (!store) return await finish("fel", { error: "Okänd butik" }, "Okänd butik", 422);

    if (b.action === "lage") {
      const day = stockholmDay();
      const { data: rep } = await db.from("daily_reports")
        .select("gross_sales, pos_gross_sales, currency").eq("store_id", store.id).eq("report_date", day).maybeSingle();
      const { data: locs } = await db.from("storage_locations").select("id").eq("store_id", store.id);
      const locIds = (locs ?? []).map((l: any) => l.id);
      const { count: neg } = locIds.length
        ? await db.from("stock_negative_flags").select("id", { count: "exact", head: true })
          .is("acknowledged_at", null).in("location_id", locIds)
        : { count: 0 };
      const { count: dev } = await db.from("deviations").select("id", { count: "exact", head: true })
        .eq("store_id", store.id).is("closed_at", null);
      const since = new Date(Date.now() - 18 * 3600_000).toISOString();
      const { data: te } = await db.from("time_entries")
        .select("id, employee_id, type, occurred_at, corrects_entry_id")
        .eq("store_id", store.id).gte("occurred_at", since).order("occurred_at", { ascending: true });
      const corrected = new Set((te ?? []).map((e: any) => e.corrects_entry_id).filter(Boolean));
      const last = new Map<string, string>();
      for (const e of te ?? []) {
        if (e.corrects_entry_id || corrected.has(e.id)) continue;
        last.set(e.employee_id, e.type);
      }
      const inside = [...last.values()].filter((t) => t !== "ut").length;
      const sales = rep ? Number(rep.pos_gross_sales ?? rep.gross_sales ?? 0) : null;
      return await finish("ok", {
        butik: store.name, datum: day,
        forsaljning_idag: sales, valuta: rep?.currency ?? store.currency ?? null,
        negativa_saldon_okvitterade: neg ?? 0,
        oppna_avvikelser: dev ?? 0,
        instamplade_nu: inside,
      });
    }

    if (b.action === "avvikelse") {
      const d = AvvikelseData.safeParse(b.data);
      if (!d.success) return await finish("fel", { error: d.error.flatten().fieldErrors }, "Ogiltig avvikelsedata", 400);
      const desc = d.data.text + (d.data.bild_url ? `\nBild: ${d.data.bild_url}` : "") +
        `\n(Inskickad via ${b.kalla}${base.av ? ` av ${base.av}` : ""})`;
      const { data: dev, error } = await db.from("deviations").insert({
        source: "integration", source_id: b.kall_id,
        title: d.data.kategori ?? "Avvikelse", description: desc, store_id: store.id,
      }).select("id").single();
      if (error) throw error;
      await db.from("notifications").insert(["shop", "admin"].map((portal) => ({
        portal, target_page: "/food-safety", store_id: store.id,
        message: `Ny avvikelse i ${store.name}: ${(d.data.kategori ?? d.data.text).slice(0, 80)}`,
        entity_type: "deviation", entity_id: dev.id,
      })));
      return await finish("ok", { avvikelse_id: dev.id, butik: store.name });
    }

    // svinn
    const d = SvinnData.safeParse(b.data);
    if (!d.success) return await finish("fel", { error: d.error.flatten().fieldErrors }, "Ogiltig svinndata", 400);
    const qty = Math.round(d.data.mangd_kg * 10) / 10;
    if (qty <= 0) return await finish("fel", { error: "Mängd måste vara minst 0,1 kg" }, "Mängd för liten", 400);

    let product: any = null;
    if (d.data.produkt_id) {
      ({ data: product } = await db.from("products").select("id, name").eq("id", d.data.produkt_id).maybeSingle());
    } else if (d.data.ean) {
      const { data } = await db.from("products").select("id, name").eq("barcode", d.data.ean).limit(2);
      if (data?.length === 1) product = data[0];
    } else if (d.data.produkt) {
      const { data } = await db.from("products").select("id, name").ilike("name", d.data.produkt).eq("active", true).limit(2);
      if (data?.length === 1) product = data[0];
    }
    if (!product) {
      return await finish("granskning", {
        orsak: "Varan kunde inte identifieras entydigt", butik: store.name,
        sokt: { produkt_id: d.data.produkt_id ?? null, ean: d.data.ean ?? null, produkt: d.data.produkt ?? null },
        mangd_kg: qty, svinnorsak: d.data.orsak, kommentar: d.data.kommentar ?? null,
      });
    }

    const { data: locs } = await db.from("storage_locations").select("id").eq("store_id", store.id);
    const locIds = (locs ?? []).map((l: any) => l.id);
    const { data: bal } = locIds.length
      ? await db.from("product_stock_locations").select("location_id, quantity, avg_cost, unit_cost")
        .eq("product_id", product.id).in("location_id", locIds).gt("quantity", 0)
        .order("quantity", { ascending: false }).limit(1)
      : { data: [] as any[] };
    const row = bal?.[0];
    if (!row) {
      return await finish("granskning", {
        orsak: "Varan saknar saldo i butiken", butik: store.name, produkt: product.name,
        mangd_kg: qty, svinnorsak: d.data.orsak, kommentar: d.data.kommentar ?? null,
      });
    }
    const cost = Number(row.avg_cost ?? row.unit_cost ?? 0) || null;
    const note = clean(`${d.data.orsak}${d.data.kommentar ? ` · ${d.data.kommentar}` : ""} · via ${b.kalla}${base.av ? ` av ${base.av}` : ""}`).slice(0, 500);
    const { data: mv, error } = await db.from("stock_movements").insert({
      product_id: product.id, location_id: row.location_id, movement_type: "svinn",
      quantity_kg: -qty, unit_cost: cost, reference_type: "svinn", note,
    }).select("id").single();
    if (error) throw error;
    return await finish("ok", {
      lagerrorelse_id: mv.id, butik: store.name, produkt: product.name, mangd_kg: qty,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("integration-intake", msg);
    return await finish("fel", { error: "Internt fel" }, msg.slice(0, 300), 500);
  }
});
