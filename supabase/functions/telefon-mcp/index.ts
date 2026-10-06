/**
 * telefon-mcp — smal MCP-server för VD:s AI-telefonist (Lynes).
 *
 * Adress: /functions/v1/telefon-mcp/<nyckel>  (MCP, Streamable HTTP, tillståndslös)
 * Reserv: /functions/v1/telefon-mcp/<nyckel>/samtal (ren REST)
 *
 * Säkerhet: allt som kommer in är opålitlig text från okända uppringare.
 * Det sparas, visas och skickas (vid koppling) som sms till VD — inget annat.
 * Funktionen returnerar aldrig databasinnehåll, id eller fel från Postgres.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendSms, normalizePhoneSe } from "../_shared/sms.ts";

const GRANS_10MIN = 60;
const GRANS_DYGN = 1500;
const SMS_GRANS_DYGN = 200;

const KATEGORIER = ["kund", "personal", "leverantor", "saljare", "myndighet", "bank_revisor_jurist", "privat", "ovrigt"] as const;
const ATGARDER = ["koppla", "meddelande", "hanvisad", "avbojd"] as const;

const TOOL = {
  name: "registrera_samtal",
  description:
    "Registrerar ett inkommande samtal till Baldvin Ahlander. Anropa en gång per samtal, innan du kopplar samtalet eller avslutar det. Vid atgard koppla får Baldvin ett sms med namn och ärende. Returnerar bara en kvittens.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["namn", "arende", "kategori", "atgard"],
    properties: {
      namn: { type: "string", maxLength: 120, description: "Uppringarens namn så som personen sa det. Skriv ej uppgett om personen inte ville säga det." },
      foretag: { type: "string", maxLength: 120, description: "Företag eller organisation, om uppringaren nämnde det." },
      telefon: { type: "string", maxLength: 30, description: "Numret personen vill bli uppringd på, uppläst och bekräftat av uppringaren. Krävs när atgard är meddelande." },
      arende: { type: "string", maxLength: 600, description: "Vad samtalet gäller, en eller två meningar med uppringarens egna ord. Inga egna tolkningar eller löften." },
      kategori: { type: "string", enum: [...KATEGORIER], description: "Vem uppringaren är i förhållande till Fiskskaldjur." },
      atgard: { type: "string", enum: [...ATGARDER], description: "Vad du gör med samtalet: koppla till Baldvin, ta meddelande, hänvisa till annan, eller avböja (säljare)." },
      bradskande: { type: "boolean", description: "true endast om uppringaren själv säger att det är brådskande." },
      basta_tid: { type: "string", maxLength: 120, description: "När personen helst vill bli uppringd, om det nämndes." },
    },
  },
};

const ALLOWED = new Set(Object.keys(TOOL.inputSchema.properties));

let _db: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!_db) {
    _db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _db;
}

const plain = (status: number) => new Response(null, { status });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function logg(utfall: "sparad" | "dubblett" | "avvisad", orsak: string) {
  try { await db().from("telefon_logg").insert({ utfall, orsak: orsak.slice(0, 120) }); } catch { /* loggning får aldrig stoppa */ }
}

/** Trimma, ta bort styrtecken/radbrytningar, kapa. */
function clean(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return null;
  // deno-lint-ignore no-control-regex
  const s = v.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max).trim();
  return s || null;
}

type Fields = {
  namn: string; foretag: string | null; telefon: string | null; arende: string;
  kategori: string; atgard: string; bradskande: boolean; basta_tid: string | null;
};

function validate(raw: unknown): { ok: true; f: Fields } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "argument saknas" };
  const a = raw as Record<string, unknown>;
  const okand = Object.keys(a).find((k) => !ALLOWED.has(k));
  if (okand) return { ok: false, error: `okänt fält: ${okand.slice(0, 40)}` };
  const namn = clean(a.namn, 120);
  if (!namn) return { ok: false, error: "namn saknas" };
  const arende = clean(a.arende, 600);
  if (!arende) return { ok: false, error: "arende saknas" };
  const kategori = clean(a.kategori, 40);
  if (!kategori) return { ok: false, error: "kategori saknas" };
  if (!(KATEGORIER as readonly string[]).includes(kategori)) return { ok: false, error: "okänd kategori" };
  const atgard = clean(a.atgard, 40);
  if (!atgard) return { ok: false, error: "atgard saknas" };
  if (!(ATGARDER as readonly string[]).includes(atgard)) return { ok: false, error: "okänd atgard" };
  const telefon = clean(a.telefon, 30);
  if (atgard === "meddelande" && !telefon) return { ok: false, error: "telefon saknas för meddelande" };
  if (a.bradskande !== undefined && typeof a.bradskande !== "boolean") return { ok: false, error: "bradskande ska vara true eller false" };
  return {
    ok: true,
    f: { namn, foretag: clean(a.foretag, 120), telefon, arende, kategori, atgard, bradskande: a.bradskande === true, basta_tid: clean(a.basta_tid, 120) },
  };
}

const kvittens = (atgard: string) =>
  atgard === "koppla" ? "Registrerat. Koppla samtalet nu." : atgard === "meddelande" ? "Meddelandet är sparat." : "Registrerat.";

type Utfall = { ok: true; text: string } | { ok: false; text: string };

