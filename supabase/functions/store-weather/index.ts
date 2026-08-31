/**
 * store-weather — väder per butik och datum till sälj-/orderrapporterna.
 *
 * Geokodar butikens ort en gång (Open-Meteo geocoding) och hämtar sedan
 * saknade dagar från arkiv-API:t (förfluten tid) eller prognos-API:t
 * (idag och framåt). Resultatet cachas i store_weather_daily.
 *
 * Open-Meteos gratisnivå är endast för icke-kommersiellt bruk. Finns
 * hemligheten OPEN_METEO_API_KEY används de betalda customer-endpointerna.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const API_KEY = Deno.env.get("OPEN_METEO_API_KEY") ?? "";
const paid = API_KEY.length > 0;
const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
const ARCHIVE_URL = paid
  ? "https://customer-archive-api.open-meteo.com/v1/archive"
  : "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_URL = paid
  ? "https://customer-api.open-meteo.com/v1/forecast"
  : "https://api.open-meteo.com/v1/forecast";
const DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max,weathercode";

/** WMO-kod → svensk text. */
function weatherText(code: number | null, windMax: number | null) {
  if (windMax != null && windMax > 30) return "Blåsigt";
  if (code == null) return null;
  if (code === 0) return "Klart";
  if (code === 1) return "Halvklart";
  if (code === 2) return "Halvklart";
  if (code === 3) return "Molnigt";
  if (code === 45 || code === 48) return "Dimma";
  if (code >= 51 && code <= 67) return "Regn";
  if (code >= 71 && code <= 77) return "Snö";
  if (code >= 80 && code <= 82) return "Regnskurar";
  if (code >= 85 && code <= 86) return "Snöbyar";
  if (code >= 95 && code <= 99) return "Åska";
  return "Okänt";
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
};
const dayList = (from: string, to: string) => {
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard++ < 400) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
};

function withKey(url: URL) {
  if (paid) url.searchParams.set("apikey", API_KEY);
  return url;
}

async function fetchJson(url: URL) {
  const res = await fetch(url.toString());
  const body = await res.text();
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Serverkonfiguration saknas" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Inloggning krävs" }, 401);
    const authClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? serviceRoleKey);
    const { data: { user }, error: authError } = await authClient.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Ogiltig inloggning" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const payload = await req.json().catch(() => ({}));
    const storeId = String(payload.store_id ?? "");
    const startDate = String(payload.start_date ?? "");
    const endDate = String(payload.end_date ?? "");
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!/^[0-9a-f-]{36}$/i.test(storeId) || !dateRe.test(startDate) || !dateRe.test(endDate) || startDate > endDate) {
      return json({ error: "Ogiltiga parametrar (store_id, start_date, end_date)" }, 400);
    }

    const { data: store, error: storeError } = await supabase
      .from("stores")
      .select("id, name, city, country, latitude, longitude, weather_timezone")
      .eq("id", storeId)
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) return json({ error: "Butiken finns inte" }, 404);

    let { latitude, longitude, weather_timezone: tz } = store as Record<string, any>;

    // 1. Geokodning en gång per butik.
    if (latitude == null || longitude == null) {
      const place = String(store.city ?? store.name ?? "").trim();
      if (!place) return json({ error: "Butiken saknar ort att geokoda" }, 422);
      const url = withKey(new URL(GEO_URL));
      url.searchParams.set("name", place);
      url.searchParams.set("count", "5");
      url.searchParams.set("language", "sv");
      url.searchParams.set("format", "json");
      const geo = await fetchJson(url);
      const results: any[] = geo?.results ?? [];
      const hit =
        results.find((r) => !store.country || r.country_code === store.country) ?? results[0];
      if (!hit) return json({ error: `Kunde inte geokoda "${place}"` }, 422);
      latitude = hit.latitude;
      longitude = hit.longitude;
      tz = hit.timezone ?? (store.country === "CH" ? "Europe/Zurich" : "Europe/Stockholm");
      await supabase
        .from("stores")
        .update({ latitude, longitude, weather_timezone: tz, geocoded_at: new Date().toISOString() })
        .eq("id", storeId);
    }
    const timezone = tz || (store.country === "CH" ? "Europe/Zurich" : "Europe/Stockholm");

    // 2. Vad finns redan i cachen?
    const { data: cached, error: cacheError } = await supabase
      .from("store_weather_daily")
      .select("*")
      .eq("store_id", storeId)
      .gte("weather_date", startDate)
      .lte("weather_date", endDate);
    if (cacheError) throw cacheError;

    const today = isoDate(new Date());
    const staleAfter = Date.now() - 3 * 3600 * 1000;
    const byDate = new Map<string, any>((cached ?? []).map((r) => [r.weather_date, r]));
    const missing = dayList(startDate, endDate).filter((d) => {
      const row = byDate.get(d);
      if (!row) return true;
      // Prognosrader ersätts av arkivdata när dagen passerat, och uppdateras var 3:e timme.
      if (row.source === "forecast" && (d < today || new Date(row.fetched_at).getTime() < staleAfter)) return true;
      return false;
    });

    if (missing.length > 0) {
      // Arkiv har eftersläpning på några dagar → prognos-API:t täcker de senaste dagarna.
      const archiveCutoff = addDays(today, -6);
      const groups: { url: string; source: "archive" | "forecast"; days: string[] }[] = [
        { url: ARCHIVE_URL, source: "archive", days: missing.filter((d) => d < archiveCutoff) },
        { url: FORECAST_URL, source: "forecast", days: missing.filter((d) => d >= archiveCutoff) },
      ];

      for (const group of groups) {
        if (group.days.length === 0) continue;
        const from = group.days[0];
        const to = group.days[group.days.length - 1];
        const url = withKey(new URL(group.url));
        url.searchParams.set("latitude", String(latitude));
        url.searchParams.set("longitude", String(longitude));
        url.searchParams.set("daily", DAILY);
        url.searchParams.set("timezone", timezone);
        url.searchParams.set("start_date", from);
        url.searchParams.set("end_date", to);
        let data: any;
        try {
          data = await fetchJson(url);
        } catch (err) {
          console.error(`Väderhämtning misslyckades (${group.source})`, err);
          continue;
        }
        const daily = data?.daily;
        const dates: string[] = daily?.time ?? [];
        const wanted = new Set(group.days);
        const rows = dates
          .map((date, i) => {
            const code = daily.weathercode?.[i] ?? null;
            const wind = daily.windspeed_10m_max?.[i] ?? null;
            return {
              store_id: storeId,
              weather_date: date,
              temp_max: daily.temperature_2m_max?.[i] ?? null,
              temp_min: daily.temperature_2m_min?.[i] ?? null,
              precipitation_mm: daily.precipitation_sum?.[i] ?? null,
              windspeed_max: wind,
              weather_code: code,
              weather_text: weatherText(code, wind),
              source: group.source,
              fetched_at: new Date().toISOString(),
            };
          })
          .filter((r) => wanted.has(r.weather_date) && r.weather_code != null);
        if (rows.length === 0) continue;
        const { error: upsertError } = await supabase
          .from("store_weather_daily")
          .upsert(rows, { onConflict: "store_id,weather_date" });
        if (upsertError) throw upsertError;
        rows.forEach((r) => byDate.set(r.weather_date, r));
      }
    }

    return json({
      store_id: storeId,
      paid_tier: paid,
      days: dayList(startDate, endDate)
        .map((d) => byDate.get(d))
        .filter(Boolean),
    });
  } catch (err) {
    console.error("store-weather fel", err);
    return json({ error: err instanceof Error ? err.message : "Okänt fel" }, 500);
  }
});
