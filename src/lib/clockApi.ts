/**
 * Klockklientens enda väg in i systemet: dedikerade edge functions med
 * stationstoken. Klockan läser aldrig tabeller direkt.
 */

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const CLOCK_SESSION_KEY = "mt.clock.session";
export const CLOCK_STATION_KEY = "mt.clock.station";

export interface ClockWorkSiteInfo {
  id: string;
  name: string;
  posting_cost_center: string;
  geofence_radius_m: number;
  allow_mobile_punch: boolean;
}

export interface ClockStationInfo {
  id: string;
  name: string;
  store_name: string | null;
  store_id?: string | null;
  legal_entity_id?: string | null;
  profile: Record<string, unknown>;
  work_sites?: ClockWorkSiteInfo[];
}

async function call<T>(fn: string, body: Record<string, unknown>, sessionToken?: string): Promise<T> {
  const res = await fetch(`${FUNCTIONS_URL}/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
      ...(sessionToken ? { "x-clock-session": sessionToken } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Något gick fel");
  return data as T;
}

export function storedSession(): string | null { return localStorage.getItem(CLOCK_SESSION_KEY); }
export function storedStation(): ClockStationInfo | null {
  const raw = localStorage.getItem(CLOCK_STATION_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw) as ClockStationInfo; } catch { return null; }
}
export function clearSession() { localStorage.removeItem(CLOCK_SESSION_KEY); localStorage.removeItem(CLOCK_STATION_KEY); }

export async function activate(activationCode: string): Promise<ClockStationInfo> {
  const res = await call<{ session_token: string; station: ClockStationInfo }>("clock-activate", { activation_code: activationCode });
  localStorage.setItem(CLOCK_SESSION_KEY, res.session_token);
  localStorage.setItem(CLOCK_STATION_KEY, JSON.stringify(res.station));
  return res.station;
}

export interface LookupResult {
  status: "found" | "pending_registration";
  message?: string;
  employee?: { id: string; first_name: string; pnr_masked: string | null };
  last_type?: string | null;
  suggested_action?: "in" | "ut" | "rast_start" | "rast_slut";
}
export async function lookup(identifier: string): Promise<LookupResult> {
  const token = storedSession();
  if (!token) throw new Error("Stationen är inte aktiverad.");
  return call<LookupResult>("clock-punch", { mode: "lookup", identifier }, token);
}

export interface PunchResult {
  status: "punched" | "pending_registration";
  message?: string;
  entry?: { id: string; type: string; occurred_at: string; registered_at: string; work_site_id?: string | null; cost_center?: string | null; geofence_ok?: boolean | null };
  employee?: { first_name: string; pnr_masked: string | null };
}

export interface PunchContext {
  workSiteId?: string;
  costCenter?: string;
  latitude?: number;
  longitude?: number;
  accuracyM?: number;
  offlineQueued?: boolean;
}

export async function punch(identifier: string, action: "in" | "ut" | "rast_start" | "rast_slut", occurredAt?: string, context: PunchContext = {}): Promise<PunchResult> {
  const token = storedSession();
  if (!token) throw new Error("Stationen är inte aktiverad.");
  return call<PunchResult>("clock-punch", {
    mode: "punch", identifier, action, occurred_at: occurredAt,
    client_punch_id: context.clientPunchId,
    work_site_id: context.workSiteId, cost_center: context.costCenter,
    punch_lat: context.latitude, punch_lng: context.longitude, punch_accuracy_m: context.accuracyM,
    offline_queued: context.offlineQueued,
  }, token);
}

export interface OnSitePerson { first_name: string; initial: string; since: string; on_break: boolean; }
export async function statusOnSite(): Promise<OnSitePerson[]> {
  const token = storedSession();
  if (!token) return [];
  const res = await call<{ on_site: OnSitePerson[] }>("clock-status", {}, token);
  return res.on_site ?? [];
}
