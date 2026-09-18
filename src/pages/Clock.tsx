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
import { svenskTid } from "@/lib/swedishTime";
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
  switchAllocation,
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

/** Vad som gäller direkt efter en stämpling — i klartext på kvittot. */
const RECEIPT_STATE: Record<Action, string> = {
  in: "Du är instämplad.",
  ut: "Du är utstämplad. Passet är avslutat.",
  rast_start: "Du är på rast.",
  rast_slut: "Rasten är slut — du är instämplad igen.",
};

/** Nuläget innan man trycker, utifrån vad systemet föreslår som nästa steg. */
const FOUND_STATE: Record<Action, string> = {
  in: "Du är inte instämplad just nu. Tryck IN för att börja passet.",
  ut: "Ditt pass är igång. Tryck UT när du slutar, eller Rast börjar.",
  rast_start: "Ditt pass är igång.",
  rast_slut: "Du är på rast. Tryck Rast slutar för att fortsätta passet.",
};

/**
 * Bara giltiga val visas (7d). Efter en instämpling går det att gå på rast
 * eller stämpla ut; under rast är enda vägen "Rast slutar".
 */
const VALID_ACTIONS: Record<Action, Action[]> = {
  in: ["in"],
  ut: ["ut", "rast_start"],
  rast_start: ["rast_start", "ut"],
  rast_slut: ["rast_slut"],
};

const timeOf = (iso: string) => svenskTid(iso).slice(0, 5);

/** Personnummer visas maskerat på skärmen: en punkt per inslagen siffra. */
const maskedDisplay = (value: string) => {
  if (!value) return "";
  const dots = "•".repeat(value.length);
  return value.length > 6 ? `${dots.slice(0, 6)} ${dots.slice(6)}` : dots;
};

