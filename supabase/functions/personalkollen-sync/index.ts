/**
 * Personalkollen → Makrill Trade, etapp 1.
 *
 * Read-only synk mot https://personalkollen.se/api/ med headern
 * `Authorization: Token <nyckel>`. En nyckel per bolag (pk_connections.secret_name).
 * Vi skriver aldrig tillbaka till Personalkollen.
 *
 * Anrop:
 *   POST/GET ?resource=logged-times|work-periods|staffs|workplaces|all|sales-check
 *            &full=true            → nollställ cursorn och hämta bakåt i tiden
 *            &connection=<uuid>    → kör bara en connection
 *
 * Defensivt: okända eller saknade fält loggas som varning, aldrig krasch, och
 * hela råsvaret sparas per post (bank- och skattefält strippas ur personal).
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BASE = "https://personalkollen.se/api";

function service(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const warnings: string[] = [];
function warn(msg: string) {
  console.warn(msg);
  if (warnings.length < 50) warnings.push(msg);
}

/* ---------------------------------------------------------------- hjälpare */

type Row = Record<string, unknown>;

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const int = (v: unknown): number | null => {
  const n = num(v);
  return n === null ? null : Math.round(n);
};
const bool = (v: unknown): boolean => v === true || v === "true" || v === 1 || v === "1";
const ts = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const dateOnly = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const timeOnly = (v: unknown): string | null => {
  const s = str(v);
  if (!s) return null;
  const m = s.match(/(\d{2}:\d{2}(:\d{2})?)/);
  return m ? m[1] : null;
};
/** Första fältet som finns — API:et saknar bakåtkompatibilitetsgaranti. */
const pick = (o: Row, ...keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return null;
};

/** costgroup kommer som objekt i vissa svar och som URL-sträng i andra. */
function costGroup(r: Row): { url: string | null; name: string | null } {
  const raw = pick(r, "costgroup", "cost_group");
  if (raw && typeof raw === "object") {
    const o = raw as Row;
    return { url: str(o.url), name: str(o.name) };
  }
  return {
    url: str(raw),
    name: str(pick(r, "costgroup_name", "cost_group_name")),
  };
}


function daysAgoIso(days: number): string {
  const d = new Date(Date.now() - days * 86400_000);
  return d.toISOString().slice(0, 19);
}

/* ------------------------------------------------------- personnummer m.m. */

const SECRET_FIELDS = ["bank_account", "clearing_number", "tax_table", "tax_percent"];

function stripSecrets(raw: Row): Row {
  const out: Row = { ...raw };
  for (const f of SECRET_FIELDS) delete out[f];
  if (Array.isArray(out.employments)) {
    out.employments = (out.employments as Row[]).map((e) => {
      const c: Row = { ...e };
      for (const f of SECRET_FIELDS) delete c[f];
      return c;
    });
  }
  delete out.personal_identification_number;
  delete out.social_security_number;
  return out;
}

function maskPnr(v: string | null): string | null {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 10) return "XXXXXXXX-XXXX";
  const long = digits.length >= 12 ? digits.slice(0, 8) : `19${digits.slice(0, 6)}`;
  return `${long}-XXXX`;
}

let cryptoKey: CryptoKey | null = null;
async function keyForPnr(): Promise<CryptoKey | null> {
  const secret = Deno.env.get("PK_PNR_KEY");
  if (!secret) {
    warn("PK_PNR_KEY saknas — personnummer lagras inte");
    return null;
  }
  if (cryptoKey) return cryptoKey;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  cryptoKey = await crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt"]);
  return cryptoKey;
}

/** AES-GCM, base64(iv):base64(ciphertext). Läses bara av personalkollen-reveal. */
async function encryptPnr(value: string | null): Promise<string | null> {
  if (!value) return null;
  const key = await keyForPnr();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value),
  );
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  return `${b64(iv)}:${b64(new Uint8Array(buf))}`;
}

