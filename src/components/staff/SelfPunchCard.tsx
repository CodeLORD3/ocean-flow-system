import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Clock, Loader2, MapPin } from "lucide-react";

type Status = {
  last_type: string | null;
  punched_in_since: string | null;
  suggested_action: "in" | "ut" | "rast_start" | "rast_slut";
  employee: { first_name: string };
};

const LABEL: Record<string, string> = { in: "Stämpla in", ut: "Stämpla ut", rast_start: "Börja rast", rast_slut: "Avsluta rast" };
const time = (iso: string) => new Date(iso).toLocaleTimeString("sv-SE", { timeZone: "Europe/Stockholm", hour: "2-digit", minute: "2-digit" });

async function call(body: Record<string, unknown>): Promise<{ data?: any; error?: string; status?: number }> {
  const { data, error } = await supabase.functions.invoke("clock-punch", { body: { self_punch: true, ...body } });
  if (!error) return { data };
  const ctx = (error as { context?: Response }).context;
  let msg = "Kunde inte nå stämplingen. Försök igen.";
  let status: number | undefined;
  if (ctx) {
    status = ctx.status;
    try { msg = (await ctx.json())?.error ?? msg; } catch { /* ignore */ }
  }
  return { error: msg, status };
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

/** Personlig mobilstämpling på startsidan. Visas bara för den som har rätt. */
export function SelfPunchCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [locationDenied, setLocationDenied] = useState(false);

  const load = useCallback(async () => {
    const r = await call({ mode: "lookup" });
    if (r.data?.status === "found") { setAllowed(true); setStatus(r.data as Status); }
    else if (r.status === 403 || r.status === 401) setAllowed(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (!allowed || !status) return null;

  const punch = async (action: string) => {
    setBusy(true);
    setMessage(null);
    setLocationDenied(false);
    try {
      const pos = await getPosition();
      const r = await call({
        mode: "punch",
        action,
        client_punch_id: crypto.randomUUID(),
        punch_lat: pos.coords.latitude,
        punch_lng: pos.coords.longitude,
        punch_accuracy_m: pos.coords.accuracy,
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
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <div className="min-w-0">
            <p className="font-semibold text-foreground">Stämpla</p>
            <p className="text-sm text-muted-foreground">
              {status.last_type === "rast_start"
                ? "På rast"
                : inShift && status.punched_in_since
                  ? `Instämplad sedan kl. ${time(status.punched_in_since)}`
                  : "Inte instämplad"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" className="flex-1 min-w-[140px]" disabled={busy} onClick={() => punch(primary)}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <MapPin className="h-4 w-4 mr-1" />}
            {LABEL[primary]}
          </Button>
          {(status.last_type === "in" || status.last_type === "rast_slut") && (
            <Button size="lg" variant="outline" disabled={busy} onClick={() => punch("rast_start")}>Börja rast</Button>
          )}
        </div>
        {message && (
          <p className={`text-sm ${message.tone === "error" ? "text-destructive" : "text-success"}`}>{message.text}</p>
        )}
        {locationDenied && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm space-y-2">
            <p className="font-semibold">Så slår du på platstjänsten</p>
            <p><span className="font-medium">iPhone:</span> Inställningar → Integritet och säkerhet → Platstjänster → Safari-webbplatser → Vid användning. Öppna sedan appen igen.</p>
            <p><span className="font-medium">Android:</span> Chrome → ⋮ → Inställningar → Webbplatsinställningar → Plats → tillåt den här webbplatsen.</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Din position kontrolleras mot butiken vid varje stämpling.</p>
      </CardContent>
    </Card>
  );
}
