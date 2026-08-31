/**
 * Stämpelklockan (kiosk). Fristående route /clock — fungerar även inbäddad.
 *
 * Steg 1: aktiveringskod (sparas i enheten tills koden roteras/återkallas).
 * Steg 2: stämpelvy med stort numeriskt inmatningsfält (RFID keyboard wedge
 * fungerar automatiskt eftersom samma fält används).
 *
 * Design: "Industry" — ett fokus per vy, blueprint-hörn bara på ytterram och
 * primärknapp, status via vänsterkant + textetikett.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  IndustryFrame,
  IndustryButton,
  IndustryInput,
  SectionLabel,
  StatusLabel,
} from "@/components/industry";
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
  const [siteId, setSiteId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const workSites = station?.work_sites ?? [];
  const activeSite = workSites.find((s) => s.id === siteId) ?? (workSites.length === 1 ? workSites[0] : null);

  /** Hämtar position när driftstället har geofence. Tyst fallback utan position. */
  const readPosition = useCallback(async () => {
    if (!navigator.geolocation) return {};
    return new Promise<{ latitude?: number; longitude?: number; accuracyM?: number }>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracyM: pos.coords.accuracy }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 30_000 },
      );
    });
  }, []);

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
        setFound({ id: "offline", first_name: "Offline-stämpling", pnr_masked: null, suggested: "in" });
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
    if (action === "in" && workSites.length > 1 && !activeSite) {
      setError("Välj driftställe innan du stämplar in.");
      return;
    }
    setBusy(true);
    setError(null);
    const occurredAt = new Date().toISOString();
    const context = {
      workSiteId: activeSite?.id,
      costCenter: activeSite?.posting_cost_center,
      ...(await readPosition()),
    };
    try {
      if (!navigator.onLine) {
        await enqueuePunch(value, action, occurredAt, context);
        await refreshQueue();
        showReceipt(name, action, occurredAt, true);
        return;
      }
      const res = await punch(value, action, occurredAt, context);
      if (res.status === "pending_registration") {
        setPending(res.message ?? "Registrering väntar på godkännande.");
        setIdentifier("");
        return;
      }
      showReceipt(res.employee?.first_name ?? name, action, res.entry!.occurred_at);
      void refreshOnSite();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Stämplingen misslyckades";
      // Geofence-/valideringsfel ska visas, inte köas.
      if (/meter|driftställe|Platsåtkomst/i.test(msg)) {
        setError(msg);
        setBusy(false);
        return;
      }
      try {
        await enqueuePunch(value, action, occurredAt, { ...context, offlineQueued: true });
        await refreshQueue();
        showReceipt(name, action, occurredAt, true);
      } catch {
        setError(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  // ---------- Steg 1: aktivering ----------
  if (!activated) {
    return (
      <IndustryFrame className="min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1">
            <SectionLabel>Stämpelklocka · aktivering</SectionLabel>
            <h1 className="ind-h1">Aktivera klockan</h1>
            <p className="ind-muted text-sm">Ange aktiveringskoden för försäljningsstället.</p>
          </div>
          <IndustryInput
            kiosk
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && handleActivate()}
            placeholder="AKTIVERINGSKOD"
            aria-label="Aktiveringskod"
          />
          {error && (
            <p className="ind-row ind-row--edge-alert">
              <StatusLabel tone="alert">Fel</StatusLabel>
              <span className="text-sm">{error}</span>
            </p>
          )}
          <IndustryButton
            variant="primary"
            size="kiosk"
            corners
            className="w-full"
            onClick={handleActivate}
            disabled={busy || code.length < 8}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Aktivera"}
          </IndustryButton>
        </div>
      </IndustryFrame>
    );
  }

  // ---------- Steg 2: kiosk ----------
  return (
    <IndustryFrame className="min-h-screen p-4 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-start justify-between gap-4 pb-6">
          <div>
            <SectionLabel>{station?.name ?? "Stämpelklocka"}</SectionLabel>
            <p className="ind-h3">{station?.store_name ?? "Försäljningsställe"}</p>
          </div>
          <p className="ind-h2 ind-mono">
            {new Date().toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </header>

        {!online && (
          <div className="ind-row ind-row--edge-neutral mb-4">
            <SectionLabel>Offline — stämplingar köas</SectionLabel>
            {queued > 0 && <span className="ind-muted text-sm ind-mono">{queued} i kö</span>}
          </div>
        )}

        {receipt ? (
          <div className="ind-accent-surface p-8 space-y-2">
            <SectionLabel>{ACTION_LABEL[receipt.action]} registrerad</SectionLabel>
            <p className="ind-h1">{receipt.name}</p>
            <p className="ind-h3 ind-mono">{timeOf(receipt.at)}</p>
            {receipt.offline && (
              <p className="ind-muted text-sm">Sparad i offline-kön och syncas när nätet är tillbaka.</p>
            )}
          </div>
        ) : found ? (
          <div className="space-y-6">
            <div>
              <h2 className="ind-h2">
                Hej {found.first_name} {found.pnr_masked ? `(${found.pnr_masked})` : ""}
              </h2>
              <p className="ind-muted text-sm">Föreslaget nästa steg: {ACTION_LABEL[found.suggested]}</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <IndustryButton variant="primary" size="kiosk" corners onClick={() => handlePunch("in")} disabled={busy}>
                IN
              </IndustryButton>
              <IndustryButton variant="secondary" size="kiosk" onClick={() => handlePunch("ut")} disabled={busy}>
                UT
              </IndustryButton>
              <IndustryButton
                variant="secondary"
                size="kiosk"
                onClick={() => handlePunch(found.suggested === "rast_slut" ? "rast_slut" : "rast_start")}
                disabled={busy}
              >
                RAST
              </IndustryButton>
            </div>
            <div className="flex gap-3">
              <IndustryButton variant="ghost" size="touch" onClick={() => handlePunch("rast_slut")} disabled={busy}>
                Rast slutar
              </IndustryButton>
              <IndustryButton variant="ghost" size="touch" onClick={reset}>
                Avbryt
              </IndustryButton>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <SectionLabel>Stämpla</SectionLabel>
              <h2 className="ind-h2">Personnummer eller kortnummer</h2>
            </div>
            <IndustryInput
              kiosk
              ref={inputRef}
              value={identifier}
              inputMode="numeric"
              autoComplete="off"
              onChange={(e) => setIdentifier(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="ÅÅMMDDXXXX"
              aria-label="Personnummer eller kortnummer"
            />
            {pending && (
              <div className="ind-row ind-row--edge-accent-2">
                <StatusLabel tone="progress">Väntar</StatusLabel>
                <span className="text-sm">{pending}</span>
              </div>
            )}
            {error && (
              <div className="ind-row ind-row--edge-alert">
                <StatusLabel tone="alert">Fel</StatusLabel>
                <span className="text-sm">{error}</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <IndustryButton
                variant="primary"
                size="kiosk"
                corners
                onClick={handleLookup}
                disabled={busy || !identifier}
              >
                {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : "IN"}
              </IndustryButton>
              <IndustryButton variant="secondary" size="kiosk" onClick={handleLookup} disabled={busy || !identifier}>
                UT
              </IndustryButton>
              <IndustryButton variant="secondary" size="kiosk" onClick={handleLookup} disabled={busy || !identifier}>
                RAST
              </IndustryButton>
            </div>
          </div>
        )}

        <footer className="mt-8 pt-4" style={{ borderTop: "1px solid var(--color-divider)" }}>
          <SectionLabel>På plats nu</SectionLabel>
          {onSite.length === 0 ? (
            <p className="ind-muted text-sm">Ingen är instämplad.</p>
          ) : (
            <p className="ind-muted text-sm">
              {onSite
                .map((p) => `${p.first_name} ${p.initial}. ${timeOf(p.since)}${p.on_break ? " (rast)" : ""}`)
                .join("   ·   ")}
            </p>
          )}
        </footer>
      </div>
    </IndustryFrame>
  );
}