async function registrera(raw: unknown): Promise<Utfall> {
  const v = validate(raw);
  if (!v.ok) { await logg("avvisad", `validering: ${v.error}`); return { ok: false, text: v.error }; }
  const f = v.f;
  const d = db();
  const now = Date.now();
  const [dup, c10, c24, inst] = await Promise.all([
    d.from("telefonsamtal").select("id").eq("namn", f.namn).eq("arende", f.arende).eq("atgard", f.atgard)
      .gte("skapad", new Date(now - 2 * 60_000).toISOString()).limit(1),
    d.from("telefonsamtal").select("id", { count: "exact", head: true }).gte("skapad", new Date(now - 10 * 60_000).toISOString()),
    d.from("telefonsamtal").select("id", { count: "exact", head: true }).gte("skapad", new Date(now - 24 * 3600_000).toISOString()),
    d.from("telefon_installningar").select("vd_sms_nummer, sms_vid_koppling").limit(1).maybeSingle(),
  ]);
  if (dup.error || c10.error || c24.error) { await logg("avvisad", "databasfel"); return { ok: false, text: "Kan inte registrera samtalet just nu." }; }
  if ((dup.data ?? []).length > 0) { await logg("dubblett", "samma samtal inom 2 min"); return { ok: true, text: kvittens(f.atgard) }; }
  if ((c10.count ?? 0) >= GRANS_10MIN || (c24.count ?? 0) >= GRANS_DYGN) {
    await logg("avvisad", (c10.count ?? 0) >= GRANS_10MIN ? "spärr 10 min" : "spärr dygn");
    return { ok: false, text: "Kan inte registrera fler samtal just nu." };
  }

  const vdNr = normalizePhoneSe(inst.data?.vd_sms_nummer ?? "");
  const skaSms = f.atgard === "koppla" && inst.data?.sms_vid_koppling === true && !!vdNr;
  const ins = await d.from("telefonsamtal").insert({
    ...f, status: "ny", sms_status: f.atgard === "koppla" ? (skaSms ? null : "ej_aktuellt") : null,
  }).select("id").single();
  if (ins.error) { await logg("avvisad", "databasfel vid sparning"); return { ok: false, text: "Kan inte registrera samtalet just nu." }; }
  await logg("sparad", f.atgard);

  if (skaSms) {
    const id = ins.data.id as number;
    const task = (async () => {
      let status = "fel";
      try {
        const { count } = await d.from("sms_log").select("id", { count: "exact", head: true })
          .eq("type", "telefonist").gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString());
        if ((count ?? 0) >= SMS_GRANS_DYGN) {
          status = "fel";
        } else {
          const text = `Samtal kopplas: ${f.namn}${f.foretag ? `, ${f.foretag}` : ""}. Gäller: ${f.arende}`.slice(0, 300);
          const r = await sendSms(d, { phone: vdNr!, type: "telefonist", text });
          status = r.ok ? (r.testMode ? "testlage" : "skickad") : "fel";
        }
      } catch { status = "fel"; }
      await d.from("telefonsamtal").update({ sms_status: status }).eq("id", id);
    })();
    // deno-lint-ignore no-explicit-any
    const er = (globalThis as any).EdgeRuntime;
    if (er?.waitUntil) er.waitUntil(task); else task.catch(() => {});
  }
  return { ok: true, text: kvittens(f.atgard) };
}

// ---------- JSON-RPC ----------
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function handleRpc(m: Rpc): Promise<unknown | null> {
  const isNotification = m.id === undefined || m.id === null;
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
  const err = (code: number, message: string) => ({ jsonrpc: "2.0", id: m.id ?? null, error: { code, message } });
  if (!m || typeof m !== "object" || typeof m.method !== "string") return err(-32600, "Invalid Request");
  switch (m.method) {
    case "initialize": {
      const pv = typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : "2025-06-18";
      return reply({ protocolVersion: pv, capabilities: { tools: {} }, serverInfo: { name: "fiskskaldjur-telefon", version: "1.0.0" } });
    }
    case "ping": return isNotification ? null : reply({});
    case "tools/list": return reply({ tools: [TOOL] });
    case "tools/call": {
      if (m.params?.name !== "registrera_samtal") return err(-32602, "Okänt verktyg");
      const r = await registrera(m.params?.arguments);
      return reply({ content: [{ type: "text", text: r.text }], isError: !r.ok });
    }
    default:
      if (m.method.startsWith("notifications/")) return null;
      return isNotification ? null : err(-32601, "Method not found");
  }
}

async function verifyKey(key: string | undefined): Promise<boolean> {
  if (!key || key.length < 32 || key.length > 200) return false;
  const hash = await sha256Hex(key);
  const { data, error } = await db().from("telefon_nycklar").select("id").eq("nyckel_hash", hash).eq("aktiv", true).maybeSingle();
  if (error || !data) return false;
  const p = db().from("telefon_nycklar").update({ senast_anvand: new Date().toISOString() }).eq("id", data.id).then(() => {});
  // deno-lint-ignore no-explicit-any
  const er = (globalThis as any).EdgeRuntime;
  if (er?.waitUntil) er.waitUntil(p);
  return true;
}

Deno.serve(async (req) => {
  const parts = new URL(req.url).pathname.split("/").filter(Boolean);
  const i = parts.indexOf("telefon-mcp");
  const key = i >= 0 ? parts[i + 1] : undefined;
  const rest = i >= 0 ? parts.slice(i + 2) : [];

  if (!(await verifyKey(key))) { await logg("avvisad", "fel nyckel"); return plain(404); }
  if (req.method !== "POST") return plain(405);

  let body: unknown;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }

  if (rest.length === 1 && rest[0] === "samtal") {
    const r = await registrera(body);
    return r.ok ? json({ ok: true, meddelande: r.text }) : json({ ok: false, fel: r.text }, 400);
  }
  if (rest.length > 0) return plain(404);

  if (Array.isArray(body)) {
    if (body.length === 0) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
    const out = (await Promise.all(body.map((m) => handleRpc(m as Rpc)))).filter((x) => x !== null);
    return out.length ? json(out) : plain(202);
  }
  const out = await handleRpc(body as Rpc);
  return out === null ? plain(202) : json(out);
});
