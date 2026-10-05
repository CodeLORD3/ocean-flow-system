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

const LABEL: Record<string, string> = { in: "Stämpla in", ut: "Stämpla ut", rast_start: "Börja rast", rast_slut: "Avsluta rast" };
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
        setMessage({ tone: "error", text: outside ? `Du är utanför butiken. ${r.error}` : r.error });
      } else {
        setMessage({ tone: "ok", text: `${LABEL[action]} kl. ${time(r.data?.entry?.occurred_at ?? new Date().toISOString())}` });
        await load();
      }
    } catch (e) {
      setMessage({ tone: "error", text: (e as Error).message });
      if ((e as { denied?: boolean }).denied) setLocationDenied(true);
    } finally {
      setBusy(false);
    }
  };

  const inShift = status.last_type === "in" || status.last_type === "rast_slut" || status.last_type === "rast_start";
  const primary = status.suggested_action;

  return (
    <Card id={SELF_PUNCH_ANCHOR} className="scroll-mt-20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Clock className="h-7 w-7 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-lg font-semibold leading-tight text-foreground">Stämpla</p>
            <p className="text-base font-medium text-foreground">
              {status.last_type === "rast_start"
                ? "På rast"
                : inShift && status.punched_in_since
                  ? `Instämplad sedan kl. ${time(status.punched_in_since)}`
                  : "Inte instämplad"}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Button className="h-16 w-full text-xl font-semibold" disabled={busy} onClick={() => punch(primary)}>
            {busy ? <Loader2 className="h-6 w-6 animate-spin mr-2" /> : <MapPin className="h-6 w-6 mr-2" />}
            {LABEL[primary]}
          </Button>
          {(status.last_type === "in" || status.last_type === "rast_slut") && (
            <Button variant="outline" className="h-14 w-full text-lg" disabled={busy} onClick={() => punch("rast_start")}>Börja rast</Button>
          )}
        </div>
        {message && (
          <p role="status" className={`text-base font-medium ${message.tone === "error" ? "text-destructive" : "text-success"}`}>{message.text}</p>
        )}
        {locationDenied && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-base space-y-2">
            <p className="font-semibold">Så slår du på platstjänsten</p>
            <p><span className="font-medium">iPhone:</span> Inställningar → Integritet och säkerhet → Platstjänster → Safari-webbplatser → Vid användning. Öppna sedan appen igen.</p>
            <p><span className="font-medium">Android:</span> Chrome → ⋮ → Inställningar → Webbplatsinställningar → Plats → tillåt den här webbplatsen.</p>
          </div>
        )}
        {status.requires_location !== false && <p className="text-sm text-muted-foreground">Din position kontrolleras mot butiken vid varje stämpling.</p>}
      </CardContent>
    </Card>
  );
}