/* --------------------------------------------------------------- API-klient */

type Page = { results: Row[]; next: string | null; cursor: string | null };

class PkClient {
  constructor(private token: string) {}

  async get(url: string): Promise<Page> {
    const res = await fetch(url, {
      headers: { Authorization: `Token ${this.token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`[${res.status}] ${url} ${body.slice(0, 300)}`);
    }
    const cursor = res.headers.get("Sync-Cursor");
    const body = await res.json().catch(() => null);
    if (!body) throw new Error(`Ogiltigt JSON-svar från ${url}`);
    const results = Array.isArray(body)
      ? (body as Row[])
      : Array.isArray((body as Row).results)
        ? ((body as Row).results as Row[])
        : [];
    if (!Array.isArray(body) && !Array.isArray((body as Row).results)) {
      warn(`Oväntad svarsform från ${url}: ${Object.keys(body as Row).join(",")}`);
    }
    const next = Array.isArray(body) ? null : (str((body as Row).next) ?? null);
    return { results, next, cursor };
  }
}

/* ------------------------------------------------------------- normalisering */

const STORE_NOISE = /(butik|fisk|skaldjur|and|och|ab|&)/g;
function normName(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(STORE_NOISE, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Butiksnyckelord för kostnadsställen i Personalkollen.
 *
 * Mappningen sätts bara på entydiga nyckelord — allt annat lämnas omappat och
 * gulmarkeras i admin så att en människa väljer butik.
 */
const STORE_KEYWORDS: { needle: RegExp; store: string }[] = [
  { needle: /alsten/, store: "Ålstens Fisk" },
  { needle: /kungsholmen/, store: "Fiskskaldjur Kungsholmen" },
  { needle: /torslandatorg|^torg$/, store: "Fiskskaldjur Torslanda Torg" },
  { needle: /amhult/, store: "Fiskskaldjur Amhult" },
  { needle: /saro/, store: "Fiskskaldjur Särö Centrum" },
  { needle: /eriksberg/, store: "Fiskskaldjur Eriksberg" },
  { needle: /marstrand/, store: "Fiskskaldjur Marstrand" },
  // Grossist/lager och export hör till samma enhet.
  { needle: /grossist|export/, store: "Grossist Göteborg" },
];

function matchStoreByName(name: string): string | null {
  const flat = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  const hits = STORE_KEYWORDS.filter((k) => k.needle.test(flat));
  return hits.length === 1 ? hits[0].store : null;
}

/* -------------------------------------------------------------- upsert-lager */

async function upsert(db: SupabaseClient, table: string, rows: Row[], onConflict: string) {
  let done = 0;
  for (let i = 0; i < rows.length; i += 300) {
    const chunk = rows.slice(i, i + 300);
    const { error } = await db.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    done += chunk.length;
  }
  return done;
}

/* ------------------------------------------------------------------ resurser */

type Conn = { id: string; label: string; secret_name: string; legal_entity_id: string | null };

async function syncWorkplaces(db: SupabaseClient, api: PkClient, conn: Conn) {
  let url: string | null = `${BASE}/workplaces/`;
  let pages = 0;
  const seen: string[] = [];
  const rows: Row[] = [];

  const { data: stores } = await db.from("stores").select("id, name, legal_entity_id");
  const { data: existing } = await db
    .from("pk_workplaces")
    .select("url, store_id, store_id_manual")
    .eq("connection_id", conn.id);
  const prior = new Map((existing ?? []).map((r: Row) => [String(r.url), r]));

  while (url) {
    const page = await api.get(url);
    pages++;
    for (const r of page.results) {
      const wpUrl = str(pick(r, "url", "resource_uri"));
      if (!wpUrl) {
        warn("Arbetsplats utan url hoppades över");
        continue;
      }
      seen.push(wpUrl);
      const name = str(pick(r, "description", "name", "title"));
      const before = prior.get(wpUrl);
      let storeId = (before?.store_id as string | null) ?? null;
      const manual = bool(before?.store_id_manual);
      // Automatisk mappning bara första gången, manuell mappning rörs aldrig.
      if (!manual && !storeId && name) {
        const target = normName(name);
        const hits = (stores ?? []).filter((s: Row) => {
          const n = normName(String(s.name ?? ""));
          return n.length > 2 && (n === target || n.includes(target) || target.includes(n));
        });
        if (hits.length === 1) storeId = String(hits[0].id);
      }
      rows.push({
        connection_id: conn.id,
        url: wpUrl,
        short_identifier: int(pick(r, "short_identifier", "shortIdentifier", "identifier")),
        name,
        company_url: str(pick(r, "company", "company_url")),
        store_id: storeId,
        store_id_manual: manual,
        is_missing_since: null,
        raw: r,
        synced_at: new Date().toISOString(),
      });
    }
    url = page.next;
  }

  const upserts = await upsert(db, "pk_workplaces", rows, "connection_id,url");

  // Försvunna arbetsplatser markeras, raderas aldrig.
  if (seen.length) {
    const gone = (existing ?? []).filter((r: Row) => !seen.includes(String(r.url)));
    for (const g of gone) {
      await db
        .from("pk_workplaces")
        .update({ is_missing_since: new Date().toISOString() })
        .eq("connection_id", conn.id)
        .eq("url", String(g.url))
        .is("is_missing_since", null);
    }
  }
  return { pages, upserts, cursor: null as string | null };
}

/**
 * Kostnadsgrupper = butiksnivån i Personalkollen (arbetsplatsen är bolaget).
 *
 * /api/costgroups/ svarar 403 för dessa nycklar, så grupperna härleds ur de
 * nästlade costgroup-objekten i pass och stämplingar. Butiksmappningen sker här;
 * manuell mappning skrivs aldrig över.
 */
async function syncCostgroups(db: SupabaseClient, _api: PkClient, conn: Conn) {
  const rows: Row[] = [];
  const seen = new Map<string, Row>();

  for (const table of ["pk_work_periods", "pk_logged_times"]) {
    const { data } = await db
      .from(table)
      .select("costgroup_url, costgroup_name, workplace_url, raw")
      .eq("connection_id", conn.id)
      .not("costgroup_url", "is", null)
      .limit(5000);
    for (const r of (data ?? []) as Row[]) {
      const url = String(r.costgroup_url);
      if (seen.has(url)) continue;
      const nested = ((r.raw as Row)?.costgroup ?? null) as Row | null;
      seen.set(url, {
        name: str(r.costgroup_name) ?? str(nested?.name),
        workplace_url: str(nested?.workplace) ?? str(r.workplace_url),
        short_identifier: int(nested?.short_identifier),
        raw: nested ?? { url },
      });
    }
  }

  const { data: stores } = await db.from("stores").select("id, name, legal_entity_id, unit_type");
  const { data: existing } = await db
    .from("pk_costgroups")
    .select("url, store_id, store_id_manual")
    .eq("connection_id", conn.id);
  const prior = new Map((existing ?? []).map((r: Row) => [String(r.url), r]));

  const storeId = (needle: string): string | null => {
    const hit = (stores ?? []).find((s: Row) => String(s.name ?? "") === needle);
    return hit ? String(hit.id) : null;
  };

  /** Overhead-enheten i samma bolag som kopplingen — administrationens hemvist. */
  const overheadId = (): string | null => {
    const hit = (stores ?? []).find(
      (s: Row) =>
        String(s.unit_type ?? "") === "overhead" &&
        String(s.legal_entity_id ?? "") === String(conn.legal_entity_id ?? ""),
    );
    return hit ? String(hit.id) : null;
  };

  for (const [url, info] of seen) {
    const before = prior.get(url);
    const manual = bool(before?.store_id_manual);
    const name = str(info.name);
    const companyGroup = !!name && /no\.?1\s*ab/i.test(name);
    const overhead = !!name && /administration|overhead/i.test(name);

    let store = (before?.store_id as string | null) ?? null;
    let confidence = manual ? "manual" : companyGroup ? "company" : "none";

    if (companyGroup) {
      store = null;
    } else if (!manual && overhead) {
      // Administration hör till bolagets overhead-enhet, aldrig till en butik.
      store = overheadId();
      confidence = store ? "sure" : "unsure";
    } else if (!manual) {
      // Nollställs varje synk och sätts bara om nyckelordet är entydigt.
      const match = matchStoreByName(name ?? "");
      store = match ? storeId(match) : null;
      confidence = store ? "sure" : match ? "unsure" : "none";
    }


    rows.push({
      connection_id: conn.id,
      url,
      short_identifier: info.short_identifier ?? null,
      name,
      workplace_url: info.workplace_url ?? null,
      store_id: store,
      store_id_manual: manual,
      is_company_group: companyGroup,
      match_confidence: confidence,
      raw: info.raw ?? null,
      synced_at: new Date().toISOString(),
    });
  }



  const upserts = await upsert(db, "pk_costgroups", rows, "connection_id,url");
  return { pages: 0, upserts, cursor: null as string | null };
}


async function syncStaffs(db: SupabaseClient, api: PkClient, conn: Conn) {
  let url: string | null = `${BASE}/staffs/?with_employments=true`;
  let pages = 0;
  const rows: Row[] = [];
  const employments: Row[] = [];
  const today = new Date().toISOString().slice(0, 10);

  const { data: ourEmployees } = await db.from("employees").select("id, email");
  const byEmail = new Map(
    (ourEmployees ?? [])
      .filter((s: Row) => s.email)
      .map((s: Row) => [String(s.email).toLowerCase().trim(), String(s.id)]),
  );
  const { data: existing } = await db
    .from("pk_staff")
    .select("url, employee_id, employee_id_manual")
    .eq("connection_id", conn.id);
  const prior = new Map((existing ?? []).map((r: Row) => [String(r.url), r]));

  while (url) {
    const page = await api.get(url);
    pages++;
    for (const r of page.results) {
      const sUrl = str(pick(r, "url", "resource_uri"));
      if (!sUrl) {
        warn("Personal utan url hoppades över");
        continue;
      }
      const emps = Array.isArray(r.employments) ? (r.employments as Row[]) : [];
      let active = false;
      for (const e of emps) {
        const start = dateOnly(pick(e, "start", "start_date"));
        if (!start) {
          warn(`Anställning utan start för ${sUrl}`);
          continue;
        }
        const end = dateOnly(pick(e, "end", "end_date"));
        if (!end || end >= today) active = true;
        employments.push({
          connection_id: conn.id,
          staff_url: sUrl,
          start,
          end,
          salary_type: str(pick(e, "salary_type", "salaryType")),
          hourly_salary: num(pick(e, "hourly_salary", "hourlySalary")),
          monthly_salary: num(pick(e, "monthly_salary", "monthlySalary")),
          fixed_cost_per_day: num(pick(e, "fixed_cost_per_day", "fixedCostPerDay")),
          service_grade: num(pick(e, "service_grade", "serviceGrade")),
          raw: (() => {
            const c: Row = { ...e };
            for (const f of SECRET_FIELDS) delete c[f];
            return c;
          })(),
          synced_at: new Date().toISOString(),
        });
      }

      const email = str(pick(r, "email"));
      const before = prior.get(sUrl);
      const manual = bool(before?.employee_id_manual);
      let employeeId = (before?.employee_id as string | null) ?? null;
      if (!manual && !employeeId && email) employeeId = byEmail.get(email.toLowerCase().trim()) ?? null;

      const pnr = str(pick(r, "personal_identification_number", "social_security_number"));
      rows.push({
        connection_id: conn.id,
        url: sUrl,
        pk_id: int(pick(r, "id", "pk_id")),
        first_name: str(pick(r, "first_name", "firstName")),
        last_name: str(pick(r, "last_name", "lastName")),
        email,
        mobile_phone: str(pick(r, "mobile_phone", "mobilePhone", "phone")),
        employment_number: str(pick(r, "employment_number", "employmentNumber")),
        pnr_masked: maskPnr(pnr),
        pnr_encrypted: await encryptPnr(pnr),
        confirmed: bool(pick(r, "confirmed")),
        group_url: str(pick(r, "group", "group_url")),
        group_name: str(pick(r, "group_name", "groupName")),
        registration_date: dateOnly(pick(r, "registration_date", "registrationDate")),
        workplace_url: str(pick(r, "workplace", "workplace_url")),
        default_cost_group: str(pick(r, "default_cost_group", "defaultCostGroup")),
        employee_id: employeeId,
        employee_id_manual: manual,
        is_active_employment: active,
        raw: stripSecrets(r),
        synced_at: new Date().toISOString(),
      });
    }
    url = page.next;
  }

  const upserts = await upsert(db, "pk_staff", rows, "connection_id,url");
  if (employments.length) {
    await upsert(db, "pk_staff_employments", employments, "connection_id,staff_url,start");
  }
  return { pages, upserts, cursor: null as string | null };
}

function mapWorkPeriod(conn: Conn, r: Row): Row | null {
  const url = str(pick(r, "url", "resource_uri"));
  if (!url) {
    warn("Pass utan url hoppades över");
    return null;
  }
  const start = ts(pick(r, "start", "start_datetime"));
  const end = ts(pick(r, "end", "end_datetime"));
  return {
    connection_id: conn.id,
    url,
    period_url: str(pick(r, "period", "period_url")),
    staff_url: str(pick(r, "staff", "staff_url")),
    staff_name: str(pick(r, "staff_name", "staffName")),
    workplace_url: str(pick(r, "workplace", "workplace_url")),
    costgroup_url: costGroup(r).url,
    costgroup_name: costGroup(r).name,
    date: dateOnly(pick(r, "date")) ?? (start ? start.slice(0, 10) : null),
    start,
    end,
    start_time: timeOnly(pick(r, "start_time", "startTime")),
    end_time: timeOnly(pick(r, "end_time", "endTime")),
    period_name: str(pick(r, "period_name", "name")),
    period_color: str(pick(r, "period_color", "color")),
    description: str(pick(r, "description")),
    estimated_cost: num(pick(r, "estimated_cost", "estimatedCost")),
    additional_salaries: pick(r, "additional_salaries", "additionalSalaries") ?? null,
    breaks: pick(r, "breaks") ?? null,
    is_deleted: bool(pick(r, "is_deleted", "deleted")),
    is_published: bool(pick(r, "is_published", "published")),
    raw: r,
    last_synced_at: new Date().toISOString(),
  };
}

function mapLoggedTime(conn: Conn, r: Row): Row | null {
  const url = str(pick(r, "url", "resource_uri"));
  if (!url) {
    warn("Stämpling utan url hoppades över");
    return null;
  }
  const guestId = str(pick(r, "guest_id", "guestId"));
  return {
    connection_id: conn.id,
    url,
    identifier: str(pick(r, "identifier")),
    staff_url: str(pick(r, "staff", "staff_url")),
    workplace_url: str(pick(r, "workplace", "workplace_url")),
    work_period_url: str(pick(r, "work_period", "workperiod", "work_period_url")),
    company_url: str(pick(r, "company", "company_url")),
    costgroup_url: costGroup(r).url,
    costgroup_name: costGroup(r).name,
    start: ts(pick(r, "start")),
    stop: ts(pick(r, "stop", "end")),
    real_start: ts(pick(r, "real_start", "realStart")),
    real_stop: ts(pick(r, "real_stop", "realStop")),
    work_time_sec: int(pick(r, "work_time", "work_time_sec", "worktime")),
    breaks_duration_sec: int(pick(r, "breaks_duration", "breaks_duration_sec")) ?? 0,
    breaks: pick(r, "breaks") ?? null,
    cost: num(pick(r, "cost")),
    estimated_salary: num(pick(r, "estimated_salary", "estimatedSalary")),
    shift_salary: num(pick(r, "shift_salary", "shiftSalary")),
    is_canceled: bool(pick(r, "is_canceled", "canceled", "is_cancelled")),
    is_guest: bool(pick(r, "is_guest", "guest")),
    guest_name: str(pick(r, "guest_name", "guestName")),
    guest_id_masked: guestId ? maskPnr(guestId) : null,
    comment: str(pick(r, "comment")),
    raw: r,
    last_synced_at: new Date().toISOString(),
  };
}

/** Cursor-baserad synk för logged-times och work-periods. */
async function syncCursorResource(
  db: SupabaseClient,
  api: PkClient,
  conn: Conn,
  resource: "logged-times" | "work-periods",
  full: boolean,
) {
  const { data: state } = await db
    .from("pk_sync_state")
    .select("sync_cursor")
    .eq("connection_id", conn.id)
    .eq("resource", resource)
    .maybeSingle();

  const saved = full ? null : (str(state?.sync_cursor) ?? null);
  const extra = resource === "work-periods" ? "?include_deleted=1" : "";
  // API:et ignorerar datumfilter på dessa resurser — första körningen hämtar allt
  // och därefter används cursorn, som bara returnerar ändrade poster.
  let url: string | null = saved
    ? `${BASE}/${resource}/?sync_cursor=${encodeURIComponent(saved)}${
        resource === "work-periods" ? "&include_deleted=1" : ""
      }`
    : `${BASE}/${resource}/${extra}`;

  let pages = 0;
  let upserts = 0;
  let newCursor: string | null = null;
  let truncated = false;
  const MAX_PAGES = 60;

  while (url) {
    const page = await api.get(url);
    pages++;
    if (pages === 1) newCursor = page.cursor;
    const rows = page.results
      .map((r) => (resource === "logged-times" ? mapLoggedTime(conn, r) : mapWorkPeriod(conn, r)))
      .filter((r): r is Row => r !== null);
    if (rows.length) {
      upserts += await upsert(
        db,
        resource === "logged-times" ? "pk_logged_times" : "pk_work_periods",
        rows,
        "connection_id,url",
      );
    }
    url = page.next;
    if (url && pages >= MAX_PAGES) {
      truncated = true;
      warn(`${resource}: stannade efter ${MAX_PAGES} sidor, cursorn flyttas inte`);
      break;
    }
  }

  // Cursorn flyttas bara när hela hämtningen är klar.
  if (truncated) newCursor = null;


  return { pages, upserts, cursor: newCursor };
}

/* ---------------------------------------------------------- engångskontroll */

async function salesCheck(api: PkClient, days = 1) {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10) + "T00:00:00";
  let url: string | null = `${BASE}/sales/?sale_time__gte=${encodeURIComponent(since)}`;
  const counts: Record<string, number> = {};
  let pages = 0;
  while (url && pages < 20) {
    const page = await api.get(url);
    pages++;
    for (const r of page.results) {
      const wp = str(pick(r, "workplace", "workplace_url")) ?? "(saknas)";
      counts[wp] = (counts[wp] ?? 0) + 1;
    }
    url = page.next;
  }
  return counts;
}

/* ---------------------------------------------------------------- handler */

const RESOURCES = ["logged-times", "work-periods", "staffs", "workplaces", "costgroups"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  warnings.length = 0;

  const db = service();
  const u = new URL(req.url);
  let body: Row = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));

  const resource = String(u.searchParams.get("resource") ?? body.resource ?? "all");
  const full = u.searchParams.get("full") === "true" || body.full === true;
  const onlyConn = str(u.searchParams.get("connection") ?? body.connection);

  let q = db.from("pk_connections").select("id, label, secret_name, legal_entity_id").eq("is_active", true);
  if (onlyConn) q = q.eq("id", onlyConn);
  const { data: conns, error: connErr } = await q;
  if (connErr) return json({ ok: false, error: connErr.message }, 500);
  if (!conns?.length) return json({ ok: false, error: "Inga aktiva Personalkollen-anslutningar" }, 400);

  const wanted =
    resource === "all" ? [...RESOURCES] : RESOURCES.includes(resource as never) ? [resource] : [resource];

  const out: Row[] = [];
  let failed = false;

  for (const conn of conns as Conn[]) {
    const token = Deno.env.get(conn.secret_name);
    if (!token) {
      failed = true;
      out.push({ connection: conn.label, error: `Nyckel ${conn.secret_name} saknas` });
      continue;
    }
    const api = new PkClient(token);

    // Diagnostik: se svarsformen för en godtycklig sökväg utan att lagra något.
    if (resource === "probe") {
      const path = str(body.path) ?? "/work-periods/";
      try {
        const page = await api.get(`${BASE}${path}`);
        out.push({
          connection: conn.label,
          path,
          count: page.results.length,
          next: page.next,
          cursor: page.cursor,
          keys: page.results[0] ? Object.keys(page.results[0]) : [],
          first: page.results[0] ?? null,
        });
      } catch (e) {
        out.push({ connection: conn.label, path, error: String((e as Error).message) });
      }
      continue;
    }

    if (resource === "sales-check") {
      try {
        out.push({ connection: conn.label, sales_per_workplace: await salesCheck(api, Number(body.days ?? 1) || 1) });
      } catch (e) {
        failed = true;
        out.push({ connection: conn.label, error: String((e as Error).message) });
      }
      continue;
    }

    for (const res of wanted) {
      const started = Date.now();
      try {
        let r: { pages: number; upserts: number; cursor: string | null };
        if (res === "workplaces") r = await syncWorkplaces(db, api, conn);
        else if (res === "costgroups") r = await syncCostgroups(db, api, conn);
        else if (res === "staffs") r = await syncStaffs(db, api, conn);
        else if (res === "logged-times" || res === "work-periods")
          r = await syncCursorResource(db, api, conn, res, full);
        else throw new Error(`Okänd resurs ${res}`);

        // Cursorn flyttas först när alla sidor är upsertade.
        await db.from("pk_sync_state").upsert(
          {
            connection_id: conn.id,
            resource: res,
            ...(r.cursor ? { sync_cursor: r.cursor } : {}),
            last_run_at: new Date().toISOString(),
            last_status: "ok",
            last_error: null,
            records_upserted: r.upserts,
          },
          { onConflict: "connection_id,resource" },
        );
        await db.from("pk_sync_log").insert({
          connection_id: conn.id,
          resource: res,
          pages: r.pages,
          upserts: r.upserts,
          status: "ok",
        });
        out.push({
          connection: conn.label,
          resource: res,
          pages: r.pages,
          upserts: r.upserts,
          cursor: r.cursor,
          ms: Date.now() - started,
        });
      } catch (e) {
        failed = true;
        const msg = String((e as Error).message ?? e);
        // Cursorn står kvar vid fel.
        await db.from("pk_sync_state").upsert(
          {
            connection_id: conn.id,
            resource: res,
            last_run_at: new Date().toISOString(),
            last_status: "fel",
            last_error: msg.slice(0, 1000),
          },
          { onConflict: "connection_id,resource" },
        );
        await db.from("pk_sync_log").insert({
          connection_id: conn.id,
          resource: res,
          status: "fel",
          error: msg.slice(0, 1000),
        });
        out.push({ connection: conn.label, resource: res, error: msg });
      }
    }
  }

  return json({ ok: !failed, results: out, warnings }, failed ? 500 : 200);
});
