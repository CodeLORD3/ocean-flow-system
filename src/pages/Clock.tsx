/**
 * Stämpelklockan (kiosk). Fristående route /clock — fungerar även inbäddad.
 *
 * Steg 1: aktiveringskod (sparas i enheten tills koden roteras/återkallas).
 * Steg 2: stämpelvy med stort numeriskt inmatningsfält (RFID keyboard wedge
 * fungerar automatiskt eftersom samma fält används).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, WifiOff, CheckCircle2, Clock as ClockIcon, LogIn, LogOut, Coffee } from "lucide-react";
import {
  activate,
  clearSession,
  lookup,
  punch,
  statusOnSite,
  storedSession,
  storedStation,
  type ClockStationInfo,
  type OnSitePerson,
} from "@/lib/clockApi";
import { enqueuePunch, queuedCount, syncQueue } from "@/lib/clockQueue";

type Action = "in" | "ut" | "rast_start" | "rast_slut";

const ACTION_LABEL: Record<Action, string> = {
  in: "Instämpling",
  ut: "Utstämpling",
  rast_start: "Rast börjar",
  rast_slut: "Rast slutar",
};

const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });

export default function Clock() {
  const [station, setStation] = useState<ClockStationInfo | null>(storedStation());
  const [activated, setActivated] = useState(Boolean(storedSession()));
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [found, setFound] = useState<{ id: string; first_name: string; pnr_masked: string | null; suggested: Action } | null>(null);
  const [receipt, setReceipt] = useState<{ name: string; action: Action; at: string; offline?: boolean } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [onSite, setOnSite] = useState<OnSitePerson[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshQueue = useCallback(async () => {
    setQueued(await queuedCount().catch(() => 0));
  }, []);

  const refreshOnSite = useCallback(async () => {
    if (!navigator.onLine || !storedSession()) return;
    setOnSite(await statusOnSite().catch(() => []));
  }, []);

  useEffect(() => {
    const goOnline = async () => {
      setOnline(true);
      await syncQueue().catch(() => 0);
      await refreshQueue();
      await refreshOnSite();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    void refreshQueue();
    void refreshOnSite();
    const t = setInterval(() => void refreshOnSite(), 60_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(t);
    };
  }, [refreshOnSite, refreshQueue]);

  useEffect(() => {
    if (activated) inputRef.current?.focus();
  }, [activated, found, receipt]);

  const handleActivate = async () => {
    setBusy(true);
    setError(null);
    try {
      const info = await activate(code.trim());
      setStation(info);
      setActivated(true);
      setCode("");
      void refreshOnSite();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte aktivera");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFound(null);
    setIdentifier("");
    setPending(null);
    setError(null);
  };

  const showReceipt = (name: string, action: Action, at: string, offline = false) => {
    setReceipt({ name, action, at, offline });
    reset();
    setTimeout(() => setReceipt(null), 3000);
  };

  const handleLookup = async () => {
    const value = identifier.replace(/\s/g, "");
    if (!value) return;
    setBusy(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        // Offline: köa direkt, in/ut väljs i nästa steg
        setFound({ id: "offline", first_name: "Offline-stämpling", pnr_masked: `****${value.slice(-4)}`, suggested: "in" });
        return;
      }
      const res = await lookup(value);
      if (res.status === "pending_registration") {
        setPending(res.message ?? "Registrering väntar på godkännande.");
        setIdentifier("");
        return;
      }
      setFound({
        id: res.employee!.id,
        first_name: res.employee!.first_name,
        pnr_masked: res.employee!.pnr_masked,
        suggested: (res.suggested_action ?? "in") as Action,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Uppslaget misslyckades";
      if (msg.includes("aktiverad")) {
        clearSession();
        setActivated(false);
      }
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handlePunch = async (action: Action) => {
    const value = identifier.replace(/\s/g, "");
    const name = found?.first_name ?? "";
    setBusy(true);
    setError(null);
    const occurredAt = new Date().toISOString();
    try {
      if (!navigator.onLine) {
        await enqueuePunch(value, action, occurredAt);
        await refreshQueue();
        showReceipt(name, action, occurredAt, true);
        return;
      }
      const res = await punch(value, action, occurredAt);
      if (res.status === "pending_registration") {
        setPending(res.message ?? "Registrering väntar på godkännande.");
        setIdentifier("");
        return;
      }
      showReceipt(res.employee?.first_name ?? name, action, res.entry!.occurred_at);
      void refreshOnSite();
    } catch (e) {
      // Nätet kan ha dött mellan uppslag och stämpling → köa
      try {
        await enqueuePunch(value, action, occurredAt);
        await refreshQueue();
        showReceipt(name, action, occurredAt, true);
      } catch {
        setError(e instanceof Error ? e.message : "Stämplingen misslyckades");
      }
    } finally {
      setBusy(false);
    }
  };

  // ---------- Steg 1: aktivering ----------
  if (!activated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 space-y-6">
          <div className="space-y-1 text-center">
            <ClockIcon className="h-10 w-10 mx-auto text-primary" />
            <h1 className="text-2xl font-semibold">Aktivera stämpelklockan</h1>
            <p className="text-sm text-muted-foreground">
              Ange aktiveringskoden för försäljningsstället.
            </p>
          </div>
          <Input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleActivate()}
            placeholder="AKTIVERINGSKOD"
            className="h-16 text-center text-2xl tracking-[0.3em] font-mono"
          />
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button className="w-full h-14 text-lg" onClick={handleActivate} disabled={busy || code.length < 8}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Aktivera"}
          </Button>
        </Card>
      </div>
    );
  }

  // ---------- Steg 2: kiosk ----------
  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{station?.store_name ?? station?.name ?? "Stämpelklocka"}</h1>
            <p className="text-xs text-muted-foreground">{station?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            {!online && (
              <Badge variant="destructive" className="gap-1">
                <WifiOff className="h-3 w-3" /> Offline-läge
              </Badge>
            )}
            {queued > 0 && <Badge variant="outline">{queued} i kö</Badge>}
            <Badge variant="outline" className="font-mono tabular-nums">
              {new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
            </Badge>
          </div>
        </header>

        {receipt ? (
          <Card className="p-10 text-center space-y-3 border-primary">
            <CheckCircle2 className="h-14 w-14 mx-auto text-primary" />
            <p className="text-2xl font-semibold">
              {ACTION_LABEL[receipt.action]} registrerad
            </p>
            <p className="text-lg">
              {receipt.name} · <span className="font-mono tabular-nums">{timeOf(receipt.at)}</span>
            </p>
            {receipt.offline && (
              <p className="text-sm text-muted-foreground">
                Sparad i offline-kön och syncas när nätet är tillbaka.
              </p>
            )}
          </Card>
        ) : found ? (
          <Card className="p-8 space-y-6 text-center">
            <div>
              <p className="text-3xl font-semibold">Hej {found.first_name}</p>
              <p className="text-lg font-mono text-muted-foreground">{found.pnr_masked ?? ""}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button className="h-20 text-lg gap-2" onClick={() => handlePunch("in")} disabled={busy}>
                <LogIn className="h-6 w-6" /> IN
              </Button>
              <Button
                className="h-20 text-lg gap-2"
                variant="secondary"
                onClick={() => handlePunch("ut")}
                disabled={busy}
              >
                <LogOut className="h-6 w-6" /> UT
              </Button>
              <Button
                className="h-16 text-base gap-2"
                variant="outline"
                onClick={() => handlePunch("rast_start")}
                disabled={busy}
              >
                <Coffee className="h-5 w-5" /> RAST börjar
              </Button>
              <Button
                className="h-16 text-base gap-2"
                variant="outline"
                onClick={() => handlePunch("rast_slut")}
                disabled={busy}
              >
                <Coffee className="h-5 w-5" /> RAST slutar
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Föreslaget nästa steg: {ACTION_LABEL[found.suggested]}</p>
            <Button variant="ghost" onClick={reset}>
              Avbryt
            </Button>
          </Card>
        ) : (
          <Card className="p-8 space-y-5">
            <label className="block text-center text-lg font-medium">
              Personnummer eller kortnummer
            </label>
            <Input
              ref={inputRef}
              value={identifier}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="ÅÅMMDDXXXX"
              className="h-20 text-center text-3xl font-mono tracking-widest"
            />
            {pending && (
              <p className="text-center text-base text-amber-500 font-medium">{pending}</p>
            )}
            {error && <p className="text-center text-sm text-destructive">{error}</p>}
            <Button className="w-full h-16 text-xl" onClick={handleLookup} disabled={busy || !identifier}>
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : "Fortsätt"}
            </Button>
          </Card>
        )}

        <Card className="p-4">
          <p className="text-sm font-medium mb-2">På plats nu</p>
          {onSite.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen är instämplad.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {onSite.map((p, i) => (
                <Badge key={i} variant={p.on_break ? "outline" : "secondary"} className="gap-1">
                  {p.first_name} {p.initial}. · {timeOf(p.since)}
                  {p.on_break ? " (rast)" : ""}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