const DIGIT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
const CODE_KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split("");

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
  const [now, setNow] = useState(() => new Date());
  const punchLock = useRef(false);
  const punchIdRef = useRef<string | null>(null);


  const workSites = station?.work_sites ?? [];
  /**
   * Rastknappen visas som standard så att personalen kan stämpla rast direkt.
   * En station kan stänga av den med break.mode = "off" (rastavdraget görs då
   * i attesten istället).
   */
  const breakMode = (station?.profile as { break?: { mode?: string } } | undefined)?.break?.mode;
  const breaksEnabled = breakMode !== "off";
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
    // Kön ska tömmas även när klockan startas om medan nätet redan är tillbaka.
    const drain = async () => {
      if (!navigator.onLine || !storedSession()) return;
      if ((await queuedCount().catch(() => 0)) > 0) await syncQueue().catch(() => 0);
      await refreshQueue();
    };
    void drain();
    const t = setInterval(() => void refreshOnSite(), 60_000);
    const q = setInterval(() => void drain(), 30_000);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      clearInterval(t);
      clearInterval(q);
    };
  }, [refreshOnSite, refreshQueue]);

  // Klockan står öppen dygnet runt: tid och datum måste ticka utan omladdning.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(t);
  }, []);

  // RFID-läsare skickar siffror som tangenttryck. Inget fält har fokus, så vi
  // lyssnar på fönstret istället — knappsatsen är fortsatt huvudvägen in.
  useEffect(() => {
    if (!activated) return;
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) setIdentifier((v) => (v.length >= 12 ? v : v + e.key));
      else if (e.key === "Backspace") setIdentifier((v) => v.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activated]);


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
    punchIdRef.current = null;
  };

  /** Knappsatsen är enda vägen in: inget fält har fokus, inget tangentbord öppnas. */
  const pressDigit = (digit: string) => {
    setError(null);
    setPending(null);
    setIdentifier((v) => (v.length >= 12 ? v : v + digit));
  };
  const pressBackspace = () => setIdentifier((v) => v.slice(0, -1));
  const pressClear = () => setIdentifier("");

  const showReceipt = (name: string, action: Action, at: string, offline = false) => {
    setReceipt({ name, action, at, offline });
    reset();
    setTimeout(() => setReceipt(null), 3000);
  };

  const handleLookup = async () => {
    const value = identifier.replace(/\s/g, "");
    if (!value) return;
    if (value.length !== 10 && value.length !== 12) {
      setError("Personnummer ska vara 10 siffror (ÅÅMMDDXXXX) eller 12 siffror.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!navigator.onLine) {
        // Offline: köa direkt, in/ut väljs i nästa steg
        setFound({ id: "offline", first_name: "Offline-stämpling", pnr_masked: null, suggested: "in" });
        return;
      }
      const res = await lookup(value);
      if (res.status === "pending_registration" || !res.employee) {
        setPending(res.message ?? "Registrering väntar på godkännande.");
        setIdentifier("");
        return;
      }
      setFound({
        id: res.employee.id,
        first_name: res.employee.first_name,
        pnr_masked: res.employee.pnr_masked,
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
    // Dubbeltryck på touchskärm: första trycket äger stämplingen, och samma
    // client_punch_id återanvänds så att servern aldrig får två rader.
    if (punchLock.current) return;
    punchLock.current = true;
    setBusy(true);
    setError(null);
    const occurredAt = new Date().toISOString();
    if (!punchIdRef.current) punchIdRef.current = crypto.randomUUID();
    const context = {
      clientPunchId: punchIdRef.current,
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
      if (res.status === "pending_registration" || !res.entry) {
        setPending(res.message ?? "Registrering väntar på godkännande.");
        setIdentifier("");
        return;
      }
      showReceipt(res.employee?.first_name ?? name, action, res.entry.occurred_at);
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
      punchLock.current = false;
    }
  };

  const handleSwitchAllocation = async () => {
    const value = identifier.replace(/\s/g, "");
    if (!value || !found || !activeSite) {
      setError("Välj driftställe innan du byter kostnadsställe.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await switchAllocation(value, activeSite.id);
      setReceipt({ name: res.employee.first_name, action: "in", at: new Date().toISOString() });
      reset();
      setTimeout(() => setReceipt(null), 3000);
      void refreshOnSite();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte byta kostnadsställe");
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
            readOnly
            value={code}
            placeholder="AKTIVERINGSKOD"
            aria-label="Aktiveringskod"
          />
          {/* Kassaskärmen har inget tangentbord: koden slås in på skärmen. */}
          <div className="grid grid-cols-6 gap-2">
            {CODE_KEYS.map((k) => (
              <IndustryButton
                key={k}
                variant="secondary"
                className="min-h-[60px] text-xl"
                onClick={() => setCode((v) => (v.length >= 24 ? v : v + k))}
              >
                {k}
              </IndustryButton>
            ))}
            <IndustryButton variant="ghost" className="col-span-3 min-h-[60px]" onClick={() => setCode((v) => v.slice(0, -1))}>
              Radera
            </IndustryButton>
            <IndustryButton variant="ghost" className="col-span-3 min-h-[60px]" onClick={() => setCode("")}>
              Rensa
            </IndustryButton>
          </div>
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
        <header className="grid items-center gap-3 pb-6 sm:grid-cols-[1fr_auto_1fr]">
          <div>
            <SectionLabel>{station?.name ?? "Stämpelklocka"}</SectionLabel>
            <p className="ind-h3">{station?.store_name ?? "Försäljningsställe"}</p>
          </div>
          <div className="text-center">
            <p className="ind-clock" aria-label="Aktuell tid">
              {now.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
            </p>
            <p className="ind-muted text-sm">
              {now.toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
          <span />
        </header>

        {!online && (
          <div className="ind-row ind-row--edge-alert mb-4">
            <StatusLabel tone="alert">Offline</StatusLabel>
            <span className="text-sm">Stämplingarna sparas i enheten och skickas när nätet är tillbaka.</span>
            {queued > 0 && <span className="ind-muted text-sm ind-mono">{queued} i kö</span>}
          </div>
        )}
        {online && queued > 0 && (
          <div className="ind-row ind-row--edge-accent-2 mb-4">
            <StatusLabel tone="progress">Synkar</StatusLabel>
            <span className="text-sm ind-mono">{queued} köade stämplingar skickas</span>
          </div>
        )}


        {workSites.length > 1 && (
          <div className="mb-4 space-y-2">
            <SectionLabel>Driftställe · kostnadsställe</SectionLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {workSites.map((site) => (
                <IndustryButton
                  key={site.id}
                  variant={activeSite?.id === site.id ? "primary" : "secondary"}
                  size="touch"
                  onClick={() => setSiteId(site.id)}
                >
                  <span className="flex flex-col items-start leading-tight">
                    <span>{site.name}</span>
                    <span className="ind-mono text-xs opacity-70">{site.posting_cost_center}</span>
                  </span>
                </IndustryButton>
              ))}
            </div>
          </div>
        )}



        {receipt ? (
          <div className="ind-accent-surface p-8 space-y-2">
            <SectionLabel>{ACTION_LABEL[receipt.action]} registrerad</SectionLabel>
            <p className="ind-h1">{receipt.name}</p>
            <p className="ind-h3 ind-mono">{timeOf(receipt.at)}</p>
            {/* Tydligt läge efteråt: personalen ska se att passet är igång. */}
            <p className="ind-h3">{RECEIPT_STATE[receipt.action]}</p>
            <p className="ind-muted text-sm">
              Slå in personnummret igen när du ska {receipt.action === "ut" ? "stämpla in nästa gång" : "ta rast eller stämpla ut"}.
            </p>
            {receipt.offline && (
              <p className="ind-muted text-sm">Sparad i offline-kön och syncas när nätet är tillbaka.</p>
            )}
          </div>
        ) : found ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="ind-h2">
                Hej {found.first_name} {found.pnr_masked ? `(${found.pnr_masked})` : ""}
              </h2>
              {/* Nuläget i klartext innan man trycker: in, på rast eller ute. */}
              <div className={`ind-row ${found.suggested === "in" ? "ind-row--edge-neutral" : "ind-row--edge-accent"}`}>
                <StatusLabel tone={found.suggested === "in" ? "neutral" : "ok"}>
                  {found.suggested === "in" ? "Inte instämplad" : found.suggested === "rast_slut" ? "På rast" : "Instämplad"}
                </StatusLabel>
                <span className="text-sm">{FOUND_STATE[found.suggested]}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {VALID_ACTIONS[found.suggested].includes("in") && (
                <IndustryButton variant={found.suggested === "in" ? "primary" : "secondary"} size="kiosk" corners onClick={() => handlePunch("in")} disabled={busy}>IN</IndustryButton>
              )}
              {VALID_ACTIONS[found.suggested].includes("ut") && (
                <IndustryButton variant={found.suggested === "ut" ? "primary" : "secondary"} size="kiosk" corners={found.suggested === "ut"} onClick={() => handlePunch("ut")} disabled={busy}>UT</IndustryButton>
              )}
              {breaksEnabled && VALID_ACTIONS[found.suggested].includes("rast_start") && (
                <IndustryButton variant={found.suggested === "rast_start" ? "primary" : "secondary"} size="kiosk" corners={found.suggested === "rast_start"} onClick={() => handlePunch("rast_start")} disabled={busy}>Rast börjar</IndustryButton>
              )}
              {VALID_ACTIONS[found.suggested].includes("rast_slut") && (
                <IndustryButton variant="primary" size="kiosk" corners onClick={() => handlePunch("rast_slut")} disabled={busy}>Rast slutar</IndustryButton>
              )}
            </div>
            {workSites.length > 1 && (
              <div className="space-y-2 border-t border-[var(--color-divider)] pt-4">
                <SectionLabel>Byt kostnadsställe under pågående pass</SectionLabel>
                <IndustryButton variant="secondary" size="touch" onClick={handleSwitchAllocation} disabled={busy || !activeSite}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Byt till valt driftställe"}
                </IndustryButton>
              </div>
            )}
            <IndustryButton variant="ghost" size="touch" onClick={reset}>Avbryt</IndustryButton>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="text-center">
              <SectionLabel>Stämpla</SectionLabel>
              <h2 className="ind-h2">Personnummer eller kortnummer</h2>
            </div>
            {/* Readonly: enhetens virtuella tangentbord ska aldrig kunna öppnas. */}
            <IndustryInput
              kiosk
              readOnly
              tabIndex={-1}
              value={maskedDisplay(identifier)}
              placeholder="ÅÅMMDD XXXX"
              aria-label="Personnummer (maskerat)"
            />
            <p className="ind-muted text-center text-sm ind-mono">{identifier.length} av 10 siffror</p>
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
            {/* Sifferknappsats: minst 60×60 px, ingen precision krävs. */}
            <div className="mx-auto grid max-w-md grid-cols-3 gap-3">
              {DIGIT_KEYS.map((d) => (
                <IndustryButton
                  key={d}
                  variant="secondary"
                  className="min-h-[76px] min-w-[76px] text-3xl ind-mono"
                  onClick={() => pressDigit(d)}
                  aria-label={`Siffra ${d}`}
                >
                  {d}
                </IndustryButton>
              ))}
              <IndustryButton variant="ghost" className="min-h-[76px] min-w-[76px] text-base" onClick={pressBackspace} aria-label="Radera senaste siffra">
                Radera
              </IndustryButton>
              <IndustryButton
                variant="secondary"
                className="min-h-[76px] min-w-[76px] text-3xl ind-mono"
                onClick={() => pressDigit("0")}
                aria-label="Siffra 0"
              >
                0
              </IndustryButton>
              <IndustryButton variant="ghost" className="min-h-[76px] min-w-[76px] text-base" onClick={pressClear} aria-label="Rensa allt">
                Rensa
              </IndustryButton>
            </div>
            <IndustryButton
              variant="primary"
              size="kiosk"
              corners
              className="w-full"
              onClick={handleLookup}
              disabled={busy || (identifier.length !== 10 && identifier.length !== 12)}
            >
              {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : "FORTSÄTT"}
            </IndustryButton>
          </div>
        )}

        <footer className="mt-8 pt-4" style={{ borderTop: "1px solid var(--color-divider)" }}>
          {/* Fel aktivering ska synas direkt: stationens enhet står alltid längst ned. */}
          <div className="mb-4 flex flex-wrap items-baseline gap-2">
            <SectionLabel>Den här stationen tillhör</SectionLabel>
            <span className="ind-h3">{station?.store_name ?? "Ingen enhet vald"}</span>
            <span className="ind-muted text-sm">
              {station?.name ? `· ${station.name}` : ""}
            </span>
            <span className="ind-muted ml-auto text-sm">
              Fel butik? Säg till kontoret — stationen flyttas där.
            </span>
          </div>
          <SectionLabel>På plats nu</SectionLabel>
          {onSite.length === 0 ? (
            <p className="ind-muted text-sm">Ingen är instämplad.</p>
          ) : (
            <ul className="space-y-1">
              {onSite.map((p) => (
                <li key={`${p.first_name}-${p.since}`} className="text-sm">
                  <span className="font-medium">{`${p.first_name} ${p.initial}.`}</span>{" "}
                  <span className="ind-muted">
                    {p.on_break ? "på rast sedan" : "instämplad sedan"}{" "}
                    <span className="ind-mono">{timeOf(p.since)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </footer>
      </div>
    </IndustryFrame>
  );
}
