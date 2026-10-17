import { useStaffT } from "@/lib/staffI18n";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Loader2, MapPin } from "lucide-react";

type Status = {
  last_type: string | null;
  punched_in_since: string | null;
  suggested_action: "in" | "ut" | "rast_start" | "rast_slut";
  employee: { first_name: string };
  requires_location?: boolean;
};

const ERROR_KEYS: Record<string, string> = {
  "Logga in för att stämpla.": "login",
  "Du saknar personalkonto för stämpling.": "account",
  "Mobilstämpling är inte öppen för dig.": "mobile_closed",
  "Mobilstämpling är inte öppen för din butik.": "store_closed",
  "Platsåtkomst krävs för mobil stämpling.": "location_required",
  "Arbetsplatsen saknar giltig position för mobilstämpling. Kontakta kontoret.": "site_position",
  "Kunde inte spara stämplingen.": "save_error",
  "Du måste vara instämplad för att börja rast.": "break_requires_in",
  "Ingen pågående rast att avsluta.": "no_break",
  "Du är redan instämplad och på rast. Tryck Rast slut i stället.": "already_break",
  "Du är redan instämplad. Tryck Ut när du slutar — eller säg till chefen om något blivit fel.": "already_in",
"Kunde inte nå stämplingen. Försök igen.": "connection_error", "Telefonen saknar platstjänst.": "no_location", "Platstjänsten är avstängd eller nekad.": "location_denied", "Kunde inte läsa din position. Gå utomhus eller närmare butiken och försök igen.": "position_error"};

const time = (iso: string) => new Date(iso).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });

// Direkt fetch i stället för functions.invoke: nekade stämplingar (t.ex. utanför geofence)
// är förväntade svar och ska visas i kortet, inte rapporteras som krasch.
async function call(body: Record<string, unknown>): Promise<{ data?: any; error?: string; status?: number }> {
  try {
    const { data: s } = await supabase.auth.getSession();
    const token = s.session?.access_token;
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-punch`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ self_punch: true, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) return { data };
    return { error: (data as { error?: string })?.error ?? "Kunde inte nå stämplingen. Försök igen.", status: res.status };
  } catch {
    return { error: "Kunde inte nå stämplingen. Försök igen." };
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Telefonen saknar platstjänst."));
    navigator.geolocation.getCurrentPosition(resolve, (e) => {
      if (e.code === e.PERMISSION_DENIED) {
        const err = new Error("Platstjänsten är avstängd eller nekad.");
        (err as Error & { denied?: boolean }).denied = true;
        return reject(err);
      }
      reject(new Error("Kunde inte läsa din position. Gå utomhus eller närmare butiken och försök igen."));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
}

export const SELF_PUNCH_KEY = ["self-punch-status"];

/** Delad status för mobilstämpling: null = personen har inte rätt att stämpla med mobilen. */
export function useSelfPunchStatus() {
  return useQuery({
    queryKey: SELF_PUNCH_KEY,
    staleTime: 30_000,
    retry: false,
    queryFn: async (): Promise<Status | null> => {
      const r = await call({ mode: "lookup" });
      return r.data?.status === "found" ? (r.data as Status) : null;
    },
  });
}

export const SELF_PUNCH_ANCHOR = "self-punch-card";

/** Personlig mobilstämpling på startsidan. Visas bara för den som har rätt. */
export function SelfPunchCard() {
  const { t, lang, dir } = useStaffT();
  const translateError = (text: string) => {
    const key = ERROR_KEYS[text];
    if (key) return t(`meny.${key}`);
    const distance = /^Du är (\d+) meter från driftstället\. Stämpling nekad\.$/.exec(text);
    return distance ? t("meny.distance_error").replace("{n}", distance[1]) : text;
  };
  const qc = useQueryClient();
  const { data: status } = useSelfPunchStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);
  const load = () => qc.invalidateQueries({ queryKey: SELF_PUNCH_KEY });

  if (!status) return null;

  const punch = async (action: string) => {
    setBusy(true);
    setMessage(null);
    setLocationDenied(false);
    try {
      const pos = status.requires_location === false ? null : await getPosition();
      const r = await call({
        mode: "punch",
        action,
        client_punch_id: crypto.randomUUID(),
        ...(pos ? { punch_lat: pos.coords.latitude, punch_lng: pos.coords.longitude, punch_accuracy_m: pos.coords.accuracy } : {}),
      });
      if (r.error) {
        const outside = /meter från/.test(r.error);
        setMessage({ tone: "error", text: outside ? t("meny.outside").replace("{n}", translateError(r.error)) : translateError(r.error) });
      } else {
        setMessage({ tone: "ok", text: t("meny.punch_success").replace("{n}", t(`meny.${action}`)).replace("{time}", time(r.data?.entry?.occurred_at ?? new Date().toISOString())) });
        await load();
      }
    } catch (e) {
      setMessage({ tone: "error", text: translateError((e as Error).message) });
      if ((e as { denied?: boolean }).denied) setLocationDenied(true);
    } finally {
      setBusy(false);
    }
  };

  const inShift = status.last_type === "in" || status.last_type === "rast_slut" || status.last_type === "rast_start";
  const primary = status.suggested_action;

  return (
    <Card lang={lang} dir={dir} id={SELF_PUNCH_ANCHOR} className="scroll-mt-20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Clock className="h-7 w-7 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-foreground">{t("meny.punch")}</p>
            <p className="text-base font-medium text-foreground">
              {status.last_type === "rast_start"
                ? t("meny.on_break")
                : inShift && status.punched_in_since
                  ? t("meny.since").replace("{n}", time(status.punched_in_since))
                  : t("meny.not_in")}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Button className="h-16 w-full text-xl font-semibold" disabled={busy} onClick={() => punch(primary)}>
            {busy ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <MapPin className="h-6 w-6 mr-2" />}
            {t(`meny.${primary}`)}
          </Button>
          {(status.last_type === "in" || status.last_type === "rast_slut") && (
            <Button variant="outline" className="h-14 w-full text-lg" disabled={busy} onClick={() => punch("rast_start")}>{t("meny.rast_start")}</Button>
          )}
        </div>
        {message && (
          <p role="status" className={`text-base font-medium ${message.tone === "error" ? "text-destructive" : "text-success"}`}>{message.text}</p>
        )}
        {locationDenied && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-base space-y-2">
            <p className="font-semibold">{t("meny.enable_location")}</p>
            <p><span className="font-medium">iPhone:</span> {t("meny.iphone_help")}</p>
            <p><span className="font-medium">Android:</span> {t("meny.android_help")}</p>
          </div>
        )}
        {status.requires_location !== false && <p className="text-sm text-muted-foreground">{t("meny.location_notice")}</p>}
      </CardContent>
    </Card>
  );
}
